import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { empresaDe, requiereEmpresa } from '../auth.js';
import { aCentimos, calcularTotales, completar, diasSinReporte, estadoDia, pagoCentimos, validarDias } from '../calculo/validar.js';
import type { Db } from '../db/index.js';
import { empresas, mensajes, meses, registrosDia, repartidores } from '../db/schema.js';
import { ErrorIa, type Extractor } from '../ia/extraer.js';

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Rango de mensajes que se mandan a la IA: el mes entero + la madrugada del día 1 del mes siguiente. */
export function rangoMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  const sig = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
  return { desde: `${mes}-01T00:00:00`, hasta: `${sig}-01T06:00:00`, finMes: `${sig}-01` };
}

const hoyMadrid = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

const Edicion = z.object({
  salida: z.number().int().min(0).max(5000).nullable(),
  entregados: z.number().int().min(0).max(5000).nullable(),
  incidencias: z.number().int().min(0).max(5000).nullable().optional(),
});

async function mesCerrado(db: Db, empresaId: number, mes: string) {
  const [f] = await db
    .select({ estado: meses.estado })
    .from(meses)
    .where(and(eq(meses.empresaId, empresaId), eq(meses.mes, mes)))
    .limit(1);
  return f?.estado === 'cerrado';
}

export const rutasMeses: FastifyPluginAsync<{ db: Db; extractor: Extractor | null }> = async (app, { db, extractor }) => {
  app.addHook('preHandler', requiereEmpresa);

  const mesValido = (mes: string, reply: FastifyReply) => {
    if (MES.test(mes)) return true;
    reply.code(400).send({ error: 'Mes no válido (AAAA-MM).' });
    return false;
  };

  /** Meses con mensajes, del más reciente al más antiguo. */
  app.get('/api/meses', async (req) => {
    const empresaId = empresaDe(req);
    const conMensajes = await db
      .selectDistinct({ mes: sql<string>`substr(${mensajes.fechaHora}, 1, 7)` })
      .from(mensajes)
      .where(eq(mensajes.empresaId, empresaId))
      .orderBy(desc(sql`substr(${mensajes.fechaHora}, 1, 7)`));
    const estados = await db.select().from(meses).where(eq(meses.empresaId, empresaId));
    const porMes = new Map(estados.map((e) => [e.mes, e]));
    return {
      meses: conMensajes.map(({ mes }) => ({
        mes,
        estado: porMes.get(mes)?.estado ?? 'abierto',
        procesado: porMes.get(mes)?.procesado ?? null,
      })),
    };
  });

  /**
   * La IA lee los mensajes del mes de cada repartidor y guarda los días.
   * Los días editados a mano no se tocan. Un mes cerrado no se procesa.
   */
  app.post<{ Params: { mes: string } }>('/api/meses/:mes/procesar', async (req, reply) => {
    const { mes } = req.params;
    if (!mesValido(mes, reply)) return;
    const empresaId = empresaDe(req);
    if (!extractor) {
      return reply.code(503).send({ error: 'La IA no está configurada todavía (falta ANTHROPIC_API_KEY en el servidor).' });
    }
    if (await mesCerrado(db, empresaId, mes)) return reply.code(409).send({ error: 'Este mes está cerrado.' });

    const { desde, hasta } = rangoMes(mes);
    const filas = await db
      .select({
        repartidorId: repartidores.id,
        nombre: repartidores.nombre,
        fechaHora: mensajes.fechaHora,
        texto: mensajes.texto,
      })
      .from(mensajes)
      .innerJoin(repartidores, eq(repartidores.id, mensajes.repartidorId))
      .where(
        and(
          eq(mensajes.empresaId, empresaId),
          eq(repartidores.activo, true),
          gte(mensajes.fechaHora, desde),
          lt(mensajes.fechaHora, hasta),
        ),
      )
      .orderBy(asc(mensajes.fechaHora));

    const porRepartidor = new Map<number, { nombre: string; mensajes: { fechaHora: string; remitente: string; texto: string }[] }>();
    for (const f of filas) {
      const r = porRepartidor.get(f.repartidorId) ?? { nombre: f.nombre, mensajes: [] };
      r.mensajes.push({ fechaHora: f.fechaHora, remitente: f.nombre, texto: f.texto });
      porRepartidor.set(f.repartidorId, r);
    }

    const errores: { repartidor: string; error: string }[] = [];
    let procesados = 0;
    const tareas = [...porRepartidor.entries()];

    // Hasta 3 repartidores a la vez.
    const trabajar = async () => {
      for (let t = tareas.shift(); t; t = tareas.shift()) {
        const [repartidorId, r] = t;
        try {
          const dias = validarDias(await extractor({ repartidor: r.nombre, mes, mensajes: r.mensajes }), mes);
          await db.transaction(async (tx) => {
            const manuales = await tx
              .select({ fecha: registrosDia.fecha })
              .from(registrosDia)
              .where(
                and(
                  eq(registrosDia.repartidorId, repartidorId),
                  eq(registrosDia.editadoManual, true),
                  sql`to_char(${registrosDia.fecha}, 'YYYY-MM') = ${mes}`,
                ),
              );
            const fijas = new Set(manuales.map((m) => String(m.fecha).slice(0, 10)));
            await tx
              .delete(registrosDia)
              .where(
                and(
                  eq(registrosDia.repartidorId, repartidorId),
                  eq(registrosDia.editadoManual, false),
                  sql`to_char(${registrosDia.fecha}, 'YYYY-MM') = ${mes}`,
                ),
              );
            const nuevos = dias.filter((d) => !fijas.has(d.fecha));
            if (nuevos.length) {
              await tx.insert(registrosDia).values(
                nuevos.map((d) => ({
                  empresaId,
                  repartidorId,
                  fecha: d.fecha,
                  salida: d.salida,
                  entregados: d.entregados,
                  incidencias: d.incidencias,
                  estado: d.estado,
                  notaIa: d.nota || null,
                  mensajeOriginal: d.mensajeOriginal || null,
                })),
              );
            }
          });
          procesados++;
        } catch (e) {
          req.log.error(e);
          errores.push({ repartidor: r.nombre, error: e instanceof ErrorIa ? e.message : 'Error al procesar sus mensajes.' });
        }
      }
    };
    await Promise.all([trabajar(), trabajar(), trabajar()]);

    await db
      .insert(meses)
      .values({ empresaId, mes, procesado: new Date() })
      .onConflictDoUpdate({ target: [meses.empresaId, meses.mes], set: { procesado: new Date() } });

    return { ok: true, procesados, errores };
  });

  /** Tabla del mes: totales por repartidor y detalle de cada día. */
  app.get<{ Params: { mes: string } }>('/api/meses/:mes', async (req, reply) => {
    const { mes } = req.params;
    if (!mesValido(mes, reply)) return;
    const empresaId = empresaDe(req);
    const { desde, finMes } = rangoMes(mes);

    const [estadoMes] = await db
      .select()
      .from(meses)
      .where(and(eq(meses.empresaId, empresaId), eq(meses.mes, mes)))
      .limit(1);

    const regs = await db
      .select()
      .from(registrosDia)
      .where(
        and(
          eq(registrosDia.empresaId, empresaId),
          gte(registrosDia.fecha, `${mes}-01`),
          lt(registrosDia.fecha, finMes),
        ),
      )
      .orderBy(asc(registrosDia.fecha));

    const conMensajes = await db
      .select({ repartidorId: mensajes.repartidorId, n: sql<number>`count(*)::int`, ultimo: sql<string>`max(${mensajes.fechaHora})` })
      .from(mensajes)
      .where(and(eq(mensajes.empresaId, empresaId), gte(mensajes.fechaHora, desde), lt(mensajes.fechaHora, `${finMes}T00:00:00`)))
      .groupBy(mensajes.repartidorId);
    const mensajesPor = new Map(conMensajes.map((c) => [c.repartidorId, c.n]));

    const ids = [...new Set([...regs.map((r) => r.repartidorId), ...mensajesPor.keys()])];
    const reps = ids.length
      ? await db
          .select({ id: repartidores.id, nombre: repartidores.nombre, activo: repartidores.activo, tarifa: repartidores.tarifaPaquete })
          .from(repartidores)
          .where(and(eq(repartidores.empresaId, empresaId), inArray(repartidores.id, ids)))
          .orderBy(asc(repartidores.nombre))
      : [];

    // Los días sin reporte se cuentan hasta el último mensaje subido (≈ fecha de exportación) y nunca más allá de hoy.
    const hoy = hoyMadrid();
    const ultimoSubido = conMensajes.reduce((m, c) => (c.ultimo > m ? c.ultimo : m), '').slice(0, 10);
    const limite = [hoy, ultimoSubido || hoy, `${mes}-31`].sort()[0];

    const [empresa] = await db.select({ precio: empresas.precioPaquete }).from(empresas).where(eq(empresas.id, empresaId)).limit(1);
    const precioEmpresa = aCentimos(empresa?.precio ?? 0);

    const filas = reps.map((r) => {
      const dias = regs
        .filter((x) => x.repartidorId === r.id)
        .map((x) => ({
          id: x.id,
          fecha: String(x.fecha).slice(0, 10),
          salida: x.salida,
          entregados: x.entregados,
          incidencias: x.incidencias,
          estado: x.estado,
          nota: x.notaIa,
          mensajeOriginal: x.mensajeOriginal,
          editadoManual: x.editadoManual,
        }));
      const totales = calcularTotales(dias);
      const precioCentimos = r.tarifa === null ? precioEmpresa : aCentimos(r.tarifa);
      return {
        id: r.id,
        nombre: r.nombre,
        activo: r.activo,
        mensajes: mensajesPor.get(r.id) ?? 0,
        precioPropio: r.tarifa !== null,
        precioCentimos,
        pagoCentimos: pagoCentimos(totales.entregados, precioCentimos),
        totales,
        diasSinReporte: dias.length ? diasSinReporte(mes, new Set(dias.map((d) => d.fecha)), limite) : [],
        dias,
      };
    });

    const general = calcularTotales(filas.flatMap((f) => f.dias));
    return {
      mes,
      estado: estadoMes?.estado ?? 'abierto',
      procesado: estadoMes?.procesado ?? null,
      iaDisponible: Boolean(extractor),
      precioCentimos: precioEmpresa,
      pagoCentimos: filas.reduce((t, f) => t + f.pagoCentimos, 0),
      totales: general,
      repartidores: filas,
    };
  });

  /** Corrección manual de un día: la IA ya no lo vuelve a tocar. */
  app.patch<{ Params: { id: string } }>('/api/registros/:id', async (req, reply) => {
    const datos = Edicion.safeParse(req.body);
    if (!datos.success) return reply.code(400).send({ error: 'Escribe números válidos.' });
    const empresaId = empresaDe(req);
    const [reg] = await db
      .select()
      .from(registrosDia)
      .where(and(eq(registrosDia.id, Number(req.params.id)), eq(registrosDia.empresaId, empresaId)))
      .limit(1);
    if (!reg) return reply.code(404).send({ error: 'Día no encontrado.' });
    if (await mesCerrado(db, empresaId, String(reg.fecha).slice(0, 7))) {
      return reply.code(409).send({ error: 'Este mes está cerrado.' });
    }
    // Con la corrección manual, las incidencias se recalculan salvo que se indiquen.
    const numeros = completar({ salida: datos.data.salida, entregados: datos.data.entregados, incidencias: datos.data.incidencias ?? null });
    const { estado } = estadoDia(numeros);
    await db
      .update(registrosDia)
      .set({ ...numeros, estado, editadoManual: true, revisado: true })
      .where(eq(registrosDia.id, reg.id));
    return { ok: true, estado, ...numeros };
  });
};
