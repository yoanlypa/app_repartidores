import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { usuarioDeToken, COOKIE_SESION } from './auth.js';
import type { Db } from './db/index.js';
import { rutasAuth } from './rutas/auth.js';
import type { Extractor } from './ia/extraer.js';
import { rutasImportaciones } from './rutas/importaciones.js';
import { rutasMeses } from './rutas/meses.js';
import { rutasRepartidores } from './rutas/repartidores.js';

export interface OpcionesApp {
  db: Db;
  /** Origen permitido por CORS, p. ej. https://repartos.yoapro.site (varios separados por coma). */
  origenFrontend: string;
  /** Cookie Secure (true en producción con HTTPS). */
  cookieSegura: boolean;
  logger?: boolean;
  /** Extractor de IA (null si no hay clave configurada). */
  extractor?: Extractor | null;
}

/** Se sube con cada cambio para comprobar qué versión está desplegada. */
export const VERSION = '2026.10.28-2';

export const MAX_MB_ARCHIVO = 20;
export const MAX_ARCHIVOS = 40;

export async function crearApp(op: OpcionesApp) {
  const app = Fastify({ logger: op.logger ?? false, trustProxy: true, bodyLimit: 1024 * 1024 });

  await app.register(cookie);
  await app.register(cors, {
    origin: op.origenFrontend.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: { fileSize: MAX_MB_ARCHIVO * 1024 * 1024, files: MAX_ARCHIVOS, fields: 10 },
  });

  app.decorateRequest('usuario', null);
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[COOKIE_SESION];
    req.usuario = token ? await usuarioDeToken(op.db, token) : null;
  });

  app.setErrorHandler((err, req, reply) => {
    const e = err as { statusCode?: number; code?: string; message: string };
    if (e.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ error: `Algún archivo pasa de ${MAX_MB_ARCHIVO} MB. Exporta el chat "sin archivos".` });
    }
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Error interno. Inténtalo de nuevo.' });
  });

  app.get('/api/salud', async () => ({ ok: true, version: VERSION }));

  await app.register(rutasAuth, { db: op.db, cookieSegura: op.cookieSegura });
  await app.register(rutasRepartidores, { db: op.db });
  await app.register(rutasImportaciones, { db: op.db });
  await app.register(rutasMeses, { db: op.db, extractor: op.extractor ?? null });

  return app;
}
