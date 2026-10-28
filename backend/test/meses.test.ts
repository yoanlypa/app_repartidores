import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { aCentimos, calcularTotales, completar, diasSinReporte, validarDias } from '../src/calculo/validar.js';
import { CARPETA_MIGRACIONES, type Db, schema } from '../src/db/index.js';
import type { DiaExtraido, Extractor } from '../src/ia/extraer.js';
import { formatearMensajes } from '../src/ia/extraer.js';
import { rangoMes } from '../src/rutas/meses.js';

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n));
const dia = (
  fecha: string,
  salida: number | null,
  entregados: number | null,
  incidencias: number | null = null,
  extra: Partial<DiaExtraido> = {},
): DiaExtraido => ({ fecha, salida, entregados, incidencias, confianza: 'alta', nota: '', mensaje_original: '', ...extra });

describe('completar (código, no IA)', () => {
  it('incidencias = salida − entregados', () => {
    expect(completar({ salida: 14, entregados: 9, incidencias: null })).toEqual({ salida: 14, entregados: 9, incidencias: 5 });
  });
  it('"10 entreg 10 incidencias" → salida 20', () => {
    expect(completar({ salida: null, entregados: 10, incidencias: 10 })).toEqual({ salida: 20, entregados: 10, incidencias: 10 });
  });
  it('"salí con 120 volví con 8" → entregados 112', () => {
    expect(completar({ salida: 120, entregados: null, incidencias: 8 })).toEqual({ salida: 120, entregados: 112, incidencias: 8 });
  });
});

describe('validarDias', () => {
  it('solo con entregados el día es válido (es lo que se paga)', () => {
    expect(validarDias([dia('2026-08-24', null, 13)], '2026-08')[0]).toMatchObject({ estado: 'ok', entregados: 13 });
  });
  it('sin entregados → dudoso', () => {
    expect(validarDias([dia('2026-08-14', 14, null)], '2026-08')[0].estado).toBe('dudoso');
  });
  it('entregados > salida → error', () => {
    expect(validarDias([dia('2026-08-01', 10, 12)], '2026-08')[0].estado).toBe('error');
  });
  it('entregados + incidencias que no cuadran con la salida → dudoso', () => {
    expect(validarDias([dia('2026-08-01', 20, 10, 5)], '2026-08')[0].estado).toBe('dudoso');
  });
  it('confianza baja → dudoso', () => {
    expect(validarDias([dia('2026-08-01', 20, 10, null, { confianza: 'baja' })], '2026-08')[0].estado).toBe('dudoso');
  });
  it('descarta fechas fuera del mes o imposibles y se queda con el último dato de cada día', () => {
    const v = validarDias([dia('2026-07-31', 1, 1), dia('2026-08-03', 95, 90), dia('2026-08-03', 98, 95), dia('2026-02-31', 1, 1)], '2026-08');
    expect(v).toHaveLength(1);
    expect(v[0].entregados).toBe(95);
  });
});

describe('totales y pago', () => {
  it('suma entregados con código y no cuenta los días con error', () => {
    const t = calcularTotales([
      { salida: 14, entregados: 9, incidencias: 5, estado: 'ok' },
      { salida: null, entregados: 13, incidencias: null, estado: 'ok' },
      { salida: 20, entregados: 10, incidencias: 10, estado: 'dudoso' },
      { salida: 10, entregados: 12, incidencias: null, estado: 'error' },
      { salida: 14, entregados: null, incidencias: null, estado: 'dudoso' },
    ]);
    expect(t).toEqual({ diasTrabajados: 3, salida: 34, entregados: 32, incidencias: 15, dudosos: 2, errores: 1 });
  });
  it('convierte precios a céntimos sin perder decimales', () => {
    expect(aCentimos('0.85')).toBe(85);
    expect(aCentimos(1.1)).toBe(110);
    expect(32 * aCentimos('0.85')).toBe(2720);
  });
  it('detecta días laborables sin reporte (lunes a sábado)', () => {
    expect(diasSinReporte('2026-10', new Set(['2026-10-01', '2026-10-03']), '2026-10-05')).toEqual(['2026-10-02', '2026-10-05']);
    // No avisa de los días anteriores a su primer reporte.
    expect(diasSinReporte('2026-08', new Set(['2026-08-15', '2026-08-17']), '2026-08-18')).toEqual(['2026-08-18']);
  });
  it('el rango incluye la madrugada del día 1 del mes siguiente', () => {
    expect(rangoMes('2026-12')).toEqual({ desde: '2026-12-01T00:00:00', hasta: '2027-01-01T06:00:00', finMes: '2027-01-01' });
  });
  it('formatea los mensajes para la IA con la hora de envío', () => {
    expect(formatearMensajes([{ fechaHora: '2026-08-16T21:49:00', remitente: 'x', texto: 'Entregado 9\n15/8' }])).toBe(
      '[enviado 2026-08-16 21:49] Entregado 9 / 15/8',
    );
  });
});

// Extractor falso que imita a la IA: "Salí con 80, volví con 4" / "ayer 75 y 2".
const extractorFalso: Extractor = async ({ mensajes }) => {
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
    out.push(dia(fecha, n[0], null, n[1], { mensaje_original: m.texto }));
  }
  return out;
};

async function preparar(extractor?: Extractor) {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });
  const [e] = await db.insert(schema.empresas).values({ nombre: 'E' }).returning();
  await db.insert(schema.usuarios).values({ email: 'e@e.com', nombre: 'E', passwordHash: await hashPassword('secreto123'), empresaId: e.id });
  const app = await crearApp({ db: db as unknown as Db, origenFrontend: 'http://x', cookieSegura: false, extractor });
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'e@e.com', password: 'secreto123' } });
  return { app, cookie: `sesion=${r.cookies.find((c) => c.name === 'sesion')!.value}` };
}

describe('API de meses', () => {
  let app: Awaited<ReturnType<typeof crearApp>>;
  let cookie = '';

  beforeAll(async () => {
    ({ app, cookie } = await preparar(extractorFalso));
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

  it('procesa el mes y calcula entregados e incidencias con código', async () => {
    const p = await app.inject({ method: 'POST', url: '/api/meses/2026-10/procesar', headers: { cookie } });
    expect(p.json()).toMatchObject({ procesados: 1, errores: [] });
    const t = (await app.inject({ method: 'GET', url: '/api/meses/2026-10', headers: { cookie } })).json();
    const ana = t.repartidores[0];
    // "ayer 75 y 2" (00:05 del día 2) sustituye a "Salí con 80, volví con 4" del día 1.
    expect(ana.dias).toHaveLength(1);
    expect(ana.totales).toMatchObject({ diasTrabajados: 1, salida: 75, entregados: 73, incidencias: 2 });
    expect(t.pagoCentimos).toBe(0);
  });

  it('calcula el pago con el precio de la empresa y el precio propio del repartidor', async () => {
    await app.inject({ method: 'PATCH', url: '/api/empresa/precio', headers: { cookie }, payload: { precioPaquete: 0.85 } });
    let t = (await app.inject({ method: 'GET', url: '/api/meses/2026-10', headers: { cookie } })).json();
    expect(t.repartidores[0]).toMatchObject({ precioCentimos: 85, pagoCentimos: 73 * 85, precioPropio: false });

    const id = t.repartidores[0].id;
    await app.inject({ method: 'PATCH', url: `/api/repartidores/${id}`, headers: { cookie }, payload: { tarifaPaquete: 1 } });
    t = (await app.inject({ method: 'GET', url: '/api/meses/2026-10', headers: { cookie } })).json();
    expect(t.repartidores[0]).toMatchObject({ precioCentimos: 100, pagoCentimos: 7300, precioPropio: true });
    expect(t.pagoCentimos).toBe(7300);

    await app.inject({ method: 'PATCH', url: `/api/repartidores/${id}`, headers: { cookie }, payload: { tarifaPaquete: null } });
  });

  it('respeta las correcciones manuales al volver a procesar', async () => {
    const t = (await app.inject({ method: 'GET', url: '/api/meses/2026-10', headers: { cookie } })).json();
    const id = t.repartidores[0].dias[0].id;
    const e = await app.inject({ method: 'PATCH', url: `/api/registros/${id}`, headers: { cookie }, payload: { salida: 80, entregados: 76 } });
    expect(e.json()).toMatchObject({ estado: 'ok', incidencias: 4 });

    await app.inject({ method: 'POST', url: '/api/meses/2026-10/procesar', headers: { cookie } });
    const t2 = (await app.inject({ method: 'GET', url: '/api/meses/2026-10', headers: { cookie } })).json();
    expect(t2.repartidores[0].dias[0]).toMatchObject({ salida: 80, entregados: 76, incidencias: 4, editadoManual: true });
    expect(t2.repartidores[0].pagoCentimos).toBe(76 * 85);
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
    const { app, cookie } = await preparar();
    const p = await app.inject({ method: 'POST', url: '/api/meses/2026-10/procesar', headers: { cookie } });
    expect(p.statusCode).toBe(503);
    await app.close();
  });
});
