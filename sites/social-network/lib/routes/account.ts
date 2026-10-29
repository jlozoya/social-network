import { limit, passwordHash, sessionCookie } from '../auth';
import { reauthenticate } from '../auth-guards';
import { ApiError, email, first, id, newId, now, run, text, username, type User } from '../data';
import { bodyOf, json, type RouteHandler, type SignedRequestContext } from '../http';
import { drainMediaDeletes, queueUnusedMedia } from '../media';
import { profile } from '../social';

export const handleAccountPublic: RouteHandler = async ({ request, path, method, db, ip }) => {
  if (method === 'POST' && path === '/api/deletion-requests') {
    await limit(db, `deletion-request:${ip}`, 3, 86400_000);
    const body = await bodyOf(request);
    await run(
      db,
      'INSERT INTO deletion_requests(id,email,note,created_at) VALUES(?,?,?,?)',
      newId(),
      email(body.email),
      text(body.note ?? '', 0, 500),
      now(),
    );
    return json(
      {
        ok: true,
        message: 'Solicitud registrada. Soporte comprobará tu identidad antes de eliminar datos.',
      },
      201,
    );
  }
  return undefined;
};

export const handleAccount: RouteHandler<SignedRequestContext> = async ({
  request,
  env,
  path,
  method,
  db,
  signed,
}) => {
  if (method === 'PATCH' && path === '/api/account') {
    const body = await bodyOf(request);
    const handle = body.username === undefined ? signed.user.username : username(body.username);
    const display =
      body.displayName === undefined ? signed.user.display_name : text(body.displayName, 1, 80);
    const bio = body.bio === undefined ? signed.user.bio : text(body.bio, 0, 500);
    if (body.isPrivate !== undefined && typeof body.isPrivate !== 'boolean')
      throw new ApiError(400, 'Revisa la privacidad de tu cuenta.');
    let avatar = signed.user.avatar_key,
      cover = signed.user.cover_key;
    for (const [field, kind] of [
      ['avatarMediaId', 'avatar'],
      ['coverMediaId', 'cover'],
    ] as const) {
      if (body[field] === undefined) continue;
      let key: string | null = null;
      if (body[field] !== null) {
        const photo = await first<{ key: string }>(
          db,
          'SELECT key FROM media WHERE id=? AND owner_id=?',
          id(body[field]),
          signed.user.id,
        );
        if (!photo) throw new ApiError(400, 'Foto no disponible.');
        key = photo.key;
      }
      if (kind === 'avatar') avatar = key;
      else cover = key;
    }
    await run(
      db,
      'UPDATE users SET username=?,display_name=?,bio=?,private=?,avatar_key=?,cover_key=? WHERE id=?',
      handle,
      display,
      bio,
      body.isPrivate === undefined ? signed.user.private : body.isPrivate ? 1 : 0,
      avatar,
      cover,
      signed.user.id,
    );
    await queueUnusedMedia(
      db,
      signed.user.id,
      [signed.user.avatar_key, signed.user.cover_key].filter(
        (k): k is string => !!k && k !== avatar && k !== cover,
      ),
    );
    return json(
      await profile(
        db,
        signed.user.id,
        (await first<User>(db, 'SELECT * FROM users WHERE id=?', signed.user.id))!,
      ),
    );
  }
  if (method === 'POST' && path === '/api/account/password') {
    const body = await bodyOf(request);
    await reauthenticate(db, signed, body.currentPassword);
    const hash = await passwordHash(body.password);
    await db.batch([
      db
        .prepare(
          'INSERT INTO credentials(user_id,password_hash) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash',
        )
        .bind(signed.user.id, hash),
      db
        .prepare('DELETE FROM sessions WHERE user_id=? AND hash<>?')
        .bind(signed.user.id, signed.session.hash),
    ]);
    return json({ ok: true });
  }
  if (method === 'DELETE' && path === '/api/account') {
    const body = await bodyOf(request);
    await reauthenticate(db, signed, body.password);
    if (body.confirmation !== signed.user.username)
      throw new ApiError(400, 'Escribe tu nombre de usuario para confirmar.');
    await db.batch([
      db
        .prepare(
          'INSERT INTO pending_media_deletes(key,created_at) SELECT key,? FROM media WHERE owner_id=? ON CONFLICT(key) DO NOTHING',
        )
        .bind(now(), signed.user.id),
      db.prepare('DELETE FROM reports WHERE reporter_id=?').bind(signed.user.id),
      db.prepare('DELETE FROM deletion_requests WHERE email=?').bind(signed.user.email),
      db.prepare('DELETE FROM users WHERE id=?').bind(signed.user.id),
      db.prepare(
        'DELETE FROM conversations WHERE NOT EXISTS (SELECT 1 FROM members WHERE members.conversation_id=conversations.id)',
      ),
    ]);
    await drainMediaDeletes(db, env);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', true) });
  }
  return undefined;
};
