# Social Network

![Social Network: lo que importa, más cerca](.github/social-preview.png)

Red social para web y Android con perfiles públicos o privados, publicaciones
con fotos, comentarios, reacciones, seguimiento, chat, bloqueos y moderación.
La versión publicada usa **React, ChatGPT Sites, D1, R2, Ably y Capacitor**,
con acceso por contraseña o ChatGPT.

[Abrir Social Network](https://social-network-lozoya.neatloon16.chatgpt.site) ·
[Instalar la beta de Android](https://play.google.com/apps/internaltest/4701543898566185898) ·
[Desarrollo en Sites](sites/social-network/README.md)

El repositorio también conserva la aplicación Ionic/Angular y la API NestJS
anteriores como variante `legacy`, con historias, directos, tienda y OAuth
para otras aplicaciones. Esas funciones adicionales pertenecen a esa variante.

```
social-network/
├── sites/
│   └── social-network/ React + API Sites — D1, R2 y Ably (versión publicada)
├── apps/
│   ├── api/          API GraphQL legacy — NestJS + Mongoose + MongoDB
│   └── mobile/       Contenedor Android de Sites y aplicación Ionic/Angular legacy
└── packages/
    └── shared/       Contratos de dominio compartidos por ambos
```

`packages/shared` es la pieza que sostiene el conjunto: define los modelos y
los cuerpos de petición y respuesta una sola vez, de modo que si el servidor
cambia la forma de un `Post`, la aplicación deja de compilar en lugar de fallar
en tiempo de ejecución.

Las instrucciones de puesta en marcha que siguen corresponden a la variante
legacy. Para la versión publicada, consulta [Sites](sites/social-network/README.md)
y [la publicación en Google Play](deploy/play/README.md).

## Puesta en marcha

Requisitos: **Node.js 22.22.3+, 24.15.0+ o 26+** y **npm 10.9 o superior**.
Se recomienda Node.js 24, como en CI y en las imágenes de Docker.

```bash
npm install
```

También se puede instalar con **Bun 1.4.2** usando `bun install`. El archivo
`bun.lock` fija esa instalación y `trustedDependencies` permite los scripts
nativos necesarios para SWC, Angular y Argon2. CI y Docker siguen usando
`npm ci` con `package-lock.json`; al actualizar dependencias hay que mantener
ambos archivos sincronizados.

Si Bun muestra `Unknown lockfile version`, comprueba `bun --version` y actualízalo
con `bun upgrade`: Bun 1.3 no puede leer el formato de los lockfiles actuales.

Levanta la base de datos. Con Docker no hace falta instalar nada más, y las
credenciales ya coinciden con las del archivo de ejemplo:

```bash
docker compose up -d
```

Mongo arranca en «replica set» de un nodo —sólo así ofrece transacciones, y el
inventario las necesita— y el conjunto se inicia solo la primera vez: basta con
esperar a que el contenedor salga como `healthy`.

Si vienes de una versión anterior del `docker-compose.yml`, el conjunto guardaba
como miembro el id del contenedor viejo y Mongo no se reconocerá en él. Se
arregla una vez:

```bash
docker compose exec mongo mongosh --quiet --eval "db.getMongo().setReadPref('secondaryPreferred'); const c = db.getSiblingDB('local').system.replset.findOne(); c.members[0].host = 'mongo:27017'; db.adminCommand({ replSetReconfig: c, force: true })"
```

Si prefieres tu propio **MongoDB 8**, ajusta `DATABASE_URL` en el paso
siguiente; tendrá que estar en «replica set» por lo mismo.

Configura la API a partir del ejemplo:

```bash
cp apps/api/.env.example apps/api/.env
```

Como mínimo hay que rellenar `DATABASE_URL` y los dos secretos de JWT, que
deben tener 32 caracteres o más:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Carga unos datos de ejemplo:

```bash
npm run db:seed
```

Y arranca las dos partes a la vez:

```bash
npm run dev
```

- API: <http://localhost:3000/graphql> — en desarrollo, esa misma dirección
  abre GraphiQL con el esquema y un editor de consultas
- Aplicación: <http://localhost:8100>

El seed deja una cuenta por rol (`admin@social-network.test`, `supervisor@social-network.test`,
`repartidor@social-network.test`, `usuario@social-network.test`), todas con la contraseña
`social1234`.

## Órdenes disponibles

| Orden                    | Qué hace                                    |
| ------------------------ | ------------------------------------------- |
| `npm run dev`            | Levanta API y aplicación en paralelo        |
| `npm run build`          | Compila los tres paquetes en orden          |
| `npm run lint`           | ESLint, Stylelint, traducciones y formato   |
| `npm run lint:infra`     | Flujos, Dockerfile y guiones (con Docker)   |
| `npm run format`         | Da formato a todo con Prettier              |
| `npm test`               | Pruebas unitarias                           |
| `npm run db:seed`        | Carga datos de ejemplo                      |
| `npm run migrate:mongo`  | Vuelca en Mongo la base MySQL anterior      |
| `npm run migrate:social` | Adapta los datos existentes a la red social |
| `npm run test:e2e`       | Pruebas de extremo a extremo de la API      |
| `docker compose up -d`   | Levanta MongoDB para desarrollo             |
| `docker compose down -v` | Lo para y borra sus datos                   |

### Dependencias y seguridad

TypeScript se mantiene en 6.0 porque Angular 22 y `typescript-eslint` aún no
admiten la versión 7. GraphQL se mantiene en 16 y `graphql-upload` en 17 para
respetar la compatibilidad de Apollo Server 5.

El `override` de Vite en `package.json` permite que `@angular/build` use una
versión corregida de la serie 8.3, en lugar de la 8.3.0 que fija Angular 22.2.3.
Se puede retirar cuando Angular incorpore una versión corregida.

Para revisar las dependencias, ejecuta
`npm outdated --workspaces --include-workspace-root`, `npm audit` y
`npm audit --omit=dev`. Al 21 de octubre de 2026, la auditoría de producción no
tiene avisos; la auditoría completa mantiene diez avisos de desarrollo derivados
de [`braces`, sin parche publicado](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
que llega a través de Stylelint. Actualizar Stylelint y sus dependencias cuando
publiquen una corrección; no se han silenciado los avisos.

### Qué revisa el lint

- **ESLint**, con las reglas que usan los tipos del proyecto, en la API, la
  aplicación —plantillas incluidas, con `angular-eslint`— y los contratos
  compartidos.
- **Stylelint** en el SCSS de la aplicación.
- **Las traducciones**: `es.json` y `en.json` con las mismas claves y los mismos
  huecos `{{…}}`, sin textos vacíos.
- **Prettier**, que da el mismo formato a todo el monorepo.
- **actionlint, hadolint y shellcheck** para los flujos de GitHub, los
  Dockerfile y los guiones de shell, en su propio trabajo del CI; en local
  necesitan Docker.

Si el lint se queja del formato, `npm run format` lo arregla.

### Pruebas en VS Code

La configuración compartida de `.vscode/settings.json` limita la extensión Vitest
a `vitest.config.*`. Así descubre las pruebas unitarias de la API sin cargar los
plugins de Cloudflare del sitio ni arrancar las pruebas de extremo a extremo.
Las pruebas de Angular se ejecutan con `npm run test:mobile`; las de extremo a
extremo, con `npm run test:e2e` y una base Mongo de prueba.

## Migrar los datos de la versión anterior

El script lee la base MySQL sin modificarla y la vuelca en Mongo: los
identificadores enteros pasan a `ObjectId`, los importes a céntimos y las
columnas a `camelCase`. Apunta `MYSQL_URL` a la base antigua en `apps/api/.env`
y prueba primero en seco:

```bash
npm run migrate:mongo -w @social-network/api -- --dry
npm run migrate:mongo
```

Las contraseñas se conservan como los hashes bcrypt que generaba Laravel: el
servidor sabe verificarlas y las reescribe como Argon2id la primera vez que
cada persona inicia sesión, así que nadie tiene que restablecer nada.

### Si vienes de la base `respet`

La base pasó a llamarse `social_network`. Mongo no sabe renombrar una base, así
que se copia con las herramientas de siempre —con la API parada— y se borra la
vieja cuando se haya comprobado que está todo:

```bash
mongodump --uri="$DATABASE_URL" --archive=/tmp/copia.archive --db=respet
mongorestore --uri="$DATABASE_URL" --archive=/tmp/copia.archive --nsFrom='respet.*' --nsTo='social_network.*'
```

Después hay que apuntar `DATABASE_URL` a `.../social_network` y arrancar. En el
contenedor de desarrollo, lo mismo con `docker compose exec mongo sh -c '…'`.

## Qué ha cambiado respecto a la versión anterior

### Backend: de Lumen a NestJS

| Antes                             | Ahora                    | Motivo                                                   |
| --------------------------------- | ------------------------ | -------------------------------------------------------- |
| Lumen 8 (PHP)                     | NestJS 12                | Mismo lenguaje que la aplicación y contratos compartidos |
| Eloquent                          | Mongoose 9 sobre MongoDB | Documentos con la forma que ya tenían las respuestas     |
| Rutas REST                        | Un esquema de GraphQL    | La app pide lo que pinta, y en una sola ida y vuelta     |
| OAuth2 de Passport                | JWT con refresh rotativo | El `client_secret` viajaba dentro del binario de la app  |
| bcrypt                            | Argon2id                 | Recomendación actual de OWASP frente a ataques con GPU   |
| Intervention Image                | sharp                    | Más rápido y descarta los EXIF, incluida la posición GPS |
| srmklive/paypal                   | Cliente REST propio      | Sólo hacían falta tres operaciones                       |
| `addresses` + `directions`        | `locations`              | Eran dos tablas idénticas                                |
| `post_media`, `product_media`     | Clave foránea en `media` | Las tablas puente no aportaban nada                      |
| `invoices`, `items`, `ipn_status` | `payments`               | Un solo sitio donde mirar un cobro                       |

Además, el servidor ya no se fía del perfil que le manda el cliente al entrar
con Google o Facebook: verifica el token contra el proveedor y decide él de
quién es la cuenta. Antes bastaba con conocer el correo de alguien para
suplantarlo.

### Aplicación: de Angular 10 a Angular 22

| Antes                                                                            | Ahora                                    |
| -------------------------------------------------------------------------------- | ---------------------------------------- |
| Angular 10, Ionic 5, Capacitor 2                                                 | Angular 22, Ionic 9, Capacitor 8         |
| NgModules por pantalla                                                           | Componentes standalone y `loadComponent` |
| `*ngIf` / `*ngFor`                                                               | `@if` / `@for`                           |
| TSLint                                                                           | ESLint                                   |
| Karma y Jasmine                                                                  | Vitest                                   |
| Protractor                                                                       | Playwright                               |
| `@ionic-native/*`                                                                | Plugins de Capacitor                     |
| `@ionic/storage`                                                                 | `@capacitor/preferences`                 |
| Bus de eventos propio                                                            | Señales de Angular                       |
| `@codetrix-studio/capacitor-google-auth` y `@capacitor-community/facebook-login` | `@capgo/capacitor-social-login`          |

## La red social

**Muro.** Publicaciones con fotos, vídeos, ubicación difuminable y público
—todos, seguidores o sólo yo—, con las siete reacciones de Facebook,
comentarios con respuestas y «me gusta», compartir al muro o por privado, y
guardados. El muro de inicio mezcla lo de quienes sigues con lo destacado, y
tiene además las pestañas «Siguiendo» y «Descubrir».

**Historias.** Foto, vídeo o texto sobre un fondo de color, visibles 24 horas,
con visor a pantalla completa, respuestas y reacciones que llegan por privado,
quién las ha visto y destacadas fijas en el perfil.

**Directos.** El vídeo va por LiveKit —autoalojado— y la API reparte los pases,
lleva los comentarios, las reacciones y el recuento de espectadores.

**Mensajería.** Conversaciones de dos y grupos, con adjuntos, notas de voz,
respuestas, reacciones, edición durante quince minutos, borrado para todos o
sólo para uno, «escribiendo…», entregado y visto, silenciar, fijar y archivar.
En el escritorio se abren en ventanas sobre la página, como en Facebook.

**Perfiles.** Portada, foto, biografía, cifras, cuentas privadas con solicitudes
de seguimiento, bloqueos y denuncias, con moderación en el panel.

**Avisos.** Agrupados —«Ana y 3 personas más»—, en tiempo real y por
notificación push en el móvil.

## Cómo se comunican

Toda la API es **un solo esquema de GraphQL**: consultas, mutaciones, archivos
—con la especificación multipart— y suscripciones por WebSocket con
`graphql-ws`. Sólo quedan fuera las rutas que un tercero tiene que poder llamar
sin GraphQL: `/health`, los extremos de OAuth 2.0, el aviso de PayPal y los
archivos ya subidos.

Las suscripciones llevan el chat, los avisos, la presencia y los directos por
una sola conexión, que se autentica con el token de acceso y se cierra en el
acto si la sesión deja de valer.

## Sesiones y verificación en dos pasos

Cada dispositivo abre su propia sesión, con un refresh token opaco que rota en
cada uso; si uno ya usado reaparece, la sesión se cierra entera. Desde
«Seguridad e inicio de sesión» se ve dónde hay sesión abierta, se cierra
cualquiera a distancia y se consulta la actividad reciente.

La verificación en dos pasos es opcional: app de autenticación (TOTP), códigos
de recuperación de un solo uso y dispositivos de confianza en los que no se
vuelve a pedir el código. Lo delicado —desactivarla, borrar la cuenta— pide
confirmar la identidad aunque la sesión esté abierta.

## Plataforma para desarrolladores

`/developers` es el portal: registrar una aplicación, sus credenciales, los
permisos que puede pedir —con los nombres de la Graph API de Facebook—, los
probadores mientras está en desarrollo, el webhook firmado y el uso por horas.

El acceso es OAuth 2.0 con código de autorización y PKCE: la pantalla de
«¿Autorizar esta aplicación?» vive en `/oauth/authorize`, y los extremos de
token, revocación y descubrimiento son HTTP estándar.

## La marca

Nada de lo que se ve lleva un nombre escrito en el código. El nombre, el
eslogan, la descripción, el logotipo, los colores y los enlaces salen de
variables de entorno de la API, que los sirve en la consulta pública
`branding`; la aplicación los pide al arrancar y los aplica: variables CSS,
título de la pestaña, etiquetas `og:`, icono y el hueco `{{app}}` que llevan
todas las traducciones.

```bash
APP_NAME="Mi Red"
APP_TAGLINE="Lo que pasa cerca de ti"
APP_LOGO_URL=https://midominio.com/logo.svg
APP_ICON_URL=https://midominio.com/icono.png
APP_BRAND_COLOR="#2f6df6"
APP_BRAND_GRADIENT="linear-gradient(135deg, #2f6df6 0%, #7c3aed 100%)"
APP_WEBSITE=https://midominio.com
APP_PUBLIC_MAIL=hola@midominio.com
APP_PHONE="+34 600 000 000"
APP_ADDRESS="Calle de ejemplo 1, Ciudad"
APP_FACEBOOK=https://www.facebook.com/tupagina
APP_INSTAGRAM=https://www.instagram.com/tupagina
```

Todas son opcionales: lo que no se ponga usa el valor por defecto de
`packages/shared/src/branding.ts`. Del color principal salen solos el tono de
pulsado, el de fondo y el del texto que va encima, así que basta con uno.
Sin logotipo se dibuja la inicial del nombre sobre el degradado.

El contenedor de la web quiere esas mismas variables —`deploy/docker-compose.yml`
ya se las pasa— para pintar la primera pantalla con la marca correcta antes de
que responda la API. En la aplicación nativa vale la marca compilada hasta que
la API contesta.

Los correos también salen con el nombre, el color y el icono configurados, y
`MFA_ISSUER` —el nombre que aparece en la aplicación de códigos— y `MAIL_FROM`
se deducen del nombre si no se declaran.

## Temas

El tema claro es el de partida, como en Facebook e Instagram; el oscuro y la
opción «seguir al sistema» se eligen desde el menú de la cuenta y quedan
guardados en el dispositivo. Para que no haya destello al arrancar, `index.html`
aplica el guardado antes de que arranque Angular. La paleta está en
`apps/mobile/src/theme/variables.scss`.

## Publicación

La web pública está en [Social Network](https://social-network-lozoya.neatloon16.chatgpt.site).

La variante alojada en ChatGPT Sites está en
[`sites/social-network`](sites/social-network/README.md): usa D1 para los datos,
R2 para las fotos y Ably para los avisos en tiempo real. Su primera versión
incluye perfiles, publicaciones, comentarios, reacciones, seguimiento, chat y
moderación, con acceso por contraseña o ChatGPT. El backend NestJS y la app
Ionic originales siguen disponibles como variante `legacy`.

El flujo Android permite elegir `sites` o `legacy`. En Sites empaqueta la interfaz React localmente, se conecta a la API por HTTPS y configura el retorno de acceso con ChatGPT mediante PKCE.
Las funciones de tienda, historias, directos, OAuth para terceros y MFA del
backend anterior no forman parte de esta primera versión de Sites.

`.github/workflows/ci.yml` comprueba tipos, estilo, pruebas unitarias y de
extremo a extremo —con MongoDB de verdad— y que el esquema publicado coincide
con el código. Al pasar en `master`, `deploy.yml` construye las imágenes de
Docker de la API y de la web —`social-network-api` y `social-network-web`—, las sube a GHCR y, si el servidor está
configurado, las despliega por SSH con `docker compose` y comprueba la salud.
`android.yml` compila el APK y el paquete de Android. El trabajo `sites` de CI
comprueba los tipos, los ocho recorridos del backend y las compilaciones web y móvil.

Para preparar Android con Sites en PowerShell:

```powershell
cd sites/social-network
npm ci
$env:SOCIAL_NETWORK_SITES_URL="https://social-network-lozoya.neatloon16.chatgpt.site"
npm run build:mobile
cd ../../apps/mobile
npx cap add android # Sólo la primera vez
npx cap sync android
node scripts/configure-sites-android.mjs
```

La sincronización de Capacitor no genera un AAB firmado. Para ello hacen falta
el SDK de Android y la clave de firma, o los secretos del flujo Android en GitHub.
Antes de subirlo a Play hay que probar en un dispositivo el acceso con ambos
métodos, las cookies entre orígenes, las fotos privadas y el retorno de ChatGPT.

En `deploy/` está el conjunto para el servidor: Caddy con HTTPS automático, la
API, la web, MongoDB en «replica set», Redis y LiveKit.

Para usar MongoDB Atlas y Upstash Redis externos, consulta
[el despliegue cloud](deploy/cloud/README.md). Incluye un Compose independiente,
un archivo de entorno de ejemplo y una comprobación de conexiones sin escribir
datos. La web pública de soporte puede alojarse en ChatGPT Sites.

## Estado

Las tres partes compilan, pasan ESLint y arrancan. Verificado contra una base de
datos real: alta e inicio de sesión —incluido el segundo paso—, muro,
reacciones, comentarios, perfiles, historias, mensajería con entrega y lectura,
avisos, buscador, tienda y el panel de administración, además del control de
acceso y del límite de peticiones. Las pruebas de extremo a extremo de la API
cubren dieciséis recorridos, sesiones y OAuth incluidos.

Lo que sigue sin comprobarse:

- El volcado de la base anterior (`migrate:mongo`) está escrito y pasa el
  comprobador de tipos, pero **no se ha ejecutado contra una base real**.
  Pruébalo con `--dry` sobre una copia antes de tocar producción.
- Los directos necesitan un servidor de LiveKit (`LIVEKIT_*` en `apps/api/.env`);
  sin él, la sección avisa de que no está disponible.
- Las notificaciones push necesitan las credenciales de Firebase
  (`FIREBASE_SERVICE_ACCOUNT`) y los archivos de Google en la app nativa.
- El acceso con Google y Facebook necesita las credenciales en `apps/api/.env` y
  en `src/environments/`.
- Los pagos con PayPal quedan desactivados mientras `PAYPAL_ENABLED` sea `false`.

Al actualizar desde la versión anterior hay que ejecutar `npm run migrate:social`
—convierte los votos en reacciones, recalcula las cifras de las publicaciones y
pone los nombres de usuario en minúsculas— y tener en cuenta que las sesiones
antiguas dejan de valer: todo el mundo vuelve a entrar una vez.
