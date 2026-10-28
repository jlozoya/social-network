import { ApiError, all, first, run, now, newId, type Bindings } from './data';
import { randomToken, type Actor } from './auth';

export async function ablyTokenRequest(env: Bindings, userId: string) {
  const apiKey = env.ABLY_API_KEY;
  if (!apiKey) throw new ApiError(503, 'Ably todavía no está configurado.');
  const colon = apiKey.indexOf(':'),
    keyName = apiKey.slice(0, colon),
    secret = apiKey.slice(colon + 1);
  if (colon < 1 || !secret || !/^[\w-]+\.[\w-]+$/.test(keyName))
    throw new ApiError(503, 'La configuración de Ably no es válida.');
  const capability = JSON.stringify({
    'sn:feed': ['subscribe'],
    [`sn:user:${userId}`]: ['subscribe'],
  });
  const token = {
    keyName,
    ttl: 5 * 60_000,
    capability,
    clientId: userId,
    timestamp: now(),
    nonce: randomToken(),
  };
  const canonical =
    [token.keyName, token.ttl, token.capability, token.clientId, token.timestamp, token.nonce].join(
      '\n',
    ) + '\n';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical));
  return { ...token, mac: btoa(String.fromCharCode(...new Uint8Array(signature))) };
}
export type RealtimeSnapshot = { channels: string[] };
export async function realtimeSnapshot(
  db: D1Database,
  path: string,
  current: Actor,
): Promise<RealtimeSnapshot> {
  if (!current) return { channels: [] };
  const channels = new Set([`sn:user:${current.user.id}`]);
  if (/^\/api\/(posts|comments|account|users|follow-requests|moderation)/.test(path))
    channels.add('sn:feed');
  let conversationId = path.match(/^\/api\/conversations\/([^/]+)\//)?.[1];
  const messageId = path.match(/^\/api\/messages\/([^/]+)$/)?.[1];
  if (messageId)
    conversationId = (
      await first<{ conversation_id: string }>(
        db,
        'SELECT conversation_id FROM messages WHERE id=?',
        messageId,
      )
    )?.conversation_id;
  if (conversationId) {
    const peers = await all<{ user_id: string }>(
      db,
      'SELECT user_id FROM members WHERE conversation_id=?',
      conversationId,
    );
    for (const peer of peers) channels.add(`sn:user:${peer.user_id}`);
  }
  const peerId = path.match(/^\/api\/(?:users|follow-requests)\/([^/]+)/)?.[1];
  if (peerId) channels.add(`sn:user:${peerId}`);
  if (path === '/api/account') {
    const peers = await all<{ user_id: string }>(
      db,
      'SELECT DISTINCT other.user_id FROM members own JOIN members other ON other.conversation_id=own.conversation_id WHERE own.user_id=?',
      current.user.id,
    );
    for (const peer of peers) channels.add(`sn:user:${peer.user_id}`);
  }
  const reportId = path.match(/^\/api\/moderation\/reports\/([^/]+)$/)?.[1];
  if (reportId) {
    const report = await first<{ target_type: string; target_id: string }>(
      db,
      'SELECT target_type,target_id FROM reports WHERE id=?',
      reportId,
    );
    if (report?.target_type === 'user') channels.add(`sn:user:${report.target_id}`);
  }
  return { channels: [...channels] };
}
export async function enqueueRealtime(db: D1Database, channels: string[]) {
  if (!channels.length) return;
  await run(
    db,
    'INSERT INTO realtime_outbox(id,channels,created_at) VALUES(?,?,?)',
    newId(),
    JSON.stringify(
      [...new Set(channels)].filter((c) => c === 'sn:feed' || /^sn:user:[a-zA-Z0-9_-]+$/.test(c)),
    ),
    now(),
  );
}
type Outbox = { id: string; channels: string; created_at: number; attempts: number };
export async function flushRealtime(db: D1Database, env: Bindings, fetcher: typeof fetch = fetch) {
  if (!env.ABLY_API_KEY) return;
  const timestamp = now();
  const candidates = await all<{ id: string }>(
    db,
    'SELECT id FROM realtime_outbox WHERE lease_until<=? AND next_attempt_at<=? ORDER BY created_at LIMIT 3',
    timestamp,
    timestamp,
  );
  for (const candidate of candidates) {
    const row = await first<Outbox>(
      db,
      'UPDATE realtime_outbox SET lease_until=? WHERE id=? AND lease_until<=? AND next_attempt_at<=? RETURNING *',
      now() + 30_000,
      candidate.id,
      now(),
      now(),
    );
    if (!row) continue;
    try {
      for (const channel of JSON.parse(row.channels) as string[]) {
        const response = await fetcher(
          `https://rest.ably.io/channels/${encodeURIComponent(channel)}/messages`,
          {
            method: 'POST',
            headers: {
              authorization: `Basic ${btoa(env.ABLY_API_KEY)}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify([
              { id: `${row.id}:0`, name: 'changed', data: { kind: 'changed' } },
            ]),
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!response.ok) throw new Error('publish-failed');
      }
      await run(db, 'DELETE FROM realtime_outbox WHERE id=?', row.id);
    } catch {
      await run(
        db,
        'UPDATE realtime_outbox SET attempts=attempts+1,next_attempt_at=?,lease_until=0 WHERE id=?',
        now() + Math.min(60_000, 1000 * 2 ** Math.min(row.attempts, 6)),
        row.id,
      );
    }
  }
}
