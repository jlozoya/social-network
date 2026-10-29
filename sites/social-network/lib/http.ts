import type { Actor } from './auth';
import type { Bindings, Identity, User } from './data';
import { ApiError } from './data';
import { boundedBody } from './media';

export type RequestContext = {
  request: Request;
  env: Bindings;
  identity: Identity;
  url: URL;
  path: string;
  method: string;
  db: D1Database;
  current: Actor;
  user: User | null;
  ip: string;
};
export type SignedRequestContext = RequestContext & { signed: NonNullable<Actor> };
export type RouteHandler<T = RequestContext> = (context: T) => Promise<Response | undefined>;

export function json(value: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(value, { status, headers });
}
export async function bodyOf(request: Request): Promise<Record<string, unknown>> {
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
