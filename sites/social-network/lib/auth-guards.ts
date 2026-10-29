import { checkPassword, requireActor, type Actor } from './auth';
import { ApiError, first, now } from './data';

export function moderator(current: Actor) {
  const a = requireActor(current);
  if (!['admin', 'moderator'].includes(a.user.role))
    throw new ApiError(403, 'Esta acción requiere moderación.');
  return a;
}
export async function reauthenticate(
  db: D1Database,
  current: NonNullable<Actor>,
  password: unknown,
) {
  const credential = await first<{ password_hash: string }>(
    db,
    'SELECT password_hash FROM credentials WHERE user_id=?',
    current.user.id,
  );
  const freshChatGPT =
    current.session.auth_method === 'chatgpt' && current.session.created_at > now() - 5 * 60_000;
  if (!freshChatGPT && (!credential || !(await checkPassword(password, credential.password_hash))))
    throw new ApiError(
      403,
      'Confirma tu contraseña o vuelve a entrar con ChatGPT antes de continuar.',
    );
}
