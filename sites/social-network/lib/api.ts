import {
  ApiError,
  database,
  first,
  all,
  run,
  now,
  newId,
  id,
  text,
  email,
  username,
  visibleUser,
  publicUser,
  blocked,
  type Bindings,
  type Identity,
  type User,
} from './data';
import {
  actor,
  requireActor,
  signup,
  login,
  createSession,
  sessionCookie,
  limit,
  startChatGPT,
  completeChatGPT,
  exchangeCode,
  checkPassword,
  passwordHash,
  cleanExpired,
  type Actor,
} from './auth';
import {
  feed,
  readablePost,
  createPost,
  commentsFor,
  audience,
  profile,
  searchUsers,
  createConversation,
  conversationsFor,
  conversationAccess,
  messagesFor,
} from './social';
import {
  boundedBody,
  uploadPhoto,
  mediaResponse,
  queueUnusedMedia,
  drainMediaDeletes,
} from './media';
import { ablyTokenRequest, realtimeSnapshot, enqueueRealtime, flushRealtime } from './realtime';

function json(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, { status, headers });
}
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) return {};
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new ApiError(415, 'El formulario debe enviarse como JSON.');
  try {
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 32 * 1024)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'Formulario inválido.');
  }
}
function moderator(current: Actor) {
  const a = requireActor(current);
  if (!['admin', 'moderator'].includes(a.user.role))
    throw new ApiError(403, 'Esta acción requiere moderación.');
  return a;
}
async function reauthenticate(db: D1Database, current: NonNullable<Actor>, password: unknown) {
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
async function deletePost(db: D1Database, postId: string) {
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

async function route(request: Request, env: Bindings, identity: Identity): Promise<Response> {
  const url = new URL(request.url),
    path = url.pathname.replace(/\/$/, '');
  const method = request.method;
  const db = database(env);
  const current = await actor(db, request),
    user = current?.user ?? null;
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  let match: RegExpMatchArray | null;
  if (method === 'GET' && path === '/api/health') {
    await first(db, 'SELECT 1');
    return json({
      status: 'ok',
      database: 'up',
      storage: env.BUCKET ? 'configured' : 'unavailable',
      version: 'sites-social-beta',
    });
  }
  if (method === 'GET' && path === '/api/session')
    return json({ user: user ? await publicUser(db, user, user) : null });
  if (method === 'GET' && path === '/api/realtime/status')
    return json({ configured: !!env.ABLY_API_KEY });
  if (method === 'GET' && path === '/api/auth/chatgpt')
    return completeChatGPT(db, env, request, identity);
  if (method === 'POST' && path === '/api/auth/chatgpt') {
    if (request.headers.get('origin') !== url.origin)
      throw new ApiError(403, 'Vuelve a iniciar el acceso desde Social Network.');
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
      throw new ApiError(415, 'Envía el formulario de creación de cuenta.');
    const form = new URLSearchParams(new TextDecoder().decode(await boundedBody(request, 4096)));
    return completeChatGPT(db, env, request, identity, form.get('consent') === 'accepted');
  }
  if (method === 'POST' && path === '/api/auth/start') {
    await limit(db, `auth-start:${ip}`, 20, 15 * 60_000);
    const navigation = request.headers
      .get('content-type')
      ?.startsWith('application/x-www-form-urlencoded');
    let body: Record<string, unknown>;
    if (navigation) {
      body = Object.fromEntries(
        new URLSearchParams(new TextDecoder().decode(await boundedBody(request, 4096))),
      );
      for (const key of ['link', 'termsAccepted', 'ageConfirmed']) body[key] = body[key] === 'true';
      body.native = false;
    } else {
      body = await bodyOf(request);
    }
    const started = await startChatGPT(db, request, body, current);
    return navigation ? Response.redirect(started.url, 303) : json(started);
  }
  if (method === 'POST' && path === '/api/auth/exchange') {
    await limit(db, `auth-exchange:${ip}`, 30, 15 * 60_000);
    const token = await exchangeCode(db, await bodyOf(request));
    return json({ token }, 200, { 'set-cookie': sessionCookie(request, token) });
  }
  if (method === 'POST' && (path === '/api/auth/signup' || path === '/api/auth/login')) {
    const body = await bodyOf(request);
    await limit(db, `auth-ip:${ip}`, 30, 15 * 60_000);
    await limit(db, `auth-email:${String(body.email).toLowerCase()}`, 10, 15 * 60_000);
    const authenticated = path.endsWith('signup') ? await signup(db, body) : await login(db, body);
    const token = await createSession(db, authenticated.id);
    return json({ user: await publicUser(db, authenticated, authenticated), token }, 200, {
      'set-cookie': sessionCookie(request, token),
    });
  }
  if (method === 'POST' && path === '/api/auth/logout') {
    if (current) await run(db, 'DELETE FROM sessions WHERE hash=?', current.session.hash);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request, '', true) });
  }
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
  if (method === 'GET' && path === '/api/posts')
    return json(await feed(db, user, url.searchParams));
  if (method === 'GET' && (match = path.match(/^\/api\/posts\/([^/]+)$/)))
    return json(await readablePost(db, id(match[1]), user));
  if (method === 'GET' && (match = path.match(/^\/api\/posts\/([^/]+)\/comments$/)))
    return json(await commentsFor(db, id(match[1]), user, url.searchParams));
  if (method === 'GET' && path === '/api/users')
    return json({ data: await searchUsers(db, user, url.searchParams.get('q') ?? '') });
  if (method === 'GET' && (match = path.match(/^\/api\/users\/([^/]+)$/)))
    return json(await profile(db, id(match[1]), user));
  if (method === 'GET' && path.startsWith('/media/'))
    return mediaResponse(db, env, path.slice(7), user, request);

  const signed = requireActor(current);
  if (method === 'POST' && path === '/api/realtime/token') {
    await limit(db, `ably-auth:${signed.user.id}`, 30, 15 * 60_000);
    return json(await ablyTokenRequest(env, signed.user.id));
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    await limit(db, `mutations:${signed.user.id}`, 120);
    await drainMediaDeletes(db, env);
    await cleanExpired(db);
  }
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
  if (method === 'GET' && path === '/api/conversations')
    return json({ data: await conversationsFor(db, signed.user) });
  if (method === 'POST' && path === '/api/conversations') {
    const body = await bodyOf(request);
    return json(await createConversation(db, signed.user, id(body.userId)), 201);
  }
  if (method === 'GET' && (match = path.match(/^\/api\/conversations\/([^/]+)\/messages$/)))
    return json(await messagesFor(db, id(match[1]), signed.user, url.searchParams));
  if (method === 'POST' && (match = path.match(/^\/api\/conversations\/([^/]+)\/messages$/))) {
    const conversationId = id(match[1]);
    await conversationAccess(db, conversationId, signed.user);
    const body = await bodyOf(request),
      clientId = id(body.clientId),
      content = text(body.body, 1, 4000);
    await run(
      db,
      'INSERT INTO messages(id,conversation_id,author_id,client_id,body,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(conversation_id,author_id,client_id) DO NOTHING',
      newId(),
      conversationId,
      signed.user.id,
      clientId,
      content,
      now(),
    );
    return json(
      await first(
        db,
        'SELECT id,body,client_id clientId,created_at createdAt FROM messages WHERE conversation_id=? AND author_id=? AND client_id=?',
        conversationId,
        signed.user.id,
        clientId,
      ),
      201,
    );
  }
  if (method === 'POST' && (match = path.match(/^\/api\/conversations\/([^/]+)\/read$/))) {
    const conversationId = id(match[1]);
    await conversationAccess(db, conversationId, signed.user);
    const body = await bodyOf(request);
    const message = await first<{ id: string; created_at: number }>(
      db,
      'SELECT id,created_at FROM messages WHERE id=? AND conversation_id=?',
      id(body.messageId),
      conversationId,
    );
    if (message)
      await run(
        db,
        'UPDATE members SET last_read_at=?,last_read_id=? WHERE conversation_id=? AND user_id=? AND (last_read_at<? OR (last_read_at=? AND last_read_id<?))',
        message.created_at,
        message.id,
        conversationId,
        signed.user.id,
        message.created_at,
        message.created_at,
        message.id,
      );
    return json({ ok: true });
  }
  if (method === 'DELETE' && (match = path.match(/^\/api\/messages\/([^/]+)$/))) {
    const message = await first<{ id: string; author_id: string; conversation_id: string }>(
      db,
      'SELECT id,author_id,conversation_id FROM messages WHERE id=?',
      id(match[1]),
    );
    if (!message) throw new ApiError(404, 'Mensaje no disponible.');
    await conversationAccess(db, message.conversation_id, signed.user);
    if (message.author_id !== signed.user.id)
      throw new ApiError(403, 'Sólo puedes eliminar tus mensajes.');
    await run(db, 'DELETE FROM messages WHERE id=?', message.id);
    return json({ ok: true });
  }
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
  throw new ApiError(404, 'Esta función no está disponible en la versión de Sites.');
}

export async function handleApi(
  request: Request,
  env: Bindings,
  identity: Identity = null,
): Promise<Response> {
  const url = new URL(request.url),
    origin = request.headers.get('origin');
  const allowed = new Set([url.origin, 'https://localhost', 'capacitor://localhost']);
  if (origin && !allowed.has(origin)) return json({ error: 'Origen no permitido.' }, 403);
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    request.headers.has('cookie') &&
    !origin
  )
    return json({ error: 'Falta el origen del formulario.' }, 403);
  if (request.method === 'OPTIONS')
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': origin ?? url.origin,
        'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': 'Content-Type,Authorization',
        'access-control-allow-credentials': 'true',
        vary: 'Origin',
      },
    });
  let response: Response;
  try {
    const mutation =
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      !url.pathname.startsWith('/api/auth/') &&
      url.pathname !== '/api/realtime/token' &&
      !url.pathname.endsWith('/read');
    const before =
      mutation && env.DB && env.ABLY_API_KEY
        ? await realtimeSnapshot(env.DB, url.pathname, await actor(env.DB, request))
        : null;
    response = await route(request, env, identity);
    if (response.ok && env.DB && env.ABLY_API_KEY) {
      try {
        if (before) {
          if (url.pathname === '/api/conversations') {
            const result = (await response.clone().json()) as { id: string };
            const peers = await all<{ user_id: string }>(
              env.DB,
              'SELECT user_id FROM members WHERE conversation_id=?',
              result.id,
            );
            for (const peer of peers) before.channels.push(`sn:user:${peer.user_id}`);
          }
          await enqueueRealtime(env.DB, before.channels);
        }
        await flushRealtime(env.DB, env);
      } catch {
        /* El cambio ya está guardado. La siguiente petición reintentará los avisos pendientes. */
      }
    }
  } catch (error) {
    const status =
      error instanceof ApiError
        ? error.status
        : String(error).includes('UNIQUE constraint failed')
          ? 409
          : 500;
    const message =
      error instanceof ApiError
        ? error.message
        : status === 409
          ? 'Este dato ya está registrado.'
          : 'No se pudo completar la operación. Inténtalo de nuevo.';
    if (
      url.pathname === '/api/auth/chatgpt' ||
      (url.pathname === '/api/auth/start' &&
        request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
    ) {
      const escaped = message
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
      response = new Response(
        `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Acceso · Social Network</title><body style="font:18px system-ui;max-width:600px;margin:15vh auto;padding:24px"><h1>No se pudo completar el acceso</h1><p>${escaped}</p><a href="/">Volver a Social Network</a></body></html>`,
        { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
      );
    } else response = json({ error: message }, status);
  }
  const headers = new Headers(response.headers);
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  if (!headers.has('referrer-policy')) headers.set('referrer-policy', 'no-referrer');
  if (origin) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-credentials', 'true');
    headers.append('vary', 'Origin');
  }
  return new Response(response.body, { status: response.status, headers });
}
