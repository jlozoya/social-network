import { all, ApiError, first, id, now, publicUser, run, visibleUser, type User } from '../data';
import { json, type RouteHandler, type SignedRequestContext } from '../http';
import { profile, searchUsers } from '../social';

export const handlePeoplePublic: RouteHandler = async ({ url, path, method, db, user }) => {
  let match: RegExpMatchArray | null;
  if (method === 'GET' && path === '/api/users')
    return json({ data: await searchUsers(db, user, url.searchParams.get('q') ?? '') });
  if (method === 'GET' && (match = path.match(/^\/api\/users\/([^/]+)$/)))
    return json(await profile(db, id(match[1]), user));
  return undefined;
};

export const handlePeople: RouteHandler<SignedRequestContext> = async ({
  path,
  method,
  db,
  signed,
}) => {
  let match: RegExpMatchArray | null;
  if (
    (method === 'POST' || method === 'DELETE') &&
    (match = path.match(/^\/api\/users\/([^/]+)\/follow$/))
  ) {
    const peer = await visibleUser(db, id(match[1]), signed.user);
    if (peer.id === signed.user.id) throw new ApiError(400, 'No puedes seguirte a ti mismo.');
    if (method === 'DELETE')
      await run(
        db,
        'DELETE FROM follows WHERE follower_id=? AND followee_id=?',
        signed.user.id,
        peer.id,
      );
    else
      await run(
        db,
        'INSERT INTO follows(follower_id,followee_id,status,created_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',
        signed.user.id,
        peer.id,
        peer.private ? 'pending' : 'accepted',
        now(),
      );
    return json(await profile(db, peer.id, signed.user));
  }
  if (method === 'GET' && path === '/api/follow-requests') {
    const rows = await all<User>(
      db,
      "SELECT u.* FROM users u JOIN follows f ON f.follower_id=u.id WHERE f.followee_id=? AND f.status='pending' AND u.suspended=0 ORDER BY f.created_at LIMIT 50",
      signed.user.id,
    );
    return json({ data: await Promise.all(rows.map((u) => publicUser(db, u, signed.user))) });
  }
  if (
    (method === 'POST' || method === 'DELETE') &&
    (match = path.match(/^\/api\/follow-requests\/([^/]+)$/))
  ) {
    const peer = await visibleUser(db, id(match[1]), signed.user);
    if (method === 'POST')
      await run(
        db,
        "UPDATE follows SET status='accepted' WHERE follower_id=? AND followee_id=? AND status='pending'",
        peer.id,
        signed.user.id,
      );
    else
      await run(
        db,
        "DELETE FROM follows WHERE follower_id=? AND followee_id=? AND status='pending'",
        peer.id,
        signed.user.id,
      );
    return json({ ok: true });
  }
  if (method === 'GET' && path === '/api/blocks')
    return json({
      data: await all(
        db,
        'SELECT u.id,u.username,u.display_name displayName FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=?',
        signed.user.id,
      ),
    });
  if (
    (method === 'POST' || method === 'DELETE') &&
    (match = path.match(/^\/api\/users\/([^/]+)\/block$/))
  ) {
    const peerId = id(match[1]);
    if (peerId === signed.user.id) throw new ApiError(400, 'No puedes bloquearte a ti mismo.');
    if (method === 'DELETE')
      await run(
        db,
        'DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?',
        signed.user.id,
        peerId,
      );
    else {
      if (!(await first(db, 'SELECT 1 FROM users WHERE id=?', peerId)))
        throw new ApiError(404, 'Perfil no disponible.');
      await db.batch([
        db
          .prepare('INSERT INTO blocks(blocker_id,blocked_id) VALUES(?,?) ON CONFLICT DO NOTHING')
          .bind(signed.user.id, peerId),
        db
          .prepare(
            'DELETE FROM follows WHERE (follower_id=? AND followee_id=?) OR (follower_id=? AND followee_id=?)',
          )
          .bind(signed.user.id, peerId, peerId, signed.user.id),
      ]);
    }
    return json({ ok: true });
  }
  return undefined;
};
