import type { CapacitorConfig } from '@capacitor/cli';

// Las compilaciones Sites incluyen su propia interfaz compilada. La aplicación Ionic local
// sigue disponible cuando esta variable no está definida.
const sitesUrl = process.env['SOCIAL_NETWORK_SITES_URL'];
if (sitesUrl) {
  const parsed = new URL(sitesUrl);
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  ) {
    throw new Error(
      'SOCIAL_NETWORK_SITES_URL debe ser un origen HTTPS, sin credenciales ni parámetros.',
    );
  }
}

/**
 * Configuración de Capacitor 8.
 *
 * Pasa de JSON a TypeScript para que el editor valide las claves y avise de
 * las que ya no existen. `bundledWebRuntime` desapareció en Capacitor 4 y
 * `cordova` ya no hace falta: la app usa plugins nativos de Capacitor.
 */
const config: CapacitorConfig = {
  appId: 'io.lozoya.socialnetwork',
  appName: 'Social Network',
  webDir: sitesUrl ? '../../sites/social-network/mobile-dist' : 'www',
  ...(sitesUrl
    ? {
        includePlugins: [
          '@capacitor/app',
          '@capacitor/browser',
          '@capacitor/keyboard',
          '@capacitor/splash-screen',
          '@capacitor/status-bar',
        ],
      }
    : {}),
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
    },
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
  server: {
    // `androidScheme: 'https'` es obligatorio desde Capacitor 4 para que el
    // WebView considere seguro el origen y permita cosas como la cámara.
    androidScheme: 'https',
  },
};

export default config;
