import { all, ApiError, first, run } from './data';
import { queueUnusedMedia } from './media';

export async function deletePost(db: D1Database, postId: string) {
  const row = await first<{ author_id: string }>(
    db,
    'SELECT author_id FROM posts WHERE id=?',
    postId,
  );
  if (!row) throw new ApiError(404, 'Publicación no disponible.');
  const photos = await all<{ key: string }>(
    db,
    'SELECT m.key FROM media m JOIN post_media pm ON pm.media_id=m.id WHERE pm.post_id=?',
    postId,
  );
  await run(db, 'DELETE FROM posts WHERE id=?', postId);
  await queueUnusedMedia(
    db,
    row.author_id,
    photos.map((p) => p.key),
  );
}
