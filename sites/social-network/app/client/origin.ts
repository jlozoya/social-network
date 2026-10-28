// Public backend origin compiled into the Android bundle. No runtime secret belongs here.
declare const __SOCIAL_NETWORK_ORIGIN__: string | undefined;
export const siteOrigin =
  typeof __SOCIAL_NETWORK_ORIGIN__ === 'string' ? __SOCIAL_NETWORK_ORIGIN__ : '';
export function siteUrl(path: string): string {
  return siteOrigin ? new URL(path, siteOrigin).href : path;
}
