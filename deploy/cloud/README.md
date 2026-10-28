# Despliegue con MongoDB Atlas y Upstash Redis

Esta configuración ejecuta la API NestJS y la aplicación web Ionic detrás de
Caddy, con HTTPS y archivos subidos en un volumen persistente. MongoDB y Redis
son servicios externos; no se arrancan bases de datos locales. ChatGPT Sites
aloja la web pública de presentación, privacidad, términos y solicitudes de
eliminación. La app Android se conecta directamente a la API.

Se necesita un servidor con Docker, disco persistente y dos nombres DNS: uno
para la aplicación web (`DOMAIN`) y otro para la API (`API_DOMAIN`). Sites,
Atlas y Upstash no ejecutan el contenedor NestJS. El coste del servidor y
del correo transaccional se decide aparte.

## 1. MongoDB Atlas Free

1. En el proyecto Social Network, crea un clúster **Free**, sin datos de ejemplo.
   Elige una región disponible cercana al servidor de la API.
2. En Database Access, crea un usuario de aplicación con `readWrite` únicamente
   sobre `social_network`. No uses tu cuenta de Atlas ni un usuario administrador.
3. En Network Access, permite la IP pública de salida del servidor. Para probar
   desde tu equipo, añade también su IP. No abras `0.0.0.0/0` por defecto.
4. En Connect > Drivers, copia la URI `mongodb+srv://…`, especificando
   `/social_network` antes de `?`. Conserva las opciones generadas por Atlas.
   Codifica los caracteres especiales de usuario y contraseña. Guarda la URI
   sólo en el archivo privado del servidor.

Atlas Free ofrece 0.5 GB, incluyendo documentos e índices, hasta 500 conexiones
y 100 operaciones por segundo. Este despliegue limita el pool a cinco conexiones
por instancia de la API; el driver abre además conexiones de monitorización.
Las fotos y los vídeos se guardan en el disco del servidor, no en Atlas.
Consulta los [límites oficiales](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

No copies `replicaSet=rs0` ni `directConnection=true` de la configuración local.
Atlas proporciona su propia topología de réplica. No ejecutes el seed de
desarrollo sobre esta base: crea cuentas con contraseñas conocidas.

## 2. Upstash Redis Free con TLS

1. En la consola de Upstash, crea una base Redis en el plan **Free**, sin
   introducir tarjeta ni cambiar a Pay as You Go. Selecciona una región cercana
   a la API. El plan gratuito admite una base.
2. En Connect > TCP, copia la conexión para `ioredis`, con la forma
   `rediss://default:CONTRASENA_CODIFICADA@HOST.upstash.io:6379/0`.
   No uses el endpoint HTTPS de la API REST ni desactives la validación TLS.
3. Guarda la URI en `REDIS_URL`, sólo en el servidor de la API.

Upstash Free incluye 256 MB, 500 000 comandos mensuales y 10 GB de transferencia.
El cliente `ioredis` que ya usa la API admite su conexión TLS y Pub/Sub.
La presencia renueva cada conexión activa cada 30 segundos con `HSET` y
`PEXPIRE`: una conexión abierta todo el mes consume aproximadamente 172 800
comandos sólo en renovaciones, además del chat y las consultas. Vigila el uso
en las pruebas y no actives un plan de pago automáticamente.

No uses una base anónima temporal de Upstash: caduca a los tres días si no se
reclama. Para este despliegue crea la base dentro de tu cuenta.

Fuentes: [plan gratuito](https://upstash.com/pricing/redis),
[conexión Node.js](https://upstash.com/docs/redis/quickstarts/express) y
[Pub/Sub con ioredis](https://upstash.com/blog/realtime-notifications).

Redis Cloud de redis.io también es compatible, pero su plan Free no incluye
TLS y no se utiliza para este despliegue. Véase su
[documentación de TLS](https://redis.io/docs/latest/operate/rc/security/database-security/tls-ssl/).

Redis contiene datos temporales; los registros persistentes de la aplicación
van a MongoDB. Los límites de peticiones y la autenticación no se trasladan a
Redis por usar esta configuración. Prueba chat, notificaciones y presencia
antes de abrir el servicio a usuarios.

## 3. Preparar el servidor

Desde esta carpeta en el servidor:

```sh
cp .env.example .env
chmod 600 .env
```

Completa las conexiones, dominios, correo SMTP y secretos. Genera dos valores
distintos para JWT, y una clave de 32 bytes para MFA, siguiendo las órdenes del
archivo de ejemplo. Conserva esta última en una copia segura.

`DOMAIN` sirve la aplicación Ionic, incluyendo los enlaces de verificación y
recuperación de contraseña. `APP_WEBSITE` es la URL pública de Sites. Añade
Sites a `CORS_ORIGINS` sólo si sus páginas llaman directamente a la API; para
una web informativa no hace falta. Las credenciales de Atlas y Redis nunca
deben incluirse en el AAB, `env.js`, el repositorio de Sites o JavaScript público.

Desde el repositorio, con las dependencias de la API instaladas, comprueba las
conexiones sin escribir datos:

```sh
node apps/api/scripts/check-cloud-connections.mjs deploy/cloud/.env
```

La comprobación hace `ping` a MongoDB y Redis y revisa que Mongo no sea un nodo
independiente. No verifica operaciones de escritura ni ejecuta transacciones.
No imprime credenciales ni las URI. Hace falta permitir la IP del equipo desde
el que se ejecuta. No equivale a una prueba funcional completa de la app.

Valida y arranca desde `deploy/cloud`:

```sh
docker compose config --quiet
docker compose pull
docker compose up -d
```

También puedes construir las imágenes desde la raíz del repositorio, antes de
arrancar, cuando los paquetes de GHCR aún no estén publicados o sean privados:

```sh
docker build -f apps/api/Dockerfile -t social-network-api:local .
docker build -f apps/mobile/Dockerfile -t social-network-web:local .
```

En ese caso configura `API_IMAGE=social-network-api:local` y
`WEB_IMAGE=social-network-web:local`, y omite `docker compose pull`.

El flujo `.github/workflows/deploy.yml` sigue usando el despliegue anterior de
`deploy/`; no apuntes ese flujo a este servidor hasta adaptarlo a `deploy/cloud/`.
No mezcles ambos proyectos Compose sobre la misma máquina y puertos.

## 4. Comprobar antes de Google Play

- Abre `https://API_DOMAIN/health`: `status` debe ser `ok` y `database`, `up`.
  Este endpoint no comprueba Redis ni SMTP.
- Prueba registro, verificación de correo, recuperación de contraseña, acceso,
  publicaciones, adjuntos, chat entre dos cuentas, notificaciones y eliminación
  de cuenta. Verifica que los archivos sobrevivan a recrear el contenedor.
- Prepara copias de la base de Atlas y del volumen `uploads`; las fotos no están
  incluidas en una copia de MongoDB.
- Configura los endpoints HTTPS reales en la app Android antes de compilar el
  AAB. El `env.js` del contenedor web no modifica la configuración del móvil.
- En Sites publica el nombre y contacto reales, privacidad, términos y una
  vía operativa para solicitar eliminación de cuenta sin reinstalar la app.
  Una página privada de Sites no sirve como enlace público para Google Play.

Este despliegue inicial no ejecuta LiveKit. Sin sus cuatro variables los
directos quedan desactivados. Tampoco habilita pagos ni notificaciones push sin
la configuración de sus proveedores.
