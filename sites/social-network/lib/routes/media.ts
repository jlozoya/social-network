import { limit } from '../auth';
import { first, id } from '../data';
import { json, type RouteHandler, type SignedRequestContext } from '../http';
import { drainMediaDeletes, mediaResponse, queueUnusedMedia, uploadPhoto } from '../media';

export const handleMediaPublic: RouteHandler = async ({ request, env, path, method, db, user }) => {
  if (method === 'GET' && path.startsWith('/media/'))
    return mediaResponse(db, env, path.slice(7), user, request);
  return undefined;
};

export const handleMedia: RouteHandler<SignedRequestContext> = async ({
  request,
  env,
  path,
  method,
  db,
  signed,
}) => {
  let match: RegExpMatchArray | null;
  if (method === 'POST' && path === '/api/media') {
    await limit(db, `photos:${signed.user.id}`, 30, 3600_000);
    return json(await uploadPhoto(db, env, request, signed.user), 201);
  }
  if (method === 'DELETE' && (match = path.match(/^\/api\/media\/([^/]+)$/))) {
    const photo = await first<{ key: string }>(
      db,
      'SELECT key FROM media WHERE id=? AND owner_id=?',
      id(match[1]),
      signed.user.id,
    );
    if (photo) await queueUnusedMedia(db, signed.user.id, [photo.key]);
    await drainMediaDeletes(db, env);
    return json({ ok: true });
  }
  return undefined;
};
