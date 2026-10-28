import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { calcularTotales, diasSinReporte, validarDias } from '../src/calculo/validar.js';
import { CARPETA_MIGRACIONES, type Db, schema } from '../src/db/index.js';
import type { DiaExtraido, Extractor } from '../src/ia/extraer.js';
import { formatearMensajes } from '../src/ia/extraer.js';
import { rangoMes } from '../src/rutas/meses.js';

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n));
const dia = (fecha: string, salida: number | null, vuelta: number | null, extra: Partial<DiaExtraido> = {}): DiaExtraido => ({
  fecha,
  salida,
  vuelta,
  confianza: 'alta',
  nota: '',
  mensaje_original: '',
  ...extra,
});

describe('validarDias', () => {
  it('marca error si vuelve con más de los que salió', () => {
    expect(validarDias([dia('2026-10-01', 10, 12)], '2026-10')[0].estado).toBe('error');
  });
  it('marca dudoso si falta un dato o la IA no está segura', () => {
    const v = validarDias([dia('2026-10-01', 10, null), dia('2026-10-02', 10, 1, { confianza: 'baja' })], '2026-10');
    expect(v.map((d) => d.estado)).toEqual(['dudoso', 'dudoso']);
  });
  it('descarta fechas fuera del mes o imposibles y se queda con el último dato de cada día', () => {
    const v = validarDias(
      [dia('2026-09-30', 1, 0), dia('2026-10-03', 95, 3), dia('2026-10-03', 98, 3), dia('2026-02-31', 1, 0)],
      '2026-10',
    );
    expect(v).toHaveLength(1);
    expect(v[0].salida).toBe(98);
  });
  it('marca cifras muy raras respecto a la media', () => {
    const v = validarDias(
      ['01', '02', '03', '05', '06'].map((d, i) => dia(`2026-10-${d}`, i === 4 ? 600 : 100, 5)),
      '2026-10',
    );
    expect(v.at(-1)!.estado).toBe('dudoso');
  });
});

describe('totales', () => {
  it('suma con código: entregados = salida − vuelta, sin contar días con error', () => {
    const t = calcularTotales([
      { salida: 120, vuelta: 8, estado: 'ok' },
      { salida: 115, vuelta: 5, estado: 'ok' },
      { salida: 98, vuelta: 3, estado: 'dudoso' },
      { salida: 10, vuelta: 12, estado: 'error' },
      { salida: null, vuelta: null, estado: 'dudoso' },
    ]);
    expect(t).toEqual({ diasTrabajados: 3, salida: 333, vuelta: 16, entregados: 317, dudosos: 2, errores: 1 });
  });
  it('detecta días laborables sin reporte (lunes a sábado)', () => {
    // 1/10/2026 es jueves; el 4 es domingo.
    expect(diasSinReporte('2026-10', new Set(['2026-10-01', '2026-10-03']), '2026-10-05')).toEqual(['2026-10-02', '2026-10-05']);
  });
  it('el rango incluye la madrugada del día 1 del mes siguiente', () => {
    expect(rangoMes('2026-12')).toEqual({ desde: '2026-12-01T00:00:00', hasta: '2027-01-01T06:00:00', finMes: '2027-01-01' });
  });
  it('formatea los mensajes para la IA en una línea cada uno', () => {
    expect(formatearMensajes([{ fechaHora: '2026-10-01T21:15:00', remitente: 'x', texto: 'hola\nque tal' }])).toBe(
      '2026-10-01 21:15 | hola / que tal',
    );
  });
});

// Extractor falso que imita a la IA: lee "120/8", "salí con 120 volví con 8", etc.
const llamadas: string[] = [];
const extractorFalso: Extractor = async ({ repartidor, mensajes }) => {
  llamadas.push(repartidor);
  const out: DiaExtraido[] = [];
  for (const m of mensajes) {
    const n = m.texto.match(/\d+/g)?.map(Number);
    if (!n || n.length < 2) continue;
    let fecha = m.fechaHora.slice(0, 10);
    if (/ayer/i.test(m.texto)) {
      const d = new Date(fecha + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      fecha = d.toISOString().slice(0, 10);
    }
    out.push(dia(fecha, n[0], n[1], { mensaje_original: m.texto }));
  }
  return out;
};

describe('API de meses', () => {
  let app: Awaited<ReturnType<typeof crearApp>>;
  let cookie = '';

  beforeAll(async () => {
    const pg = new PGlite();
    const db = drizzle(pg, { schema });
    await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });
    const [e] = await db.insert(schema.empresas).values({ nombre: 'E' }).returning();
    await db.insert(schema.usuarios).values({ email: 'e@e.com', nombre: 'E', passwordHash: await hashPassword('secreto123'), empresaId: e.id });
    app = await crearApp({ db: db as unknown as Db, origenFrontend: 'http://x', cookieSegura: false, extractor: extractorFalso });
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'e@e.com', password: 'secreto123' } });
    cookie = `sesion=${r.cookies.find((c) => c.name === 'sesion')!.value}`;

    // Subir y confirmar el chat de Ana.
    const f = new FormData();
    f.append('archivos', new Blob([fx('Chat de WhatsApp con Ana.txt')]), 'Chat de WhatsApp con Ana.txt');
    const an = (await app.inject({ method: 'POST', url: '/api/importaciones/analizar', headers: { cookie }, payload: f })).json();
    const c = await app.inject({
      method: 'POST',
      url: `/api/importaciones/${an.importacionId}/confirmar`,
      headers: { cookie },
      payload: { decisiones: [{ clave: 'ana', accion: 'crear' }] },
    });
    expect(c.json().mesesAfectados).toEqual(['2026-10']);
  });

  afterAll(() => app?.close());

  it('procesa el mes con la IA y devuelve la tabla con totales calculados por código', async () => {
    const p = await app.inject({ method: 'POST', url: '/api/meses/2026-10/procesar', headers: { cookie } });
    expect(p.json()).toMatchObject({ procesados: 1, errores: [] });

    const t = (await app.inject({ method: 'GET', url: '/api/meses/2026-10', headers: { cookie } })).json();
    const ana = t.repartidores[0];
    expect(ana.nombre).toBe('Ana');
    // "Salí con 80, volví con 4" el 1 y "ayer 75 y 2" a las 00:05 del 2 → también el 1: gana el último.
    expect(ana.dias).toHaveLength(1);
    expect(ana.totales).toMatchObject({ diasTrabajados: 1, salida: 75, vuelta: 2, entregados: 73 });
    expect(t.totales.entregados).toBe(73);
  });

  it('respeta las correcciones manuales al volver a procesar', async () => {
    const t = (await app.inject({ method: 'GET', url: '/api/meses/2026-10', headers: { cookie } })).json();
    const id = t.repartidores[0].dias[0].id;
    const e = await app.inject({ method: 'PATCH', url: `/api/registros/${id}`, headers: { cookie }, payload: { salida: 80, vuelta: 4 } });
    expect(e.json().estado).toBe('ok');

    await app.inject({ method: 'POST', url: '/api/meses/2026-10/procesar', headers: { cookie } });
    const t2 = (await app.inject({ method: 'GET', url: '/api/meses/2026-10', headers: { cookie } })).json();
    expect(t2.repartidores[0].dias[0]).toMatchObject({ salida: 80, vuelta: 4, entregados: 76, editadoManual: true });
  });

  it('lista los meses con mensajes', async () => {
    const r = (await app.inject({ method: 'GET', url: '/api/meses', headers: { cookie } })).json();
    expect(r.meses[0]).toMatchObject({ mes: '2026-10', estado: 'abierto' });
    expect(r.meses[0].procesado).not.toBeNull();
  });

  it('rechaza meses mal escritos', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/meses/2026-13', headers: { cookie } });
    expect(r.statusCode).toBe(400);
  });
});

describe('sin clave de IA', () => {
  it('avisa con un error claro', async () => {
    const pg = new PGlite();
    const db = drizzle(pg, { schema });
    await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });
    const [e] = await db.insert(schema.empresas).values({ nombre: 'E' }).returning();
    await db.insert(schema.usuarios).values({ email: 'e@e.com', nombre: 'E', passwordHash: await hashPassword('secreto123'), empresaId: e.id });
    const app = await crearApp({ db: db as unknown as Db, origenFrontend: 'http://x', cookieSegura: false });
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'e@e.com', password: 'secreto123' } });
    const cookie = `sesion=${r.cookies.find((c) => c.name === 'sesion')!.value}`;
    const p = await app.inject({ method: 'POST', url: '/api/meses/2026-10/procesar', headers: { cookie } });
    expect(p.statusCode).toBe(503);
    await app.close();
  });
});
