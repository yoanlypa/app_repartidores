import { crearApp } from './app.js';
import { config } from './config.js';
import { conectar } from './db/index.js';

const { db, migrar } = conectar(config.databaseUrl());

// Aplica las migraciones pendientes al arrancar (seguro: solo ejecuta las nuevas).
await migrar();

const app = await crearApp({
  db,
  origenFrontend: config.origenFrontend,
  cookieSegura: config.cookieSegura,
  logger: true,
});

await app.listen({ port: config.puerto, host: '0.0.0.0' });
