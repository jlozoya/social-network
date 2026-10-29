import { ApiError, first, id, newId, now, run, text } from '../data';
import { bodyOf, json, type RouteHandler, type SignedRequestContext } from '../http';
import { drainMediaDeletes } from '../media';
import { deletePost } from '../posts';
import { audience, commentsFor, createPost, feed, readablePost } from '../social';

export const handlePostsPublic: RouteHandler = async ({ url, path, method, db, user }) => {
  let match: RegExpMatchArray | null;
  if (method === 'GET' && path === '/api/posts')
    return json(await feed(db, user, url.searchParams));
  if (method === 'GET' && (match = path.match(/^\/api\/posts\/([^/]+)$/)))
    return json(await readablePost(db, id(match[1]), user));
  if (method === 'GET' && (match = path.match(/^\/api\/posts\/([^/]+)\/comments$/)))
    return json(await commentsFor(db, id(match[1]), user, url.searchParams));
  return undefined;
};

export const handlePosts: RouteHandler<SignedRequestContext> = async ({
  request,
  env,
  path,
  method,
  db,
  signed,
}) => {
  let match: RegExpMatchArray | null;
  if (method === 'POST' && path === '/api/posts')
    return json(await createPost(db, signed.user, await bodyOf(request)), 201);
  if (
    (method === 'PATCH' || method === 'DELETE') &&
    (match = path.match(/^\/api\/posts\/([^/]+)$/))
  ) {
    const post = await readablePost(db, id(match[1]), signed.user);
    if (post.author.id !== signed.user.id)
      throw new ApiError(403, 'Sólo puedes modificar tus publicaciones.');
    if (method === 'DELETE') {
      await deletePost(db, post.id);
      await drainMediaDeletes(db, env);
      return json({ ok: true });
    }
    const body = await bodyOf(request),
      content = text(body.body ?? post.body, 0, 5000);
    if (!content && !post.media.length)
      throw new ApiError(400, 'La publicación no puede quedar vacía.');
    await run(
      db,
      'UPDATE posts SET body=?,audience=?,updated_at=? WHERE id=?',
      content,
      audience(body.audience ?? post.audience),
      now(),
      post.id,
    );
    return json(await readablePost(db, post.id, signed.user));
  }
  if (method === 'POST' && (match = path.match(/^\/api\/posts\/([^/]+)\/comments$/))) {
    const post = await readablePost(db, id(match[1]), signed.user),
      body = await bodyOf(request),
      commentId = newId();
    await run(
      db,
      'INSERT INTO comments(id,post_id,author_id,body,created_at) VALUES(?,?,?,?,?)',
      commentId,
      post.id,
      signed.user.id,
      text(body.body, 1, 1000),
      now(),
    );
    return json({ id: commentId }, 201);
  }
  if (method === 'DELETE' && (match = path.match(/^\/api\/comments\/([^/]+)$/))) {
    const comment = await first<{ id: string; post_id: string; author_id: string }>(
      db,
      'SELECT * FROM comments WHERE id=?',
      id(match[1]),
    );
    if (!comment) throw new ApiError(404, 'Comentario no disponible.');
    const post = await readablePost(db, comment.post_id, signed.user);
    if (comment.author_id !== signed.user.id && post.author.id !== signed.user.id)
      throw new ApiError(403, 'No puedes eliminar este comentario.');
    await run(db, 'DELETE FROM comments WHERE id=?', comment.id);
    return json({ ok: true });
  }
  if (method === 'POST' && (match = path.match(/^\/api\/posts\/([^/]+)\/reaction$/))) {
    const post = await readablePost(db, id(match[1]), signed.user),
      body = await bodyOf(request);
    if (body.reaction === null)
      await run(db, 'DELETE FROM reactions WHERE post_id=? AND user_id=?', post.id, signed.user.id);
    else {
      const reaction = text(body.reaction, 1, 20);
      if (!['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'].includes(reaction))
        throw new ApiError(400, 'Reacción inválida.');
      await run(
        db,
        'INSERT INTO reactions(post_id,user_id,reaction) VALUES(?,?,?) ON CONFLICT(post_id,user_id) DO UPDATE SET reaction=excluded.reaction',
        post.id,
        signed.user.id,
        reaction,
      );
    }
    return json(await readablePost(db, post.id, signed.user));
  }
  return undefined;
};
