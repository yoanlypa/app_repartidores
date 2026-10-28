import { and, asc, count, eq, like, max, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { empresaDe, requiereEmpresa } from '../auth.js';
import type { Db } from '../db/index.js';
import { empresas, mensajes, repartidores } from '../db/schema.js';
import { normalizarNombre } from '../parser/normalizar.js';

const Cambios = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  alias: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  activo: z.boolean().optional(),
  mostrarEnResumen: z.boolean().optional(),
  /** Precio propio por paquete entregado (null = el de la empresa). */
  tarifaPaquete: z.number().min(0).max(100).nullable().optional(),
});

const Nuevo = z.object({
  nombre: z.string().trim().min(1).max(80),
  tarifaPaquete: z.number().min(0).max(100).nullable().optional(),
});

const Precio = z.object({ precioPaquete: z.number().min(0).max(100) });

export const rutasRepartidores: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook('preHandler', requiereEmpresa);

  app.get('/api/repartidores', async (req) => {
    const empresaId = empresaDe(req);
    const filas = await db
      .select({
        id: repartidores.id,
        nombre: repartidores.nombre,
        alias: repartidores.alias,
        activo: repartidores.activo,
        mostrarEnResumen: repartidores.mostrarEnResumen,
        tarifaPaquete: repartidores.tarifaPaquete,
        totalMensajes: count(mensajes.id),
        ultimoMensaje: max(mensajes.fechaHora),
      })
      .from(repartidores)
      .leftJoin(mensajes, eq(mensajes.repartidorId, repartidores.id))
      .where(eq(repartidores.empresaId, empresaId))
      .groupBy(repartidores.id)
      .orderBy(asc(repartidores.nombre));
    return { repartidores: filas };
  });

  /** Alta manual de un repartidor (sin chat). Su nombre sirve también como alias de WhatsApp. */
  app.post('/api/repartidores', async (req, reply) => {
    const datos = Nuevo.safeParse(req.body);
    if (!datos.success) return reply.code(400).send({ error: 'Escribe el nombre del repartidor.' });
    const empresaId = empresaDe(req);
    const { nombre, tarifaPaquete } = datos.data;
    const existentes = await db
      .select({ nombre: repartidores.nombre, alias: repartidores.alias })
      .from(repartidores)
      .where(eq(repartidores.empresaId, empresaId));
    const n = normalizarNombre(nombre);
    if (existentes.some((r) => [r.nombre, ...r.alias].some((a) => normalizarNombre(a) === n))) {
      return reply.code(409).send({ error: 'Ya hay un repartidor con ese nombre.' });
    }
    const [r] = await db
      .insert(repartidores)
      .values({ empresaId, nombre, alias: [nombre], tarifaPaquete: tarifaPaquete == null ? null : tarifaPaquete.toFixed(2) })
      .returning({ id: repartidores.id });
    return { ok: true, id: r.id };
  });

  /** Precio por paquete entregado de la empresa (el que se aplica por defecto). */
  app.patch('/api/empresa/precio', async (req, reply) => {
    const datos = Precio.safeParse(req.body);
    if (!datos.success) return reply.code(400).send({ error: 'Escribe un precio válido.' });
    await db.update(empresas).set({ precioPaquete: datos.data.precioPaquete.toFixed(2) }).where(eq(empresas.id, empresaDe(req)));
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>('/api/repartidores/:id', async (req, reply) => {
    const datos = Cambios.safeParse(req.body);
    if (!datos.success) return reply.code(400).send({ error: 'Datos no válidos.' });
    const { tarifaPaquete, ...resto } = datos.data;
    const cambios = {
      ...resto,
      ...(tarifaPaquete !== undefined ? { tarifaPaquete: tarifaPaquete === null ? null : tarifaPaquete.toFixed(2) } : {}),
    };
    if (Object.keys(cambios).length === 0) return { ok: true };
    const [r] = await db
      .update(repartidores)
      .set(cambios)
      .where(and(eq(repartidores.id, Number(req.params.id)), eq(repartidores.empresaId, empresaDe(req))))
      .returning({ id: repartidores.id });
    if (!r) return reply.code(404).send({ error: 'Repartidor no encontrado.' });
    return { ok: true };
  });

  app.get<{ Params: { id: string }; Querystring: { mes?: string } }>(
    '/api/repartidores/:id/mensajes',
    async (req, reply) => {
      const mes = req.query.mes;
      if (mes && !/^\d{4}-\d{2}$/.test(mes)) return reply.code(400).send({ error: 'Mes no válido (AAAA-MM).' });
      const filas = await db
        .select({ fechaHora: mensajes.fechaHora, texto: mensajes.texto })
        .from(mensajes)
        .where(
          and(
            eq(mensajes.repartidorId, Number(req.params.id)),
            eq(mensajes.empresaId, empresaDe(req)),
            mes ? like(mensajes.fechaHora, `${mes}%`) : sql`true`,
          ),
        )
        .orderBy(asc(mensajes.fechaHora));
      return { mensajes: filas };
    },
  );
};
