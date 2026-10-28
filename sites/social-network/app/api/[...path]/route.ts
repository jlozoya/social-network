import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { handleApi } from '../../../lib/api';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  const identity =
    new URL(request.url).pathname === '/api/auth/chatgpt' ? await getChatGPTUser() : null;
  return handleApi(request, env, identity);
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
