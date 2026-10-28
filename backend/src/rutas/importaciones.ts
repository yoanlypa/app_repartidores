import { createHash } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { empresaDe, requiereEmpresa } from '../auth.js';
import type { Db } from '../db/index.js';
import { empresas, importaciones, mensajes, repartidores } from '../db/schema.js';
import { leerArchivo } from '../parser/archivos.js';
import { analizarChats, type ChatParaAnalizar, type RepartidorDetectado } from '../parser/deteccion.js';
import { leerChat, type Mensaje } from '../parser/whatsapp.js';

interface DatosPendientes {
  dueno: string | null;
  detectados: Pick<RepartidorDetectado, 'clave' | 'nombre' | 'alias' | 'mensajes'>[];
}

const Confirmar = z.object({
  decisiones: z
    .array(
      z.discriminatedUnion('accion', [
        z.object({ clave: z.string(), accion: z.literal('crear'), nombre: z.string().trim().min(1).max(80).optional() }),
        z.object({ clave: z.string(), accion: z.literal('unir'), repartidorId: z.number().int() }),
        z.object({ clave: z.string(), accion: z.literal('descartar') }),
      ]),
    )
    .min(1),
});

const huellaMensaje = (m: Mensaje) => createHash('sha256').update(`${m.fechaHora}|${m.texto}`).digest('hex').slice(0, 32);

export const rutasImportaciones: FastifyPluginAsync<{ db: Db }> = async (app, { db }) => {
  app.addHook('preHandler', requiereEmpresa);

  /**
   * Paso 1: subir los chats. No se guarda nada definitivo: devuelve los repartidores
   * detectados para que el dueño confirme.
   */
  app.post('/api/importaciones/analizar', async (req, reply) => {
    const empresaId = empresaDe(req);
    const chats: ChatParaAnalizar[] = [];
    const errores: { nombreArchivo: string; error: string }[] = [];
    let duenoElegido: string | null = null;

    for await (const parte of req.parts()) {
      if (parte.type === 'field') {
        if (parte.fieldname === 'dueno' && typeof parte.value === 'string' && parte.value.trim()) {
          duenoElegido = parte.value.trim();
        }
        continue;
      }
      const nombre = parte.filename || 'chat.txt';
      try {
        const archivo = await leerArchivo(nombre, await parte.toBuffer());
        chats.push({
          nombreArchivo: archivo.nombreArchivo,
          nombreDesdeArchivo: archivo.nombreDesdeArchivo,
          chat: leerChat(archivo.texto),
        });
      } catch (e) {
        if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') throw e;
        errores.push({ nombreArchivo: nombre, error: (e as Error).message || 'No se pudo leer el archivo.' });
      }
    }

    if (chats.length === 0 && errores.length === 0) {
      return reply.code(400).send({ error: 'No has subido ningún archivo.' });
    }

    const [empresa] = await db.select().from(empresas).where(eq(empresas.id, empresaId)).limit(1);
    const existentes = await db
      .select({ id: repartidores.id, nombre: repartidores.nombre, alias: repartidores.alias })
      .from(repartidores)
      .where(eq(repartidores.empresaId, empresaId));

    const analisis = analizarChats(chats, {
      duenoConocido: duenoElegido ?? empresa?.nombreDuenoWhatsapp,
      existentes,
    });

    const datos: DatosPendientes = {
      dueno: analisis.dueno,
      detectados: analisis.detectados.map(({ clave, nombre, alias, mensajes }) => ({ clave, nombre, alias, mensajes })),
    };

    const [imp] = await db
      .insert(importaciones)
      .values({
        empresaId,
        usuarioId: req.usuario!.id,
        archivos: [
          ...analisis.archivos,
          ...errores.map((e) => ({ nombreArchivo: e.nombreArchivo, tipo: 'error', totalMensajes: 0, aviso: e.error })),
        ],
        datosPendientes: datos,
      })
      .returning({ id: importaciones.id });

    return {
      importacionId: imp.id,
      dueno: analisis.dueno,
      remitentesPosibles: analisis.remitentesPosibles,
      archivos: analisis.archivos,
      errores,
      detectados: analisis.detectados.map((d) => ({
        clave: d.clave,
        nombre: d.nombre,
        alias: d.alias,
        archivos: d.archivos,
        totalMensajes: d.mensajes.length,
        desde: d.desde,
        hasta: d.hasta,
        ejemplos: d.mensajes.slice(-3).map((m) => ({ fechaHora: m.fechaHora, texto: m.texto.slice(0, 140) })),
        coincidencia: d.coincidencia,
      })),
      repartidoresExistentes: existentes.map((r) => ({ id: r.id, nombre: r.nombre })),
    };
  });

  /** Paso 2: el dueño decide qué hacer con cada repartidor detectado. */
  app.post<{ Params: { id: string } }>('/api/importaciones/:id/confirmar', async (req, reply) => {
    const empresaId = empresaDe(req);
    const entrada = Confirmar.safeParse(req.body);
    if (!entrada.success) return reply.code(400).send({ error: 'Faltan decisiones sobre los repartidores.' });

    const [imp] = await db
      .select()
      .from(importaciones)
      .where(and(eq(importaciones.id, Number(req.params.id)), eq(importaciones.empresaId, empresaId)))
      .limit(1);
    if (!imp) return reply.code(404).send({ error: 'Importación no encontrada.' });
    if (imp.estado !== 'pendiente') return reply.code(409).send({ error: 'Esta importación ya se procesó.' });

    const datos = imp.datosPendientes as DatosPendientes;
    const porClave = new Map(datos.detectados.map((d) => [d.clave, d]));

    // Los repartidores a los que se une deben ser de esta empresa.
    const idsUnir = entrada.data.decisiones.flatMap((d) => (d.accion === 'unir' ? [d.repartidorId] : []));
    const validos = idsUnir.length
      ? await db
          .select({ id: repartidores.id, alias: repartidores.alias })
          .from(repartidores)
          .where(and(eq(repartidores.empresaId, empresaId), inArray(repartidores.id, idsUnir)))
      : [];
    const aliasPorId = new Map(validos.map((r) => [r.id, r.alias]));
    if (idsUnir.some((id) => !aliasPorId.has(id))) {
      return reply.code(400).send({ error: 'Has elegido un repartidor que no existe.' });
    }

    const resultado = await db.transaction(async (tx) => {
      let mensajesNuevos = 0;
      let mensajesRepetidos = 0;
      const nombres: string[] = [];
      const mesesAfectados = new Set<string>();

      for (const dec of entrada.data.decisiones) {
        const det = porClave.get(dec.clave);
        if (!det || dec.accion === 'descartar') continue;

        let repartidorId: number;
        if (dec.accion === 'crear') {
          const nombre = dec.nombre ?? det.nombre;
          // Los nombres de WhatsApp se guardan como alias aunque el dueño le ponga otro nombre.
          const alias = [...new Set([...det.alias, det.nombre])];
          const [nuevo] = await tx
            .insert(repartidores)
            .values({ empresaId, nombre, alias })
            .returning({ id: repartidores.id });
          repartidorId = nuevo.id;
          nombres.push(nombre);
        } else {
          repartidorId = dec.repartidorId;
          const actuales = aliasPorId.get(repartidorId) ?? [];
          const nuevosAlias = [...new Set([...actuales, ...det.alias, det.nombre])];
          if (nuevosAlias.length !== actuales.length) {
            await tx.update(repartidores).set({ alias: nuevosAlias }).where(eq(repartidores.id, repartidorId));
            aliasPorId.set(repartidorId, nuevosAlias);
          }
        }

        // Insertar mensajes por lotes, ignorando los que ya estaban (subidas repetidas).
        const filas = det.mensajes.map((m) => ({
          empresaId,
          repartidorId,
          fechaHora: m.fechaHora,
          texto: m.texto,
          huella: huellaMensaje(m),
        }));
        for (let i = 0; i < filas.length; i += 500) {
          const lote = filas.slice(i, i + 500);
          const insertados = await tx
            .insert(mensajes)
            .values(lote)
            .onConflictDoNothing({ target: [mensajes.repartidorId, mensajes.huella] })
            .returning({ fechaHora: mensajes.fechaHora });
          mensajesNuevos += insertados.length;
          for (const m of insertados) mesesAfectados.add(m.fechaHora.slice(0, 7));
          mensajesRepetidos += lote.length - insertados.length;
        }
      }

      if (datos.dueno) {
        await tx.update(empresas).set({ nombreDuenoWhatsapp: datos.dueno }).where(eq(empresas.id, empresaId));
      }

      const res = { repartidores: nombres, mensajesNuevos, mensajesRepetidos };
      await tx
        .update(importaciones)
        .set({ estado: 'confirmada', datosPendientes: null, resultado: res })
        .where(eq(importaciones.id, imp.id));
      return { ...res, mesesAfectados: [...mesesAfectados].sort().reverse() };
    });

    return { ok: true, ...resultado };
  });

  app.post<{ Params: { id: string } }>('/api/importaciones/:id/cancelar', async (req) => {
    await db
      .update(importaciones)
      .set({ estado: 'cancelada', datosPendientes: null })
      .where(
        and(
          eq(importaciones.id, Number(req.params.id)),
          eq(importaciones.empresaId, empresaDe(req)),
          eq(importaciones.estado, 'pendiente'),
        ),
      );
    return { ok: true };
  });

  app.get('/api/importaciones', async (req) => {
    const filas = await db
      .select({
        id: importaciones.id,
        estado: importaciones.estado,
        archivos: importaciones.archivos,
        resultado: importaciones.resultado,
        creado: importaciones.creado,
      })
      .from(importaciones)
      .where(and(eq(importaciones.empresaId, empresaDe(req)), inArray(importaciones.estado, ['confirmada'])))
      .orderBy(desc(importaciones.creado))
      .limit(50);
    return { importaciones: filas };
  });
};
