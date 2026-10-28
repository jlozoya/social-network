import { env } from 'cloudflare:workers';
import { handleApi } from '../../../lib/api';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return handleApi(request, env);
}
