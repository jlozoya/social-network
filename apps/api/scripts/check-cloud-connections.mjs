/** Comprueba Mongo y Redis sin crear colecciones, usuarios ni claves. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import mongoose from 'mongoose';
import { Redis } from 'ioredis';

const args = process.argv.slice(2);
if (args.length !== 1 || args[0].startsWith('--')) {
  console.error('Uso: node apps/api/scripts/check-cloud-connections.mjs deploy/cloud/.env');
  process.exit(1);
}

let env;

try {
  env = parseEnv(readFileSync(resolve(args[0]), 'utf8'));
} catch {
  console.error(
    'No se pudo leer el archivo de entorno. Copia y completa deploy/cloud/.env.example.',
  );
  process.exit(1);
}

let mongoUrl;
let redisUrl;

try {
  mongoUrl = new URL(env.DATABASE_URL);
  redisUrl = new URL(env.REDIS_URL);

  if (!['mongodb:', 'mongodb+srv:'].includes(mongoUrl.protocol)) {
    throw new Error();
  }

  if (!mongoUrl.pathname || mongoUrl.pathname === '/') {
    console.error('DATABASE_URL debe incluir el nombre de la base de datos.');
    process.exit(1);
  }

  if (!['redis:', 'rediss:'].includes(redisUrl.protocol)) {
    throw new Error();
  }
} catch {
  console.error('Configura DATABASE_URL y REDIS_URL con las URI reales de los proveedores.');
  process.exit(1);
}

if (redisUrl.protocol !== 'rediss:') {
  console.error('Redis externo debe usar TLS: copia la conexión rediss:// del proveedor.');
  process.exit(1);
}

const mongo = new mongoose.mongo.MongoClient(env.DATABASE_URL, {
  maxPoolSize: 1,
  serverSelectionTimeoutMS: 10_000,
  connectTimeoutMS: 10_000,
  socketTimeoutMS: 10_000,
});
const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  connectTimeout: 10_000,
  commandTimeout: 10_000,
  retryStrategy: () => null,
  maxRetriesPerRequest: 0,
});

// El resultado se informa abajo, sin imprimir errores que puedan contener una URI.
redis.on('error', () => {});

try {
  const results = await Promise.allSettled([
    (async () => {
      await mongo.connect();
      await mongo.db().command({ ping: 1 });
      const hello = await mongo.db().admin().command({ hello: 1 });

      if (!hello.setName && hello.msg !== 'isdbgrid') {
        throw new Error('replica-set-required');
      }

      return 'MongoDB: conexión correcta y topología con soporte de transacciones.';
    })(),
    (async () => {
      await redis.connect();

      if ((await redis.ping()) !== 'PONG') {
        throw new Error('unexpected-ping');
      }

      return 'Redis: conexión correcta con TLS.';
    })(),
  ]);

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      console.log(result.value);
    } else {
      const hint =
        index === 0
          ? 'Revisa URI, credenciales, lista de IP permitidas y replica set de Atlas.'
          : 'Revisa host, puerto, credenciales y disponibilidad de TLS del plan de Redis.';

      console.error(
        `${index === 0 ? 'MongoDB' : 'Redis'}: no se pudo validar la conexión. ${hint}`,
      );
      process.exitCode = 1;
    }
  }
} finally {
  redis.disconnect();
  await mongo.close();
}
