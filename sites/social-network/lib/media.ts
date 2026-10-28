import {
  ApiError,
  all,
  first,
  run,
  now,
  newId,
  visibleUser,
  type Bindings,
  type User,
} from './data';
import { readablePost } from './social';

export async function boundedBody(request: Request, maximum: number): Promise<Uint8Array> {
  const length = Number(request.headers.get('content-length'));
  if (length > maximum) throw new ApiError(413, 'El archivo es demasiado grande.');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new ApiError(413, 'El archivo es demasiado grande.');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return data;
}
export async function uploadPhoto(db: D1Database, env: Bindings, request: Request, user: User) {
  if (!env.BUCKET) throw new ApiError(503, 'El almacenamiento no está disponible.');
  if (request.headers.get('content-type') !== 'image/webp')
    throw new ApiError(415, 'La foto debe estar convertida a WebP por la aplicación.');
  const bytes = await boundedBody(request, 6 * 1024 * 1024);
  const header = new TextDecoder().decode(bytes.slice(0, 16));
  if (bytes.length < 16 || !header.startsWith('RIFF') || header.slice(8, 12) !== 'WEBP')
    throw new ApiError(415, 'El archivo no es una foto WebP válida.');
  const mediaId = newId(),
    key = `photos/${newId()}.webp`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: 'image/webp' } });
  try {
    await run(
      db,
      'INSERT INTO media(id,owner_id,key,bytes,created_at) VALUES(?,?,?,?,?)',
      mediaId,
      user.id,
      key,
      bytes.length,
      now(),
    );
  } catch (error) {
    await env.BUCKET.delete(key);
    throw error;
  }
  return { id: mediaId, url: `/media/${key}` };
}
export async function mediaResponse(
  db: D1Database,
  env: Bindings,
  key: string,
  user: User | null,
  request: Request,
) {
  if (!/^photos\/[a-f0-9-]{36}\.webp$/.test(key)) throw new ApiError(404, 'Foto no disponible.');
  const row = await first<{ owner_id: string }>(db, 'SELECT owner_id FROM media WHERE key=?', key);
  if (!row || !env.BUCKET) throw new ApiError(404, 'Foto no disponible.');
  if (user?.id !== row.owner_id) {
    await visibleUser(db, row.owner_id, user);
    const profile = await first(
      db,
      'SELECT 1 FROM users WHERE id=? AND (avatar_key=? OR cover_key=?)',
      row.owner_id,
      key,
      key,
    );
    if (!profile) {
      const post = await first<{ post_id: string }>(
        db,
        'SELECT pm.post_id FROM post_media pm JOIN media m ON m.id=pm.media_id WHERE m.key=?',
        key,
      );
      if (!post) throw new ApiError(404, 'Foto no disponible.');
      await readablePost(db, post.post_id, user);
    }
  }
  const object = await env.BUCKET.get(key);
  if (!object) throw new ApiError(404, 'Foto no disponible.');
  const headers = new Headers({
    'content-type': 'image/webp',
    'cache-control': 'private,max-age=60',
    vary: 'Cookie,Authorization',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    etag: object.httpEtag,
  });
  if (request.headers.get('if-none-match') === object.httpEtag)
    return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}
export async function queueUnusedMedia(
  db: D1Database,
  userId: string,
  keys: string[],
): Promise<void> {
  if (!keys.length) return;
  const placeholders = keys.map(() => '?').join(',');
  await db.batch([
    db
      .prepare(
        `INSERT INTO pending_media_deletes(key,created_at) SELECT m.key,? FROM media m WHERE m.owner_id=? AND m.key IN (${placeholders}) AND NOT EXISTS(SELECT 1 FROM post_media WHERE media_id=m.id) AND NOT EXISTS(SELECT 1 FROM users WHERE avatar_key=m.key OR cover_key=m.key) ON CONFLICT(key) DO NOTHING`,
      )
      .bind(now(), userId, ...keys),
    db
      .prepare(
        'DELETE FROM media WHERE owner_id=? AND key IN (SELECT key FROM pending_media_deletes)',
      )
      .bind(userId),
  ]);
}
export async function drainMediaDeletes(db: D1Database, env: Bindings): Promise<void> {
  if (!env.BUCKET) return;
  const rows = await all<{ key: string }>(
    db,
    'SELECT key FROM pending_media_deletes ORDER BY created_at LIMIT 50',
  );
  if (!rows.length) return;
  try {
    await env.BUCKET.delete(rows.map((r) => r.key));
  } catch {
    return;
  }
  await db.batch(
    rows.map((row) => db.prepare('DELETE FROM pending_media_deletes WHERE key=?').bind(row.key)),
  );
}
