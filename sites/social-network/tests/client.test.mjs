import { test } from 'node:test';
import assert from 'node:assert/strict';

// Android serves the interface locally while cookies and private photos belong to the Site.
globalThis.__SOCIAL_NETWORK_ORIGIN__ = 'https://social.example.test';
const { api, ClientError } = await import('../outputs/tests/client/api-client.mjs');
const { photoBlob } = await import('../outputs/tests/client/media.mjs');

test('el transporte conserva la sesión y serializa las mutaciones como JSON', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://social.example.test/api/account');
    assert.equal(options.credentials, 'include');
    assert.equal(options.method, 'PATCH');
    assert.equal(options.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), { displayName: 'Persona' });
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ id: 'person' });
  });
  assert.deepEqual(await api('/api/account', 'PATCH', { displayName: 'Persona' }), {
    id: 'person',
  });
});

test('las fotos privadas conservan el origen del Site y los enlaces externos no cambian', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      data: [{ url: '/media/photo', author: { avatarUrl: '/media/avatar', coverUrl: null } }],
      external: { url: 'https://images.example.test/photo' },
      body: '/media/not-a-link',
    }),
  );
  const result = await api('/api/posts');
  assert.equal(result.data[0].url, 'https://social.example.test/media/photo');
  assert.equal(result.data[0].author.avatarUrl, 'https://social.example.test/media/avatar');
  assert.equal(result.data[0].author.coverUrl, null);
  assert.equal(result.external.url, 'https://images.example.test/photo');
  assert.equal(result.body, '/media/not-a-link');
});

test('una lectura no envía cuerpo ni cabeceras JSON innecesarias', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    assert.equal(options.headers, undefined);
    return Response.json({ user: null });
  });
  assert.deepEqual(await api('/api/session'), { user: null });
});

test('las subidas envían bytes WebP sin convertirlos en JSON', async (t) => {
  const body = new Blob(['image'], { type: 'image/webp' });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.body, body);
    assert.equal(options.headers['content-type'], 'image/webp');
    return Response.json({ id: 'photo' }, { status: 201 });
  });
  assert.deepEqual(await api('/api/media', 'POST', body), { id: 'photo' });
});

test('los errores de la API conservan su estado y un error HTML ofrece un mensaje legible', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Esta cuenta es privada.' }, { status: 403 }),
  );
  await assert.rejects(
    api('/api/posts'),
    (error) =>
      error instanceof ClientError &&
      error.status === 403 &&
      error.message === 'Esta cuenta es privada.',
  );
  fetch.mock.mockImplementation(
    async () => new Response('<html>Unavailable</html>', { status: 503 }),
  );
  await assert.rejects(
    api('/api/posts'),
    (error) =>
      error instanceof ClientError && error.status === 503 && !error.message.includes('<html>'),
  );
});

test('se rechazan formatos y tamaños de fotografía inválidos antes de abrir el decodificador', async () => {
  await assert.rejects(
    photoBlob(new File(['svg'], 'image.svg', { type: 'image/svg+xml' })),
    /JPG, PNG o WebP/,
  );
  await assert.rejects(photoBlob({ type: 'image/jpeg', size: 13 * 1024 * 1024 }), /menos de 12 MB/);
});
