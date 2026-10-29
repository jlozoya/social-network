import { actor, cleanExpired, limit, requireActor } from './auth';
import { all, ApiError, database, type Bindings, type Identity } from './data';
import { json, type RequestContext } from './http';
import { drainMediaDeletes } from './media';
import { enqueueRealtime, flushRealtime, realtimeSnapshot } from './realtime';
import { handleAccount, handleAccountPublic } from './routes/account';
import { handleAuth, handleAuthPublic } from './routes/auth';
import { handleChat } from './routes/chat';
import { handleMedia, handleMediaPublic } from './routes/media';
import { handleModeration } from './routes/moderation';
import { handlePeople, handlePeoplePublic } from './routes/people';
import { handlePosts, handlePostsPublic } from './routes/posts';

const publicRoutes = [
  handleAuthPublic,
  handleAccountPublic,
  handleMediaPublic,
  handlePostsPublic,
  handlePeoplePublic,
];
const signedRoutes = [
  handleAccount,
  handleMedia,
  handlePosts,
  handlePeople,
  handleChat,
  handleModeration,
];

async function route(request: Request, env: Bindings, identity: Identity): Promise<Response> {
  const url = new URL(request.url);
  const db = database(env);
  const current = await actor(db, request);
  const context: RequestContext = {
    request,
    env,
    identity,
    url,
    path: url.pathname.replace(/\/$/, ''),
    method: request.method,
    db,
    current,
    user: current?.user ?? null,
    ip: request.headers.get('cf-connecting-ip') ?? 'local',
  };
  for (const handler of publicRoutes) {
    const response = await handler(context);
    if (response) return response;
  }
  const signed = requireActor(current);
  const authResponse = await handleAuth({ ...context, signed });
  if (authResponse) return authResponse;
  const { method } = context;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    await limit(db, `mutations:${signed.user.id}`, 120);
    await drainMediaDeletes(db, env);
    await cleanExpired(db);
  }
  for (const handler of signedRoutes) {
    const response = await handler({ ...context, signed });
    if (response) return response;
  }
  throw new ApiError(404, 'Esta función no está disponible en la versión de Sites.');
}

export async function handleApi(
  request: Request,
  env: Bindings,
  identity: Identity = null,
): Promise<Response> {
  const url = new URL(request.url),
    origin = request.headers.get('origin');
  const allowed = new Set([url.origin, 'https://localhost', 'capacitor://localhost']);
  if (origin && !allowed.has(origin)) return json({ error: 'Origen no permitido.' }, 403);
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    request.headers.has('cookie') &&
    !origin
  )
    return json({ error: 'Falta el origen del formulario.' }, 403);
  if (request.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': origin ?? url.origin,
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'Content-Type,Authorization',
        'access-control-allow-credentials': 'true',
        vary: 'Origin',
      },
    });
  let response: Response;
  try {
    const mutation =
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !url.pathname.startsWith('/api/auth/') &&
      url.pathname !== '/api/realtime/token' &&
      !url.pathname.endsWith('/read');
    const before =
      mutation && env.DB && env.ABLY_API_KEY
        ? await realtimeSnapshot(env.DB, url.pathname, await actor(env.DB, request))
        : null;
    response = await route(request, env, identity);
    if (response.ok && env.DB && env.ABLY_API_KEY) {
      try {
        if (before) {
          if (url.pathname === '/api/conversations') {
            const result = (await response.clone().json()) as { id: string };
            const peers = await all<{ user_id: string }>(
              env.DB,
              'SELECT user_id FROM members WHERE conversation_id=?',
              result.id,
            );
            for (const peer of peers) before.channels.push(`sn:user:${peer.user_id}`);
          }
          await enqueueRealtime(env.DB, before.channels);
        }
        await flushRealtime(env.DB, env);
      } catch {
        /* El cambio ya está guardado. La siguiente petición reintentará los avisos pendientes. */
      }
    }
  } catch (error) {
    const status =
      error instanceof ApiError
        ? error.status
        : String(error).includes('UNIQUE constraint failed')
          ? 409
          : 500;
    const message =
      error instanceof ApiError
        ? error.message
        : status === 409
          ? 'Este dato ya está registrado.'
          : 'No se pudo completar la operación. Inténtalo de nuevo.';
    if (
      url.pathname === '/api/auth/chatgpt' ||
      (url.pathname === '/api/auth/start' &&
        request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
    ) {
      const escaped = message
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
      response = new Response(
        `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Acceso · Social Network</title><body style="font:18px system-ui;max-width:600px;margin:15vh auto;padding:24px"><h1>No se pudo completar el acceso</h1><p>${escaped}</p><a href="/">Volver a Social Network</a></body></html>`,
        { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    } else response = json({ error: message }, status);
  }
  const headers = new Headers(response.headers);
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  if (!headers.has('referrer-policy')) headers.set('referrer-policy', 'no-referrer');
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-credentials', 'true');
    headers.append('vary', 'Origin');
  }
  return new Response(response.body, { status: response.status, headers });
}
