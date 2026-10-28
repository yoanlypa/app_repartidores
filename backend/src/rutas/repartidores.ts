import { and, asc, count, eq, like, max, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { empresaDe, requiereEmpresa } from '../auth.js';
import type { Db } from '../db/index.js';
import { mensajes, repartidores } from '../db/schema.js';

const Cambios = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  alias: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  activo: z.boolean().optional(),
});

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

  app.patch<{ Params: { id: string } }>('/api/repartidores/:id', async (req, reply) => {
    const datos = Cambios.safeParse(req.body);
    if (!datos.success) return reply.code(400).send({ error: 'Datos no válidos.' });
    const [r] = await db
      .update(repartidores)
      .set(datos.data)
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
