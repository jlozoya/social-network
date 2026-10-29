# Social Network en ChatGPT Sites

Aplicación social para Sites, con frontend React/Vinext, API HTTP en Workers,
datos relacionales en D1, fotografías en R2 y actualizaciones en Ably.

## Alcance de la primera versión

Perfiles públicos o privados, fotos de perfil y portada, publicaciones con
hasta cuatro fotos y audiencia configurable, comentarios, siete reacciones,
seguimiento con aprobación, bloqueos, conversaciones directas, denuncias y
moderación. Incluye las páginas públicas de privacidad, términos, normas,
seguridad infantil, soporte y solicitud de eliminación de cuenta.

El usuario eligió migrar este núcleo social primero. Tienda, historias,
directos de LiveKit, OAuth para aplicaciones de terceros y MFA no se exponen
en esta variante. El proyecto NestJS/Ionic original permanece en `apps/`.
No se han migrado registros de MongoDB ni se necesita Redis para esta versión.

## Identidad y sesiones

Por petición del usuario se ofrecen ambos accesos. ChatGPT conserva su flujo
de identidad gestionado por Sites; el acceso adicional con contraseña pertenece
a Social Network. La cuenta de contraseña no se vincula automáticamente por
coincidencia de correo: el usuario debe entrar y solicitar la vinculación.

Las contraseñas se derivan con PBKDF2-SHA256, sal aleatoria de 128 bits y
100 000 iteraciones, compatibles con WebCrypto de Workers. Las sesiones usan
tokens aleatorios de 256 bits, almacenados como SHA-256 en D1 y enviados en
cookies HttpOnly y Secure en HTTPS. En la web son SameSite=Lax; las peticiones
del WebView Android (origen https://localhost) usan SameSite=None con CORS limitado. Se comprueban caducidad y
suspensión en cada petición. El correo de las cuentas con contraseña no se
verifica mediante SMTP; la recuperación se atiende desde el contacto de soporte.
ChatGPT ofrece una vía alternativa de recuperación cuando ya está vinculado.

Android abre ChatGPT en el navegador mediante Capacitor Browser. El retorno
`socialnetwork://auth` entrega un código de un solo uso, con dos minutos de
validez, ligado al estado y al verificador PKCE de la app que inició el flujo.
La app intercambia ese código y recibe su cookie de sesión HttpOnly en el WebView.
La interfaz se empaqueta localmente con `npm run build:mobile` y
`SOCIAL_NETWORK_SITES_URL` como origen público de la API; Capacitor no carga
un servidor de desarrollo mediante `server.url`. Hace falta verificar cookies,
fotografías privadas y retorno de ChatGPT en un dispositivo antes de Play.
Nunca se incluye un token de acceso privado de Sites dentro del APK/AAB.

## Configuración del Site

El ID real está en `.openai/hosting.json`, con `d1: "DB"` y `r2: "BUCKET"`.
Conservarlo al publicar nuevas versiones. Sites aplica las migraciones de
`drizzle/`; el código de las peticiones no crea tablas.

Variables de producción, guardadas como secretos en Sites:

- `ADMIN_EMAILS`: correos separados por comas. Sólo una identidad de ChatGPT
  verificada puede recibir el rol administrador al crear o vincular su cuenta.
  Registrar una contraseña con uno de esos correos no concede ese rol.
- `ABLY_API_KEY`: clave de la app Ably Social Network con Publish y Subscribe,
  preferiblemente limitada a `sn:*`. No se incluye en el manifiesto ni en el
  JavaScript del navegador. App Ably: `WsQueQ`, cuenta Lozoya.

Soporte público: `jlozoya1995+socialnetwork@gmail.com`.

## Ably

`POST /api/realtime/token` firma TokenRequests de cinco minutos y fija el
`clientId`. Cada cliente sólo puede suscribirse a `sn:feed` y a su canal
`sn:user:<id>`; no puede publicar ni escuchar canales ajenos. La API emite
avisos sin cuerpos de mensajes o publicaciones. El frontend recupera el
contenido desde la API, que vuelve a verificar audiencia, bloqueos y pertenencia.

Los avisos pendientes se conservan en una outbox de D1 con exclusión por lease,
reintentos con espera y un identificador de publicación idempotente. Se vacían
con las peticiones de la app y se resincroniza el contenido al conectar o
recuperar la conexión. La persistencia del chat está en D1, no en Ably.
Si Ably no está disponible, la interfaz lo indica y permite actualizar de forma
manual; no se presenta como una conexión en vivo.

El plan Free de Ably incluye 6 millones de mensajes mensuales, 200 conexiones
simultáneas y 200 canales simultáneos. Comprobar el consumo antes de ampliar
la beta: [límites oficiales](https://ably.com/docs/platform/pricing/free).
Sites utiliza la disponibilidad y cuotas del plan de ChatGPT del propietario.

## Desarrollo y validación

Este proyecto tiene su propio `package-lock.json`; ejecutar las órdenes desde
esta carpeta. El flujo de Sites usa los helpers del plugin para instalar,
construir, guardar la fuente y publicar.

También admite `bun install` con Bun 1.4.2 y su propio `bun.lock`.
Al actualizar dependencias, sincronizar ambos lockfiles; CI y los helpers
de Sites siguen instalando con npm.

Para trabajo independiente:

```sh
npm ci
npm run typecheck
npm run test:backend
npm run build
npm run dev
```

Las pruebas usan SQLite en memoria y R2 simulado. Cubren consentimiento,
sesiones, privacidad, bloqueos, idempotencia del chat, PKCE, roles, denuncias,
eliminación y firma/reintentos de Ably. Los datos de prueba nunca se cargan en
producción. La comprobación nativa de Android y la conexión real con Ably son
validaciones adicionales; no se deducen de estos tests.

Para D1 local, seguir las órdenes del starter que aparecen más abajo, con las
migraciones pendientes y el Worker construido. `.wrangler/`, `.dev.vars*`,
`node_modules/`, las salidas de pruebas y las compilaciones están ignorados.

## Datos y operación

Las consultas usan parámetros SQL, índices y claves foráneas. Se comprueba
el acceso antes de leer o escribir contenido. Los adjuntos son fotos WebP
normalizadas en el navegador, de hasta 6 MB tras la conversión. La API publica
R2 con `nosniff`, control de acceso y caché privada breve.

Al eliminar una cuenta se retira su contenido y se encolan las fotos para
eliminarlas de R2 con reintentos. Los mensajes enviados se conservan sin autor
en las conversaciones de otros participantes, como se explica en la política
de privacidad. Las solicitudes web de eliminación se registran en D1 y requieren
verificación manual del operador; marcar una como atendida no borra una cuenta.

El operador debe revisar denuncias y solicitudes desde Moderación y atender
el correo de soporte, incluyendo los casos de seguridad infantil y revisiones
de suspensiones. Antes de publicar en Google Play hay que verificar esta
operación, el AAB firmado, el acceso desde un dispositivo y las declaraciones
reales de la consola. La publicación de este Site por sí sola no resuelve el
aviso de inactividad de Play Console.

---

## Referencia del starter mantenido

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git and `tar` (including Windows `tar.exe`) are required for publishing; portable publication does not require Bash

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

Publish archives outside the source checkout or under its ignored `outputs/` directory. Local `.env*`, `.dev.vars*`, TypeScript build state, and tool runtime directories are ignored; keep the hosting manifest, migrations, and authored scripts in source control.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For managed Linux browser QA, follow the Sites skill's managed preview reference. The daemon runs the project's Vite dev script with `--host 0.0.0.0 --port 4173 --strictPort`; use the CLI's returned URL. The ignored local profile survives the daemon's cleared environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `worker/index.ts` is the production Worker entrypoint and preserves request-scoped connector bindings
- `scripts/vite/` contains the maintained Vite integrations and the vendored Sites plugin license
- `scripts/connector-preview/` contains the local connector preview Worker and session helpers
- the remaining `scripts/` files select execution profiles and run installation, development, and builds; the plugin's helpers orchestrate the Sites lifecycle
- `dist/` contains generated deployment output; `.vinext/`, `.wrangler/`, and `.sites-runtime/` contain ignored local tool state
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from 'next/headers';

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get('oai-authenticated-user-id');
  const email = requestHeaders.get('oai-authenticated-user-email');
  const encodedFullName = requestHeaders.get('oai-authenticated-user-full-name');
  const fullName =
    encodedFullName &&
    requestHeaders.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8'
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
