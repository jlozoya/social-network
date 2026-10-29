# Arquitectura de Social Network en Sites

La web y el contenedor Android utilizan la misma aplicación React. Los adaptadores
de entrada son `app/page.tsx` para Vinext y `mobile/main.tsx` para Capacitor. La
API se ejecuta en Cloudflare Workers con D1, R2 y Ably.

## Cliente

`app/social-app.tsx` compone la navegación, las pantallas y los diálogos. Los
módulos de `app/client/` tienen responsabilidades concretas:

| Módulo              | Responsabilidad                                                            |
| ------------------- | -------------------------------------------------------------------------- |
| `types.ts`          | Contratos HTTP que utiliza la interfaz; no importa React ni el servidor.   |
| `api-client.ts`     | Fetch, cookies, errores HTTP y resolución de URL de medios en Android.     |
| `app-context.ts`    | Estado y acciones compartidas por las pantallas.                           |
| `hooks.ts`          | Carga de recursos, paginación y ejecución de tareas con mensajes de error. |
| `use-session.ts`    | Sesión, acceso con ChatGPT, PKCE y retorno desde el navegador nativo.      |
| `use-navigation.ts` | Vista actual, parámetros de URL e historial del navegador.                 |
| `use-realtime.ts`   | Conexión Ably, suscripciones, resincronización y limpieza de listeners.    |
| `ui.tsx`            | Componentes visuales compartidos que la aplicación utiliza.                |
| `media.ts`          | Validación y preparación de fotografías y su subida a la API.              |
| `shell-parts.tsx`   | Personas sugeridas y formularios de denuncia y publicación compartida.     |

Las pantallas importan el contrato, hook o componente que necesitan directamente.
El transporte HTTP no depende de componentes visuales. El cliente no importa
`lib/`, los bindings de Cloudflare ni código con acceso a D1 o R2.

## Servidor

`app/api/[...path]/route.ts` adapta las peticiones de Vinext a `lib/api.ts`.
`lib/api.ts` conserva las políticas transversales y despacha a `lib/routes/`:

- `auth.ts`: sesión, acceso con contraseña/ChatGPT, salud y autenticación de Ably.
- `account.ts`: perfil propio, contraseña y solicitudes/eliminación de cuenta.
- `posts.ts`: publicaciones, comentarios y reacciones.
- `people.ts`: perfiles, seguimiento, solicitudes y bloqueos.
- `chat.ts`: conversaciones, mensajes y confirmaciones de lectura.
- `media.ts`: subida, lectura y eliminación de fotografías.
- `moderation.ts`: denuncias, suspensiones y solicitudes de datos.

Los handlers reciben un contexto de petición tipado. Devuelven una respuesta si
la ruta corresponde a su dominio y `undefined` en otro caso. Los handlers
protegidos reciben además un actor autenticado; no vuelven a decidir la política
global de acceso.

El orden de ejecución es relevante:

1. Validar origen, preflight y protección de formularios con cookies.
2. Resolver la sesión y las rutas públicas.
3. Exigir un actor para las rutas protegidas.
4. Atender el token de Ably con su propio límite de peticiones.
5. Aplicar límites y mantenimiento a las demás mutaciones.
6. Ejecutar el handler del dominio y encolar los avisos de tiempo real.
7. Normalizar errores, caché y cabeceras de seguridad.

`lib/http.ts` contiene los contratos de petición y los helpers HTTP.
`lib/auth-guards.ts` concentra moderación y reautenticación. `lib/posts.ts`
comparte la eliminación de publicaciones entre su autor y moderación.
Los módulos `auth`, `social`, `media`, `realtime` y `data` conservan las reglas de
negocio, las comprobaciones de visibilidad y el acceso a los servicios de datos.
Las consultas siguen siendo parametrizadas.

Los helpers de ejecución de Sites, el adaptador de connectors, el manifiesto de
hosting y las migraciones son infraestructura mantenida y se conservan.

## Validación

Desde `sites/social-network/`:

```sh
npm run typecheck
npm run test:backend
npm run test:client
npm run build
```

`typecheck` también rechaza imports, variables y parámetros sin uso, así como
importaciones del servidor desde el cliente. El transporte HTTP se comprueba
por separado para impedir dependencias de React o de componentes visuales. Las pruebas
de backend ejercitan la API completa con SQLite y R2 simulado. Las de cliente
comprueban el transporte real con respuestas HTTP simuladas, cookies, medios
privados, errores y validación de fotografías, sin necesitar React ni un DOM.
`scripts/run-tests.mjs` compila los módulos de cada suite a una salida ignorada.

Para validar Android se ejecuta `npm run build:mobile` con
`SOCIAL_NETWORK_SITES_URL` definido. La autenticación y los plugins nativos
también requieren comprobaciones en un dispositivo; un build web no las sustituye.
