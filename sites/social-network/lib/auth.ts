import {
  ApiError,
  all,
  first,
  run,
  now,
  newId,
  email,
  text,
  username,
  type Bindings,
  type Identity,
  type User,
} from './data';

const encoder = new TextEncoder();
export function base64url(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0),
  );
}
export async function digest(value: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const result = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: 100_000, salt: new Uint8Array(salt) },
    key,
    256,
  );
  return base64url(new Uint8Array(result));
}
export async function passwordHash(password: unknown): Promise<string> {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128)
    throw new ApiError(400, 'La contraseña debe tener entre 12 y 128 caracteres.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$100000$${base64url(salt)}$${await derive(password, salt)}`;
}
export async function checkPassword(password: unknown, stored: string | null): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 128) return false;
  const parts = (
    stored ??
    'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  ).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256' || parts[1] !== '100000') return false;
  const candidate = await derive(password, decode(parts[2]));
  let mismatch = candidate.length ^ parts[3].length;
  for (let i = 0; i < candidate.length; i++)
    mismatch |= candidate.charCodeAt(i) ^ (parts[3].charCodeAt(i) || 0);
  return stored !== null && mismatch === 0;
}
export type Session = {
  hash: string;
  user_id: string;
  auth_method: string;
  created_at: number;
  expires_at: number;
};
export type Actor = { user: User; session: Session } | null;
export async function actor(db: D1Database, request: Request): Promise<Actor> {
  const bearer = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  const cookie = request.headers
    .get('cookie')
    ?.match(/(?:^|;\s*)sn_session=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
  const token = bearer ?? cookie;
  if (!token) return null;
  const session = await first<Session>(
    db,
    'SELECT * FROM sessions WHERE hash=? AND expires_at>?',
    await digest(token),
    now(),
  );
  if (!session) return null;
  const user = await first<User>(
    db,
    'SELECT * FROM users WHERE id=? AND suspended=0',
    session.user_id,
  );
  return user ? { user, session } : null;
}
export function requireActor(value: Actor) {
  if (!value) throw new ApiError(401, 'Inicia sesión para continuar.');
  return value;
}
export async function createSession(db: D1Database, userId: string, method = 'password') {
  const token = randomToken();
  const created = now();
  await run(
    db,
    'INSERT INTO sessions(hash,user_id,auth_method,created_at,expires_at) VALUES(?,?,?,?,?)',
    await digest(token),
    userId,
    method,
    created,
    created + 30 * 86400_000,
  );
  return token;
}
export function sessionCookie(request: Request, token = '', clear = false): string {
  // Android bundles its UI at https://localhost. Keep the session HttpOnly in
  // the WebView's cookie jar instead of persisting a bearer token in JS storage.
  const native = request.headers.get('origin') === 'https://localhost';
  return `sn_session=${token}; HttpOnly; SameSite=${native ? 'None' : 'Lax'}; Path=/; Max-Age=${clear ? 0 : 30 * 86400}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export async function limit(
  db: D1Database,
  key: string,
  maximum: number,
  period = 60_000,
): Promise<void> {
  const hashed = await digest(key);
  const current = now();
  const row = await first<{ count: number }>(
    db,
    'INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count',
    hashed,
    current + period,
    current,
    current,
  );
  if (!row || row.count > maximum)
    throw new ApiError(429, 'Demasiados intentos. Espera unos minutos antes de continuar.');
}
export async function signup(db: D1Database, body: Record<string, unknown>): Promise<User> {
  const address = email(body.email);
  const handle = username(body.username);
  const display = text(body.displayName, 1, 80);
  if (body.termsAccepted !== true)
    throw new ApiError(400, 'Debes aceptar los términos y las normas de comunidad.');
  if (body.ageConfirmed !== true)
    throw new ApiError(400, 'Social Network está dirigido a personas de 18 años o más.');
  if (await first(db, 'SELECT 1 FROM users WHERE email=? OR username=?', address, handle))
    throw new ApiError(409, 'El correo o el nombre de usuario ya está registrado.');
  const hash = await passwordHash(body.password);
  const userId = newId();
  const created = now();
  try {
    await db.batch([
      db
        .prepare(
          'INSERT INTO users(id,email,username,display_name,terms_accepted_at,created_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(userId, address, handle, display, created, created),
      db.prepare('INSERT INTO credentials(user_id,password_hash) VALUES(?,?)').bind(userId, hash),
    ]);
  } catch {
    throw new ApiError(409, 'El correo o el nombre de usuario ya está registrado.');
  }
  return (await first<User>(db, 'SELECT * FROM users WHERE id=?', userId))!;
}
export async function login(db: D1Database, body: Record<string, unknown>): Promise<User> {
  const address = email(body.email);
  const row = await first<User & { password_hash: string }>(
    db,
    'SELECT u.*,c.password_hash FROM users u JOIN credentials c ON c.user_id=u.id WHERE u.email=?',
    address,
  );
  if (!(await checkPassword(body.password, row?.password_hash ?? null)) || !row || row.suspended)
    throw new ApiError(401, 'Correo o contraseña incorrectos.');
  return row;
}

type Flow = {
  id: string;
  challenge: string;
  state: string;
  native: number;
  terms_accepted: number;
  user_id: string | null;
  expires_at: number;
};
export async function startChatGPT(
  db: D1Database,
  request: Request,
  body: Record<string, unknown>,
  current: Actor,
) {
  const challenge = text(body.challenge, 43, 43);
  const state = text(body.state, 32, 80);
  if (!/^[A-Za-z0-9_-]+$/.test(challenge + state))
    throw new ApiError(400, 'Solicitud de acceso inválida.');
  const userId = body.link === true ? requireActor(current).user.id : null;
  const flow = newId();
  await run(
    db,
    'INSERT INTO login_flows(id,challenge,state,native,terms_accepted,user_id,expires_at) VALUES(?,?,?,?,?,?,?)',
    flow,
    challenge,
    state,
    body.native === true ? 1 : 0,
    body.termsAccepted === true && body.ageConfirmed === true ? 1 : 0,
    userId,
    now() + 5 * 60_000,
  );
  return { url: new URL(`/api/auth/chatgpt?flow=${flow}`, request.url).href };
}

export async function completeChatGPT(
  db: D1Database,
  env: Bindings,
  request: Request,
  identity: Identity,
): Promise<Response> {
  const url = new URL(request.url);
  const flowId = url.searchParams.get('flow') ?? '';
  const flow = await first<Flow>(
    db,
    'SELECT * FROM login_flows WHERE id=? AND expires_at>?',
    flowId,
    now(),
  );
  if (!flow) throw new ApiError(400, 'El acceso caducó. Vuelve a iniciarlo desde Social Network.');
  if (!identity) {
    const returnTo = `/api/auth/chatgpt?flow=${encodeURIComponent(flowId)}`;
    return Response.redirect(
      new URL(`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`, url.origin).href,
      303,
    );
  }
  const address = email(identity.email);
  let user = await first<User>(db, 'SELECT * FROM users WHERE chatgpt_id=?', identity.userId);
  if (flow.user_id) {
    const existing = await first<User>(
      db,
      'SELECT * FROM users WHERE id=? AND suspended=0',
      flow.user_id,
    );
    if (!existing || existing.email !== address || (user && user.id !== existing.id))
      throw new ApiError(409, 'ChatGPT debe usar el mismo correo que tu cuenta de Social Network.');
    const admin = (env.ADMIN_EMAILS ?? '')
      .toLowerCase()
      .split(',')
      .map((v) => v.trim())
      .includes(address);
    await run(
      db,
      'UPDATE users SET chatgpt_id=?,role=? WHERE id=?',
      identity.userId,
      admin ? 'admin' : existing.role,
      existing.id,
    );
    user = { ...existing, chatgpt_id: identity.userId };
  } else if (!user) {
    if (await first(db, 'SELECT 1 FROM users WHERE email=?', address))
      throw new ApiError(
        409,
        'Este correo ya tiene cuenta. Entra con contraseña y vincula ChatGPT desde Ajustes.',
      );
    if (!flow.terms_accepted)
      throw new ApiError(
        400,
        'Acepta los términos y las normas antes de crear tu cuenta con ChatGPT.',
      );
    const userId = newId();
    const handle = `persona_${userId.replaceAll('-', '').slice(0, 12)}`;
    const admin = (env.ADMIN_EMAILS ?? '')
      .toLowerCase()
      .split(',')
      .map((v) => v.trim())
      .includes(address);
    const created = now();
    await run(
      db,
      'INSERT INTO users(id,email,username,display_name,chatgpt_id,role,terms_accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?)',
      userId,
      address,
      handle,
      identity.displayName.slice(0, 80),
      identity.userId,
      admin ? 'admin' : 'user',
      created,
      created,
    );
    user = (await first<User>(db, 'SELECT * FROM users WHERE id=?', userId))!;
  }
  if (user.suspended)
    throw new ApiError(
      403,
      'Esta cuenta está suspendida. Contacta con soporte para solicitar una revisión.',
    );
  const code = randomToken();
  await run(
    db,
    'INSERT INTO auth_codes(hash,flow_id,user_id,expires_at) VALUES(?,?,?,?) ON CONFLICT(flow_id) DO UPDATE SET hash=excluded.hash,expires_at=excluded.expires_at',
    await digest(code),
    flow.id,
    user.id,
    now() + 2 * 60_000,
  );
  const destination = flow.native
    ? `socialnetwork://auth?code=${code}&state=${flow.state}`
    : `${url.origin}/?auth_code=${code}&state=${flow.state}`;
  if (!flow.native) return Response.redirect(destination, 303);
  return new Response(
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Volver a Social Network</title><style>body{font-family:system-ui;max-width:480px;margin:12vh auto;padding:24px;color:#19221e}a{display:block;background:#ee6036;color:white;padding:16px;border-radius:12px;text-align:center;text-decoration:none}</style><h1>Ya puedes volver</h1><p>Tu identidad de ChatGPT está verificada. Continúa en la app para terminar el acceso.</p><a href="${destination}">Volver a Social Network</a></html>`,
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}

export async function exchangeCode(db: D1Database, body: Record<string, unknown>): Promise<string> {
  const code = text(body.code, 43, 43);
  const verifier = text(body.verifier, 43, 128);
  const state = text(body.state, 32, 80);
  if (!/^[A-Za-z0-9_-]+$/.test(code + verifier + state))
    throw new ApiError(400, 'Código de acceso inválido.');
  const hash = await digest(code);
  const flow = await first<{ challenge: string; state: string; user_id: string; flow_id: string }>(
    db,
    'SELECT f.challenge,f.state,c.user_id,c.flow_id FROM auth_codes c JOIN login_flows f ON f.id=c.flow_id JOIN users u ON u.id=c.user_id WHERE c.hash=? AND c.expires_at>? AND f.expires_at>? AND u.suspended=0',
    hash,
    now(),
    now(),
  );
  if (!flow || state !== flow.state || (await digest(verifier)) !== flow.challenge)
    throw new ApiError(401, 'El código no es válido o ha caducado.');
  const consumed = await first(
    db,
    'DELETE FROM auth_codes WHERE hash=? AND expires_at>? RETURNING user_id',
    hash,
    now(),
  );
  if (!consumed) throw new ApiError(401, 'Este código ya se utilizó.');
  await run(db, 'DELETE FROM login_flows WHERE id=?', flow.flow_id);
  return createSession(db, flow.user_id, 'chatgpt');
}

export async function cleanExpired(db: D1Database): Promise<void> {
  const current = now();
  await db.batch([
    db
      .prepare(
        'DELETE FROM sessions WHERE hash IN (SELECT hash FROM sessions WHERE expires_at<=? LIMIT 100)',
      )
      .bind(current),
    db
      .prepare(
        'DELETE FROM login_flows WHERE id IN (SELECT id FROM login_flows WHERE expires_at<=? LIMIT 100)',
      )
      .bind(current),
    db
      .prepare(
        'DELETE FROM auth_codes WHERE hash IN (SELECT hash FROM auth_codes WHERE expires_at<=? LIMIT 100)',
      )
      .bind(current),
    db
      .prepare(
        'DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at<=? LIMIT 100)',
      )
      .bind(current),
    db
      .prepare(
        'DELETE FROM realtime_outbox WHERE id IN (SELECT id FROM realtime_outbox WHERE created_at<? LIMIT 100)',
      )
      .bind(current - 86400_000),
    db
      .prepare(
        "DELETE FROM deletion_requests WHERE id IN (SELECT id FROM deletion_requests WHERE status='closed' AND created_at<? LIMIT 100)",
      )
      .bind(current - 30 * 86400_000),
    db
      .prepare(
        "DELETE FROM reports WHERE id IN (SELECT id FROM reports WHERE status<>'open' AND created_at<? LIMIT 100)",
      )
      .bind(current - 90 * 86400_000),
  ]);
}
