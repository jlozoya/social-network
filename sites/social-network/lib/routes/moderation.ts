import { limit } from '../auth';
import { moderator } from '../auth-guards';
import {
  all,
  ApiError,
  blocked,
  first,
  id,
  newId,
  now,
  run,
  text,
  visibleUser,
  type User,
} from '../data';
import { bodyOf, json, type RouteHandler, type SignedRequestContext } from '../http';
import { drainMediaDeletes } from '../media';
import { deletePost } from '../posts';
import { conversationAccess, readablePost } from '../social';

async function reportTarget(db: D1Database, user: User, type: string, target: string) {
  if (type === 'post') await readablePost(db, target, user);
  else if (type === 'user') await visibleUser(db, target, user);
  else if (type === 'comment') {
    const row = await first<{ post_id: string; author_id: string }>(
      db,
      'SELECT post_id,author_id FROM comments WHERE id=?',
      target,
    );
    if (!row || (await blocked(db, user.id, row.author_id)))
      throw new ApiError(404, 'Comentario no disponible.');
    await readablePost(db, row.post_id, user);
  } else if (type === 'message') {
    const row = await first<{ conversation_id: string }>(
      db,
      'SELECT conversation_id FROM messages WHERE id=?',
      target,
    );
    if (!row) throw new ApiError(404, 'Mensaje no disponible.');
    await conversationAccess(db, row.conversation_id, user);
  } else throw new ApiError(400, 'Selecciona un contenido válido para denunciar.');
}

export const handleModeration: RouteHandler<SignedRequestContext> = async ({
  request,
  env,
  path,
  method,
  db,
  current,
  signed,
}) => {
  let match: RegExpMatchArray | null;
  if (method === 'POST' && path === '/api/reports') {
    await limit(db, `reports:${signed.user.id}`, 20, 86400_000);
    const body = await bodyOf(request),
      kind = text(body.targetType, 1, 20),
      target = id(body.targetId);
    await reportTarget(db, signed.user, kind, target);
    if (
      !(await first(
        db,
        "SELECT 1 FROM reports WHERE reporter_id=? AND target_type=? AND target_id=? AND status='open'",
        signed.user.id,
        kind,
        target,
      ))
    )
      await run(
        db,
        'INSERT INTO reports(id,reporter_id,target_type,target_id,reason,created_at) VALUES(?,?,?,?,?,?)',
        newId(),
        signed.user.id,
        kind,
        target,
        text(body.reason, 5, 1000),
        now(),
      );
    return json({ ok: true }, 201);
  }
  if (method === 'GET' && path === '/api/moderation/reports') {
    moderator(current);
    return json({
      data: await all(
        db,
        `SELECT r.*,u.username reporterUsername,CASE r.target_type WHEN 'post' THEN (SELECT body FROM posts WHERE id=r.target_id) WHEN 'comment' THEN (SELECT body FROM comments WHERE id=r.target_id) WHEN 'message' THEN (SELECT body FROM messages WHERE id=r.target_id) WHEN 'user' THEN (SELECT username FROM users WHERE id=r.target_id) END targetContent FROM reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE r.status='open' ORDER BY r.created_at LIMIT 50`,
      ),
    });
  }
  if (method === 'POST' && (match = path.match(/^\/api\/moderation\/reports\/([^/]+)$/))) {
    moderator(current);
    const body = await bodyOf(request),
      report = await first<{ id: string; target_type: string; target_id: string }>(
        db,
        "SELECT * FROM reports WHERE id=? AND status='open'",
        id(match[1]),
      );
    if (!report) throw new ApiError(404, 'Denuncia no disponible.');
    if (!['dismiss', 'remove'].includes(String(body.action)))
      throw new ApiError(400, 'Acción inválida.');
    if (body.action === 'remove') {
      if (
        report.target_type === 'post' &&
        (await first(db, 'SELECT 1 FROM posts WHERE id=?', report.target_id))
      )
        await deletePost(db, report.target_id);
      if (report.target_type === 'comment')
        await run(db, 'DELETE FROM comments WHERE id=?', report.target_id);
      if (report.target_type === 'message')
        await run(db, 'DELETE FROM messages WHERE id=?', report.target_id);
      if (report.target_type === 'user') {
        const target = await first<User>(db, 'SELECT * FROM users WHERE id=?', report.target_id);
        if (target?.role === 'admin' || target?.id === signed.user.id)
          throw new ApiError(403, 'No puedes suspender esta cuenta desde una denuncia.');
        await db.batch([
          db.prepare('UPDATE users SET suspended=1 WHERE id=?').bind(report.target_id),
          db.prepare('DELETE FROM sessions WHERE user_id=?').bind(report.target_id),
        ]);
      }
    }
    await run(
      db,
      'UPDATE reports SET status=?,resolved_by=? WHERE id=?',
      body.action === 'remove' ? 'removed' : 'dismissed',
      signed.user.id,
      report.id,
    );
    await drainMediaDeletes(db, env);
    return json({ ok: true });
  }
  if (method === 'GET' && path === '/api/moderation/users') {
    moderator(current);
    return json({
      data: await all(
        db,
        'SELECT id,username,display_name displayName FROM users WHERE suspended=1 LIMIT 100',
      ),
    });
  }
  if (method === 'POST' && (match = path.match(/^\/api\/moderation\/users\/([^/]+)\/restore$/))) {
    moderator(current);
    if (signed.user.role !== 'admin')
      throw new ApiError(403, 'Sólo la administración puede restaurar cuentas.');
    await run(db, 'UPDATE users SET suspended=0 WHERE id=?', id(match[1]));
    return json({ ok: true });
  }
  if (method === 'GET' && path === '/api/moderation/deletion-requests') {
    if (moderator(current).user.role !== 'admin')
      throw new ApiError(403, 'Sólo la administración puede consultar solicitudes de datos.');
    return json({
      data: await all(
        db,
        "SELECT * FROM deletion_requests WHERE status='open' ORDER BY created_at LIMIT 50",
      ),
    });
  }
  if (
    method === 'POST' &&
    (match = path.match(/^\/api\/moderation\/deletion-requests\/([^/]+)$/))
  ) {
    if (moderator(current).user.role !== 'admin')
      throw new ApiError(403, 'Sólo la administración puede cerrar solicitudes de datos.');
    await run(db, "UPDATE deletion_requests SET status='closed' WHERE id=?", id(match[1]));
    return json({ ok: true });
  }
  return undefined;
};
