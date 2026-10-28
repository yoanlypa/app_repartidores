import { crearApp } from './app.js';
import { config } from './config.js';
import { conectar } from './db/index.js';
import { crearExtractorAnthropic } from './ia/extraer.js';

const { db, migrar } = conectar(config.databaseUrl());

// Aplica las migraciones pendientes al arrancar (seguro: solo ejecuta las nuevas).
await migrar();

const app = await crearApp({
  db,
  origenFrontend: config.origenFrontend,
  cookieSegura: config.cookieSegura,
  logger: true,
  extractor: config.anthropicApiKey
    ? crearExtractorAnthropic({ apiKey: config.anthropicApiKey, modelo: config.modeloIa })
    : null,
});

if (!config.anthropicApiKey) app.log.warn('ANTHROPIC_API_KEY no configurada: la extracción con IA está desactivada.');

await app.listen({ port: config.puerto, host: '0.0.0.0' });
