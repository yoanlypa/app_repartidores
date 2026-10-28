import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const CARPETA_MIGRACIONES = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function conectar(url: string) {
  const cliente = postgres(url, { max: 10 });
  const db = drizzle(cliente, { schema }) as unknown as Db;
  return {
    db,
    migrar: () => migrate(drizzle(cliente, { schema }), { migrationsFolder: CARPETA_MIGRACIONES }),
    cerrar: () => cliente.end(),
  };
}

export { schema };
