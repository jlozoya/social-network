import { siteOrigin, siteUrl } from './origin';
export class ClientError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const binary = body instanceof Blob;
  const response = await fetch(siteUrl(path), {
    method,
    credentials: 'include',
    headers:
      body === undefined
        ? undefined
        : { 'content-type': binary ? 'image/webp' : 'application/json' },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const raw = await response.text();
  let result: { error?: string };
  try {
    result = JSON.parse(raw, (key, value) =>
      siteOrigin &&
      ['url', 'avatarUrl', 'coverUrl'].includes(key) &&
      typeof value === 'string' &&
      value.startsWith('/media/')
        ? siteUrl(value)
        : value,
    );
  } catch {
    throw new ClientError(
      'El servicio no está disponible. Inténtalo de nuevo en unos minutos.',
      response.status,
    );
  }
  if (!response.ok)
    throw new ClientError(result.error ?? 'No se pudo completar la operación.', response.status);
  return result as T;
}
