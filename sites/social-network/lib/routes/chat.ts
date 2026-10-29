import { ApiError, first, id, newId, now, run, text } from '../data';
import { bodyOf, json, type RouteHandler, type SignedRequestContext } from '../http';
import { conversationAccess, conversationsFor, createConversation, messagesFor } from '../social';

export const handleChat: RouteHandler<SignedRequestContext> = async ({
  request,
  url,
  path,
  method,
  db,
  signed,
}) => {
  let match: RegExpMatchArray | null;
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
  return undefined;
};
