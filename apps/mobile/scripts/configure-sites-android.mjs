import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function addSitesIntent(manifest) {
  const marker = '<!-- Social Network ChatGPT callback -->';
  if (manifest.includes(marker)) return manifest;
  let changed = false;
  const result = manifest.replace(
    /(<activity\b[^>]*android:name="[^"]*MainActivity"[^>]*>)([\s\S]*?)(<\/activity>)/,
    (_match, start, body, end) => {
      changed = true;
      return `${start}${body}\n            ${marker}\n            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="socialnetwork" android:host="auth" />\n            </intent-filter>\n        ${end}`;
    },
  );
  if (!changed) throw new Error('No se encontró MainActivity en AndroidManifest.xml.');
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  if (!process.env.SOCIAL_NETWORK_SITES_URL) {
    console.log('Backend Ionic local: no se añade el retorno de Sites.');
  } else {
    const root = resolve(import.meta.dirname, '..');
    const path = resolve(root, 'android/app/src/main/AndroidManifest.xml');
    if (!existsSync(path))
      throw new Error('Genera y sincroniza Android con Capacitor antes de configurar Sites.');
    writeFileSync(path, addSitesIntent(readFileSync(path, 'utf8')));
    const version = process.env.ANDROID_VERSION_CODE;
    if (version) {
      if (!/^\d+$/.test(version) || Number(version) < 1 || Number(version) > 2_100_000_000)
        throw new Error('ANDROID_VERSION_CODE no es válido.');
      const gradle = resolve(root, 'android/app/build.gradle');
      const source = readFileSync(gradle, 'utf8');
      if (!/versionCode\s+\d+/.test(source))
        throw new Error('No se encontró versionCode en app/build.gradle.');
      writeFileSync(gradle, source.replace(/versionCode\s+\d+/, `versionCode ${version}`));
    }
    console.log('Android preparado para el retorno socialnetwork://auth con PKCE.');
  }
}
