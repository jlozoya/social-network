import {
  completeChatGPT,
  createSession,
  exchangeCode,
  limit,
  login,
  sessionCookie,
  signup,
  startChatGPT,
} from '../auth';
import { ApiError, first, publicUser, run } from '../data';
import { bodyOf, json, type RouteHandler, type SignedRequestContext } from '../http';
import { boundedBody } from '../media';
import { ablyTokenRequest } from '../realtime';

export const handleAuthPublic: RouteHandler = async ({
  request,
  env,
  identity,
  url,
  path,
  method,
  db,
  current,
  user,
  ip,
}) => {
  if (method === 'GET' && path === '/api/health') {
    await first(db, 'SELECT 1');
    return json({
      status: 'ok',
      database: 'up',
      storage: env.BUCKET ? 'configured' : 'unavailable',
      version: 'sites-social-beta',
    });
  }
  if (method === 'GET' && path === '/api/session')
    return json({ user: user ? await publicUser(db, user, user) : null });
  if (method === 'GET' && path === '/api/realtime/status')
    return json({ configured: !!env.ABLY_API_KEY });
  if (method === 'GET' && path === '/api/auth/chatgpt')
    return completeChatGPT(db, env, request, identity);
  if (method === 'POST' && path === '/api/auth/chatgpt') {
    if (request.headers.get('origin') !== url.origin)
      throw new ApiError(403, 'Vuelve a iniciar el acceso desde Social Network.');
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
      throw new ApiError(415, 'Envía el formulario de creación de cuenta.');
    const form = new URLSearchParams(new TextDecoder().decode(await boundedBody(request, 4096)));
    return completeChatGPT(db, env, request, identity, form.get('consent') === 'accepted');
  }
  if (method === 'POST' && path === '/api/auth/start') {
    await limit(db, `auth-start:${ip}`, 20, 15 * 60_000);
    const navigation = request.headers
      .get('content-type')
      ?.startsWith('application/x-www-form-urlencoded');
    let body: Record<string, unknown>;
    if (navigation) {
      body = Object.fromEntries(
        new URLSearchParams(new TextDecoder().decode(await boundedBody(request, 4096))),
      );
      for (const key of ['link', 'termsAccepted', 'ageConfirmed']) body[key] = body[key] === 'true';
      body.native = false;
    } else {
      body = await bodyOf(request);
    }
    const started = await startChatGPT(db, request, body, current);
    return navigation ? Response.redirect(started.url, 303) : json(started);
  }
  if (method === 'POST' && path === '/api/auth/exchange') {
    await limit(db, `auth-exchange:${ip}`, 30, 15 * 60_000);
    const token = await exchangeCode(db, await bodyOf(request));
    return json({ token }, 200, { 'set-cookie': sessionCookie(request, token) });
  }
  if (method === 'POST' && (path === '/api/auth/signup' || path === '/api/auth/login')) {
    const body = await bodyOf(request);
    await limit(db, `auth-ip:${ip}`, 30, 15 * 60_000);
    await limit(db, `auth-email:${String(body.email).toLowerCase()}`, 10, 15 * 60_000);
    const authenticated = path.endsWith('signup') ? await signup(db, body) : await login(db, body);
    const token = await createSession(db, authenticated.id);
    return json({ user: await publicUser(db, authenticated, authenticated), token }, 200, {
      'set-cookie': sessionCookie(request, token),
    });
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    if (current) await run(db, 'DELETE FROM sessions WHERE hash=?', current.session.hash);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', true) });
  }
  return undefined;
};

export const handleAuth: RouteHandler<SignedRequestContext> = async ({
  env,
  path,
  method,
  db,
  signed,
}) => {
  if (method === 'POST' && path === '/api/realtime/token') {
    await limit(db, `ably-auth:${signed.user.id}`, 30, 15 * 60_000);
    return json(await ablyTokenRequest(env, signed.user.id));
  }
  return undefined;
};
