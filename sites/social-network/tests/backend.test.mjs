import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHmac, webcrypto } from 'node:crypto';
import { handleApi } from '../outputs/tests/lib/api.mjs';
import { digest } from '../outputs/tests/lib/auth.mjs';
import {
  ablyTokenRequest,
  enqueueRealtime,
  flushRealtime,
} from '../outputs/tests/lib/realtime.mjs';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  class Statement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.sql, args);
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.args) ?? null;
    }
    async all() {
      return { results: sqlite.prepare(this.sql).all(...this.args), success: true };
    }
    async run() {
      const result = sqlite.prepare(this.sql).run(...this.args);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  }
  const db = {
    prepare: (sql) => new Statement(sql),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const objects = new Map();
  const bucket = {
    put: async (key, bytes) => objects.set(key, bytes),
    delete: async (key) => {
      for (const k of Array.isArray(key) ? key : [key]) objects.delete(k);
    },
    get: async (key) =>
      objects.has(key)
        ? { body: new Response(objects.get(key)).body, httpEtag: '"fixture"' }
        : null,
  };
  const env = { DB: db, BUCKET: bucket, ADMIN_EMAILS: 'owner@example.test' };
  let ip = 1;
  const client = () => ({ cookie: '', ip: `127.0.0.${ip++}` });
  async function request(client, path, method = 'GET', body, identity = null) {
    const headers = { origin: 'https://social.test', 'cf-connecting-ip': client.ip };
    if (client.cookie) headers.cookie = client.cookie;
    if (body !== undefined)
      headers['content-type'] = body instanceof Uint8Array ? 'image/webp' : 'application/json';
    const response = await handleApi(
      new Request(`https://social.test${path}`, {
        method,
        headers,
        body:
          body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
      }),
      env,
      identity,
    );
    const cookie = response.headers.get('set-cookie');
    if (cookie) client.cookie = cookie.split(';')[0];
    return response;
  }
  async function signup(handle) {
    const c = client();
    const response = await request(c, '/api/auth/signup', 'POST', {
      email: `${handle}@example.test`,
      username: handle,
      displayName: handle,
      password: 'a-fixture-password-1234',
      termsAccepted: true,
      ageConfirmed: true,
      role: 'admin',
    });
    assert.equal(response.status, 200);
    return { client: c, user: (await response.json()).user };
  }
  async function chatgpt(address, existingClient = client(), link = false) {
    const verifier = 'v'.repeat(43),
      state = 's'.repeat(43);
    const started = await request(existingClient, '/api/auth/start', 'POST', {
      challenge: await digest(verifier),
      state,
      termsAccepted: true,
      ageConfirmed: true,
      link,
    });
    assert.equal(started.status, 200);
    const url = new URL((await started.json()).url);
    const response = await request(existingClient, url.pathname + url.search, 'GET', undefined, {
      userId: `identity-${address}`,
      email: address,
      displayName: 'Verified owner',
    });
    return { response, verifier, state, client: existingClient };
  }
  return { sqlite, db, env, bucket, objects, client, request, signup, chatgpt };
}

test('registro con consentimiento, contraseña protegida y sesión HttpOnly sin elevar privilegios', async () => {
  const f = fixture(),
    { client, user } = await f.signup('alice');
  assert.equal(user.role, 'user');
  assert.equal(user.email, 'alice@example.test');
  const row = f.sqlite.prepare('SELECT password_hash FROM credentials').get();
  assert.ok(row.password_hash.startsWith('pbkdf2-sha256$'));
  assert.ok(!row.password_hash.includes('fixture-password'));
  const me = await f.request(client, '/api/session');
  assert.equal((await me.json()).user.id, user.id);
  const another = f.client();
  const weak = await f.request(another, '/api/auth/signup', 'POST', {
    email: 'weak@example.test',
    username: 'weak',
    displayName: 'Weak',
    password: 'short',
    termsAccepted: true,
    ageConfirmed: true,
  });
  assert.equal(weak.status, 400);
  const noAge = await f.request(another, '/api/auth/signup', 'POST', {
    email: 'age@example.test',
    username: 'age',
    displayName: 'Age',
    password: 'long-password-1234',
    termsAccepted: true,
  });
  assert.equal(noAge.status, 400);
  const response = await f.request(another, '/api/auth/login', 'POST', {
    email: 'alice@example.test',
    password: 'a-fixture-password-1234',
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const serialized = JSON.stringify(await response.json());
  assert.ok(!serialized.includes('password_hash'));
  assert.equal((await f.request(client, '/api/moderation/reports')).status, 403);
});
test('audiencia privada y solicitudes de seguimiento se aplican a posts, comentarios y reacciones', async () => {
  const f = fixture(),
    a = await f.signup('alice'),
    b = await f.signup('bob'),
    guest = f.client();
  await f.request(a.client, '/api/account', 'PATCH', { isPrivate: true });
  const post = await (
    await f.request(a.client, '/api/posts', 'POST', {
      body: 'Sólo seguidores aprobados',
      audience: 'public',
    })
  ).json();
  assert.equal((await f.request(guest, `/api/posts/${post.id}`)).status, 404);
  await f.request(b.client, `/api/users/${a.user.id}/follow`, 'POST', {});
  assert.equal(
    (
      await f.request(b.client, `/api/posts/${post.id}/comments`, 'POST', {
        body: 'No debería poder',
      })
    ).status,
    404,
  );
  const pending = await (await f.request(a.client, '/api/follow-requests')).json();
  assert.equal(pending.data[0].id, b.user.id);
  await f.request(a.client, `/api/follow-requests/${b.user.id}`, 'POST', {});
  assert.equal((await f.request(b.client, `/api/posts/${post.id}`)).status, 200);
  assert.equal(
    (await f.request(b.client, `/api/posts/${post.id}/comments`, 'POST', { body: 'Ahora sí' }))
      .status,
    201,
  );
  assert.equal(
    (await f.request(b.client, `/api/posts/${post.id}/reaction`, 'POST', { reaction: 'love' }))
      .status,
    200,
  );
  const privatePost = await (
    await f.request(a.client, '/api/posts', 'POST', { body: 'Sólo yo', audience: 'private' })
  ).json();
  assert.equal((await f.request(b.client, `/api/posts/${privatePost.id}`)).status, 404);
  const feed = await (await f.request(b.client, '/api/posts')).json();
  assert.equal(feed.data.length, 1);
  assert.equal(feed.data[0].reactionCount, 1);
});
test('chat con pertenencia, reintentos idempotentes y bloqueo en ambas direcciones', async () => {
  const f = fixture(),
    a = await f.signup('alice'),
    b = await f.signup('bob'),
    c = await f.signup('carol');
  const conversation = await (
    await f.request(a.client, '/api/conversations', 'POST', { userId: b.user.id })
  ).json();
  assert.ok(conversation.id);
  const duplicate = await (
    await f.request(b.client, '/api/conversations', 'POST', { userId: a.user.id })
  ).json();
  assert.equal(duplicate.id, conversation.id);
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await f.request(a.client, `/api/conversations/${conversation.id}/messages`, 'POST', {
          clientId: 'fixture-msg',
          body: 'Mensaje privado',
          authorId: c.user.id,
        })
      ).status,
      201,
    );
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM messages').get().n, 1);
  let messages = await (
    await f.request(b.client, `/api/conversations/${conversation.id}/messages`)
  ).json();
  assert.equal(messages.data[0].author.id, a.user.id);
  assert.ok(messages.afterCursor);
  assert.equal(
    (await f.request(c.client, `/api/conversations/${conversation.id}/messages`)).status,
    404,
  );
  const inbox = await (await f.request(b.client, '/api/conversations')).json();
  assert.equal(inbox.data[0].unread, 1);
  await f.request(b.client, `/api/conversations/${conversation.id}/read`, 'POST', {
    messageId: messages.data[0].id,
  });
  assert.equal((await (await f.request(b.client, '/api/conversations')).json()).data[0].unread, 0);
  await f.request(b.client, `/api/users/${a.user.id}/block`, 'POST', {});
  assert.equal((await f.request(a.client, `/api/users/${b.user.id}`)).status, 404);
  assert.equal(
    (
      await f.request(a.client, `/api/conversations/${conversation.id}/messages`, 'POST', {
        clientId: 'blocked',
        body: 'No debe llegar',
      })
    ).status,
    404,
  );
  assert.equal((await (await f.request(a.client, '/api/conversations')).json()).data.length, 0);
});
test('ChatGPT: PKCE, estado, código de un uso, vinculación explícita y administración verificada', async () => {
  const f = fixture(),
    a = await f.signup('alice');
  const collision = await f.chatgpt('alice@example.test');
  assert.equal(collision.response.status, 409);
  const linked = await f.chatgpt('alice@example.test', a.client, true);
  assert.equal(linked.response.status, 303);
  const code = new URL(linked.response.headers.get('location')).searchParams.get('auth_code');
  assert.equal(
    (
      await f.request(a.client, '/api/auth/exchange', 'POST', {
        code,
        state: linked.state,
        verifier: 'x'.repeat(43),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.request(a.client, '/api/auth/exchange', 'POST', {
        code,
        state: linked.state,
        verifier: linked.verifier,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.request(a.client, '/api/auth/exchange', 'POST', {
        code,
        state: linked.state,
        verifier: linked.verifier,
      })
    ).status,
    401,
  );
  const owner = await f.chatgpt('owner@example.test');
  const ownerCode = new URL(owner.response.headers.get('location')).searchParams.get('auth_code');
  await f.request(owner.client, '/api/auth/exchange', 'POST', {
    code: ownerCode,
    state: owner.state,
    verifier: owner.verifier,
  });
  assert.equal((await (await f.request(owner.client, '/api/session')).json()).user.role, 'admin');
  assert.equal((await f.request(owner.client, '/api/moderation/reports')).status, 200);
});
test('moderación aplica retirada y suspensión, sin dar acceso global al chat a otros usuarios', async () => {
  const f = fixture(),
    a = await f.signup('alice'),
    b = await f.signup('bob');
  const owner = await f.chatgpt('owner@example.test');
  await f.request(owner.client, '/api/auth/exchange', 'POST', {
    code: new URL(owner.response.headers.get('location')).searchParams.get('auth_code'),
    state: owner.state,
    verifier: owner.verifier,
  });
  const post = await (
    await f.request(a.client, '/api/posts', 'POST', { body: 'Contenido denunciado' })
  ).json();
  await f.request(b.client, '/api/reports', 'POST', {
    targetType: 'post',
    targetId: post.id,
    reason: 'Contenido que requiere revisión',
  });
  let reports = await (await f.request(owner.client, '/api/moderation/reports')).json();
  assert.equal(reports.data[0].targetContent, 'Contenido denunciado');
  await f.request(owner.client, `/api/moderation/reports/${reports.data[0].id}`, 'POST', {
    action: 'remove',
  });
  assert.equal((await f.request(a.client, `/api/posts/${post.id}`)).status, 404);
  await f.request(b.client, '/api/reports', 'POST', {
    targetType: 'user',
    targetId: a.user.id,
    reason: 'Revisión de esta cuenta',
  });
  reports = await (await f.request(owner.client, '/api/moderation/reports')).json();
  await f.request(owner.client, `/api/moderation/reports/${reports.data[0].id}`, 'POST', {
    action: 'remove',
  });
  assert.equal((await (await f.request(a.client, '/api/session')).json()).user, null);
});
test('eliminar cuenta retira R2, revoca sesiones y conserva mensajes sin identidad', async () => {
  const f = fixture(),
    a = await f.signup('alice'),
    b = await f.signup('bob');
  const key = 'photos/00000000-0000-4000-8000-000000000001.webp';
  f.objects.set(key, new Uint8Array([1, 2, 3]));
  f.sqlite
    .prepare('INSERT INTO media(id,owner_id,key,bytes,created_at) VALUES(?,?,?,?,?)')
    .run('photo-fixture', a.user.id, key, 3, Date.now());
  const post = await f.request(a.client, '/api/posts', 'POST', {
    body: 'Foto',
    mediaIds: ['photo-fixture'],
  });
  assert.equal(post.status, 201);
  const conversation = await (
    await f.request(a.client, '/api/conversations', 'POST', { userId: b.user.id })
  ).json();
  await f.request(a.client, `/api/conversations/${conversation.id}/messages`, 'POST', {
    clientId: 'retained',
    body: 'Ya enviado',
  });
  assert.equal(
    (
      await f.request(a.client, '/api/account', 'DELETE', {
        confirmation: 'alice',
        password: 'wrong',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request(a.client, '/api/account', 'DELETE', {
        confirmation: 'alice',
        password: 'a-fixture-password-1234',
      })
    ).status,
    200,
  );
  assert.equal(f.objects.size, 0);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM posts').get().n, 0);
  assert.equal(
    f.sqlite.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').get(a.user.id).n,
    0,
  );
  const messages = await (
    await f.request(b.client, `/api/conversations/${conversation.id}/messages`)
  ).json();
  assert.equal(messages.data[0].author, null);
  assert.equal(messages.data[0].body, 'Ya enviado');
  await f.request(b.client, '/api/account', 'DELETE', {
    confirmation: 'bob',
    password: 'a-fixture-password-1234',
  });
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM conversations').get().n, 0);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM messages').get().n, 0);
});
test('protección de origen y solicitudes de eliminación no exponen cuentas', async () => {
  const f = fixture(),
    a = await f.signup('alice');
  const hostile = await handleApi(
    new Request('https://social.test/api/posts', {
      method: 'POST',
      headers: {
        origin: 'https://evil.test',
        cookie: a.client.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ body: 'CSRF' }),
    }),
    f.env,
  );
  assert.equal(hostile.status, 403);
  const missing = await handleApi(
    new Request('https://social.test/api/posts', {
      method: 'POST',
      headers: { cookie: a.client.cookie, 'content-type': 'application/json' },
      body: '{}',
    }),
    f.env,
  );
  assert.equal(missing.status, 403);
  assert.equal(
    (
      await f.request(f.client(), '/api/deletion-requests', 'POST', {
        email: 'unknown@example.test',
      })
    ).status,
    201,
  );
  assert.equal((await f.request(a.client, '/api/moderation/deletion-requests')).status, 403);
});
test('Ably: firma HMAC, sólo suscripción propia y reintento de la cola sin cuerpos privados', async () => {
  const f = fixture();
  const key = 'testApp.testKey:FIXTURE_ONLY_SECRET';
  const token = await ablyTokenRequest({ ABLY_API_KEY: key }, 'alice');
  assert.equal(
    token.mac,
    createHmac('sha256', 'FIXTURE_ONLY_SECRET')
      .update(
        [
          token.keyName,
          token.ttl,
          token.capability,
          token.clientId,
          token.timestamp,
          token.nonce,
        ].join('\n') + '\n',
      )
      .digest('base64'),
  );
  assert.deepEqual(JSON.parse(token.capability), {
    'sn:feed': ['subscribe'],
    'sn:user:alice': ['subscribe'],
  });
  assert.equal(token.ttl, 300000);
  assert.ok(!JSON.stringify(token).includes('FIXTURE_ONLY_SECRET'));
  await enqueueRealtime(f.db, ['sn:user:alice', 'sn:user:bob']);
  await flushRealtime(f.db, { ABLY_API_KEY: key }, async () => new Response(null, { status: 503 }));
  assert.equal(f.sqlite.prepare('SELECT attempts FROM realtime_outbox').get().attempts, 1);
  f.sqlite.exec('UPDATE realtime_outbox SET next_attempt_at=0');
  let count = 0;
  await flushRealtime(f.db, { ABLY_API_KEY: key }, async (url, options) => {
    count++;
    const body = JSON.parse(options.body);
    assert.deepEqual(body[0].data, { kind: 'changed' });
    assert.equal(body[0].name, 'changed');
    assert.match(url, /rest\.ably\.io/);
    return new Response(null, { status: 201 });
  });
  assert.equal(count, 2);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM realtime_outbox').get().n, 0);
});
