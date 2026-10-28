import {
  ApiError,
  all,
  first,
  run,
  now,
  newId,
  blocked,
  visibleUser,
  publicUser,
  text,
  id,
  type User,
} from './data';
import { base64url } from './auth';

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  audience: string;
  created_at: number;
  updated_at: number;
  username: string;
  display_name: string;
  avatar_key: string | null;
  media_json: string;
  reactions_json: string;
  reaction_count: number;
  comment_count: number;
  my_reaction: string | null;
};
const visibility = `(p.author_id=? OR (u.suspended=0 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)) AND ((p.audience='public' AND u.private=0) OR (p.audience IN ('public','followers') AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.followee_id=u.id AND f.status='accepted')))))`;
const selectPost = `SELECT p.*,u.username,u.display_name,u.avatar_key,
  (SELECT json_group_array(json_object('id',m.id,'url','/media/'||m.key)) FROM post_media pm JOIN media m ON m.id=pm.media_id WHERE pm.post_id=p.id ORDER BY pm.position) media_json,
  (SELECT json_group_object(reaction,n) FROM (SELECT reaction,count(*) n FROM reactions WHERE post_id=p.id GROUP BY reaction)) reactions_json,
  (SELECT count(*) FROM reactions WHERE post_id=p.id) reaction_count,
  (SELECT count(*) FROM comments c JOIN users cu ON cu.id=c.author_id WHERE c.post_id=p.id AND cu.suspended=0 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=cu.id) OR (b.blocker_id=cu.id AND b.blocked_id=?))) comment_count,
  (SELECT reaction FROM reactions WHERE post_id=p.id AND user_id=?) my_reaction
  FROM posts p JOIN users u ON u.id=p.author_id`;
function postView(row: PostRow) {
  return {
    id: row.id,
    body: row.body,
    audience: row.audience,
    author: {
      id: row.author_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_key ? `/media/${row.avatar_key}` : null,
    },
    media: JSON.parse(row.media_json || '[]'),
    reactions: JSON.parse(row.reactions_json || '{}'),
    reactionCount: row.reaction_count,
    commentCount: row.comment_count,
    myReaction: row.my_reaction,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
function cursorFor(row: { id: string; created_at: number }): string {
  return base64url(new TextEncoder().encode(JSON.stringify([row.created_at, row.id])));
}
function parseCursor(value: string | null): [number, string] {
  if (!value) return [Number.MAX_SAFE_INTEGER, ''];
  try {
    if (value.length > 180) throw new Error();
    const parsed = JSON.parse(atob(value.replaceAll('-', '+').replaceAll('_', '/')));
    if (
      !Array.isArray(parsed) ||
      !Number.isSafeInteger(parsed[0]) ||
      parsed[0] < 0 ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(parsed[1])
    )
      throw new Error();
    return parsed as [number, string];
  } catch {
    throw new ApiError(400, 'La página solicitada no es válida.');
  }
}
export async function feed(db: D1Database, viewer: User | null, params: URLSearchParams) {
  const v = viewer?.id ?? '';
  const author = params.get('author');
  if (author) await visibleUser(db, id(author), viewer);
  const [time, cursorId] = parseCursor(params.get('before'));
  const search = (params.get('q') ?? '').trim().slice(0, 100);
  const rows = await all<PostRow>(
    db,
    `${selectPost} WHERE ${visibility} AND (p.created_at<? OR (p.created_at=? AND p.id<?))
    AND (?='' OR p.author_id=?) AND (?='' OR instr(lower(p.body),lower(?))>0)
    AND (?=0 OR p.author_id=? OR EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND followee_id=p.author_id AND status='accepted'))
    ORDER BY p.created_at DESC,p.id DESC LIMIT 16`,
    v,
    v,
    v,
    v,
    v,
    v,
    v,
    time,
    time,
    cursorId,
    author ?? '',
    author ?? '',
    search,
    search,
    params.get('following') === '1' ? 1 : 0,
    v,
    v,
  );
  return {
    data: rows.slice(0, 15).map(postView),
    nextCursor: rows.length > 15 ? cursorFor(rows[14]) : null,
  };
}
export async function readablePost(db: D1Database, postId: string, viewer: User | null) {
  const v = viewer?.id ?? '';
  const row = await first<PostRow>(
    db,
    `${selectPost} WHERE p.id=? AND ${visibility}`,
    v,
    v,
    v,
    postId,
    v,
    v,
    v,
    v,
  );
  if (!row) throw new ApiError(404, 'Publicación no disponible.');
  return postView(row);
}
export function audience(value: unknown): string {
  if (!['public', 'followers', 'private'].includes(String(value)))
    throw new ApiError(400, 'Selecciona quién puede ver la publicación.');
  return String(value);
}
export async function createPost(db: D1Database, user: User, body: Record<string, unknown>) {
  const content = text(body.body ?? '', 0, 5000);
  const mediaIds = body.mediaIds ?? [];
  if (!Array.isArray(mediaIds) || mediaIds.length > 4 || new Set(mediaIds).size !== mediaIds.length)
    throw new ApiError(400, 'Puedes adjuntar hasta cuatro fotos.');
  if (!content && !mediaIds.length) throw new ApiError(400, 'Escribe algo o añade una foto.');
  for (const mediaId of mediaIds) {
    if (
      !(await first(
        db,
        'SELECT 1 FROM media WHERE id=? AND owner_id=? AND NOT EXISTS(SELECT 1 FROM post_media WHERE media_id=media.id)',
        id(mediaId),
        user.id,
      ))
    )
      throw new ApiError(400, 'Una de las fotos no está disponible.');
  }
  const postId = newId(),
    created = now();
  await db.batch([
    db
      .prepare(
        'INSERT INTO posts(id,author_id,body,audience,created_at,updated_at) VALUES(?,?,?,?,?,?)',
      )
      .bind(postId, user.id, content, audience(body.audience ?? 'public'), created, created),
    ...mediaIds.map((mediaId, i) =>
      db
        .prepare('INSERT INTO post_media(post_id,media_id,position) VALUES(?,?,?)')
        .bind(postId, mediaId, i),
    ),
  ]);
  return readablePost(db, postId, user);
}
export async function commentsFor(
  db: D1Database,
  postId: string,
  viewer: User | null,
  params: URLSearchParams,
) {
  await readablePost(db, postId, viewer);
  const v = viewer?.id ?? '';
  const [time, cursorId] = parseCursor(params.get('before'));
  const rows = await all<{
    id: string;
    body: string;
    created_at: number;
    author_id: string;
    username: string;
    display_name: string;
    avatar_key: string | null;
  }>(
    db,
    `SELECT c.*,u.username,u.display_name,u.avatar_key FROM comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=? AND u.suspended=0 AND (c.created_at<? OR (c.created_at=? AND c.id<?)) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)) ORDER BY c.created_at DESC,c.id DESC LIMIT 31`,
    postId,
    time,
    time,
    cursorId,
    v,
    v,
  );
  return {
    data: rows
      .slice(0, 30)
      .map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: new Date(r.created_at).toISOString(),
        author: {
          id: r.author_id,
          username: r.username,
          displayName: r.display_name,
          avatarUrl: r.avatar_key ? `/media/${r.avatar_key}` : null,
        },
      })),
    nextCursor: rows.length > 30 ? cursorFor(rows[29]) : null,
  };
}
export async function profile(db: D1Database, userId: string, viewer: User | null) {
  return publicUser(db, await visibleUser(db, userId, viewer), viewer);
}
export async function searchUsers(db: D1Database, viewer: User | null, query: string) {
  const v = viewer?.id ?? '';
  const q = query.trim().slice(0, 80);
  const rows = await all<User>(
    db,
    `SELECT u.* FROM users u WHERE u.suspended=0 AND u.id<>? AND (?='' OR instr(lower(u.username),lower(?))>0 OR instr(lower(u.display_name),lower(?))>0) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)) ORDER BY u.created_at DESC LIMIT 20`,
    v,
    q,
    q,
    q,
    v,
    v,
  );
  return Promise.all(rows.map((u) => publicUser(db, u, viewer)));
}
export async function conversationAccess(db: D1Database, conversationId: string, user: User) {
  if (
    !(await first(
      db,
      'SELECT 1 FROM members WHERE conversation_id=? AND user_id=?',
      conversationId,
      user.id,
    ))
  )
    throw new ApiError(404, 'Conversación no disponible.');
  const peers = await all<{ user_id: string; suspended: number }>(
    db,
    'SELECT m.user_id,u.suspended FROM members m JOIN users u ON u.id=m.user_id WHERE m.conversation_id=? AND m.user_id<>?',
    conversationId,
    user.id,
  );
  for (const peer of peers)
    if (peer.suspended || (await blocked(db, user.id, peer.user_id)))
      throw new ApiError(404, 'Conversación no disponible.');
}
export async function createConversation(db: D1Database, user: User, peerId: string) {
  if (peerId === user.id) throw new ApiError(400, 'Elige a otra persona.');
  const peer = await visibleUser(db, peerId, user);
  if (
    peer.private &&
    !(await first(
      db,
      "SELECT 1 FROM follows WHERE follower_id=? AND followee_id=? AND status='accepted'",
      user.id,
      peer.id,
    ))
  )
    throw new ApiError(
      403,
      'Necesitas que esta persona acepte tu seguimiento para iniciar una conversación.',
    );
  const key = [user.id, peerId].sort().join(':');
  const conversationId = newId();
  await db.batch([
    db
      .prepare(
        'INSERT INTO conversations(id,direct_key,created_at) VALUES(?,?,?) ON CONFLICT(direct_key) DO NOTHING',
      )
      .bind(conversationId, key, now()),
    db
      .prepare(
        'INSERT INTO members(conversation_id,user_id) SELECT id,? FROM conversations WHERE direct_key=? ON CONFLICT DO NOTHING',
      )
      .bind(user.id, key),
    db
      .prepare(
        'INSERT INTO members(conversation_id,user_id) SELECT id,? FROM conversations WHERE direct_key=? ON CONFLICT DO NOTHING',
      )
      .bind(peerId, key),
  ]);
  return {
    id: (await first<{ id: string }>(db, 'SELECT id FROM conversations WHERE direct_key=?', key))!
      .id,
  };
}
export async function conversationsFor(db: D1Database, user: User) {
  const rows = await all<{
    id: string;
    created_at: number;
    last_body: string | null;
    last_at: number | null;
    unread: number;
  }>(
    db,
    `SELECT c.*, (SELECT body FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1) last_body,(SELECT max(created_at) FROM messages WHERE conversation_id=c.id) last_at,(SELECT count(*) FROM messages WHERE conversation_id=c.id AND author_id<>? AND (created_at>m.last_read_at OR (created_at=m.last_read_at AND id>m.last_read_id))) unread FROM conversations c JOIN members m ON m.conversation_id=c.id WHERE m.user_id=? AND NOT EXISTS(SELECT 1 FROM members other JOIN users u ON u.id=other.user_id WHERE other.conversation_id=c.id AND other.user_id<>? AND (u.suspended=1 OR EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)))) ORDER BY coalesce(last_at,c.created_at) DESC LIMIT 50`,
    user.id,
    user.id,
    user.id,
    user.id,
    user.id,
  );
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      lastMessage: row.last_body,
      lastAt: row.last_at ? new Date(row.last_at).toISOString() : null,
      unread: row.unread,
      peers: await all<{
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string | null;
      }>(
        db,
        `SELECT u.id,u.username,u.display_name displayName,CASE WHEN u.avatar_key IS NULL THEN NULL ELSE '/media/'||u.avatar_key END avatarUrl FROM members m JOIN users u ON u.id=m.user_id WHERE m.conversation_id=? AND u.id<>?`,
        row.id,
        user.id,
      ),
    })),
  );
}
export async function messagesFor(
  db: D1Database,
  conversationId: string,
  user: User,
  params: URLSearchParams,
) {
  await conversationAccess(db, conversationId, user);
  const after = params.has('after');
  const [time, cursorId] = parseCursor(params.get(after ? 'after' : 'before'));
  const op = after ? '>' : '<',
    direction = after ? 'ASC' : 'DESC';
  const rows = await all<{
    id: string;
    body: string;
    author_id: string | null;
    client_id: string;
    created_at: number;
    username: string | null;
    display_name: string | null;
  }>(
    db,
    `SELECT m.*,u.username,u.display_name FROM messages m LEFT JOIN users u ON u.id=m.author_id WHERE m.conversation_id=? AND (m.created_at${op}? OR (m.created_at=? AND m.id${op}?)) ORDER BY m.created_at ${direction},m.id ${direction} LIMIT 51`,
    conversationId,
    time,
    time,
    cursorId,
  );
  const page = rows.slice(0, 50);
  return {
    data: page.map((r) => ({
      id: r.id,
      body: r.body,
      clientId: r.client_id,
      createdAt: new Date(r.created_at).toISOString(),
      author: r.author_id
        ? { id: r.author_id, username: r.username, displayName: r.display_name }
        : null,
    })),
    nextCursor: !after && rows.length > 50 ? cursorFor(rows[49]) : null,
    afterCursor: page.length ? cursorFor(after ? page[page.length - 1] : page[0]) : null,
    hasMore: after && rows.length > 50,
  };
}
