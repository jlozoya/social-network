export type Bindings = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  ADMIN_EMAILS?: string;
  ABLY_API_KEY?: string;
};
export type Identity = { userId: string; email: string; displayName: string } | null;
export type User = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_key: string | null;
  cover_key: string | null;
  chatgpt_id: string | null;
  private: number;
  role: string;
  suspended: number;
  created_at: number;
};
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function database(env: Bindings): D1Database {
  if (!env.DB) throw new ApiError(503, 'El servicio de datos no está disponible.');
  return env.DB;
}
export async function first<T>(db: D1Database, sql: string, ...args: unknown[]): Promise<T | null> {
  return db
    .prepare(sql)
    .bind(...args)
    .first<T>();
}
export async function all<T>(db: D1Database, sql: string, ...args: unknown[]): Promise<T[]> {
  return (
    await db
      .prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
}
export async function run(db: D1Database, sql: string, ...args: unknown[]) {
  return db
    .prepare(sql)
    .bind(...args)
    .run();
}
export function text(value: unknown, min = 0, max = 5000): string {
  if (typeof value !== 'string') throw new ApiError(400, 'Revisa los campos del formulario.');
  const result = value.trim();
  if (result.length < min || result.length > max)
    throw new ApiError(400, `El texto debe tener entre ${min} y ${max} caracteres.`);
  return result;
}
export function id(value: unknown): string {
  const result = text(value, 1, 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new ApiError(400, 'Identificador inválido.');
  return result;
}
export function email(value: unknown): string {
  const result = text(value, 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw new ApiError(400, 'Escribe un correo válido.');
  return result;
}
export function username(value: unknown): string {
  const result = text(value, 3, 30).toLowerCase();
  if (!/^[a-z0-9_]+$/.test(result))
    throw new ApiError(400, 'El usuario admite letras sin acentos, números y guion bajo.');
  return result;
}
export const now = () => Date.now();
export const newId = () => crypto.randomUUID();
export async function blocked(db: D1Database, a: string, b: string): Promise<boolean> {
  return !!(await first(
    db,
    'SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)',
    a,
    b,
    b,
    a,
  ));
}
export async function visibleUser(
  db: D1Database,
  userId: string,
  viewer: User | null,
): Promise<User> {
  const user = await first<User>(db, 'SELECT * FROM users WHERE id=? AND suspended=0', userId);
  if (!user || (viewer && (await blocked(db, viewer.id, userId))))
    throw new ApiError(404, 'Perfil no disponible.');
  return user;
}
export async function publicUser(db: D1Database, user: User, viewer: User | null) {
  const counts = await first<{ followers: number; following: number }>(
    db,
    "SELECT (SELECT count(*) FROM follows WHERE followee_id=? AND status='accepted') followers,(SELECT count(*) FROM follows WHERE follower_id=? AND status='accepted') following",
    user.id,
    user.id,
  );
  const follow = viewer
    ? await first<{ status: string }>(
        db,
        'SELECT status FROM follows WHERE follower_id=? AND followee_id=?',
        viewer.id,
        user.id,
      )
    : null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    bio: user.bio,
    avatarUrl: user.avatar_key ? `/media/${user.avatar_key}` : null,
    coverUrl: user.cover_key ? `/media/${user.cover_key}` : null,
    isPrivate: !!user.private,
    followerCount: counts?.followers ?? 0,
    followingCount: counts?.following ?? 0,
    followState: follow?.status ?? null,
    createdAt: new Date(user.created_at).toISOString(),
    ...(viewer?.id === user.id
      ? { email: user.email, role: user.role, chatgptLinked: !!user.chatgpt_id }
      : {}),
  };
}
export const SUPPORT_EMAIL = 'jlozoya1995+socialnetwork@gmail.com';
