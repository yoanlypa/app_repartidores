import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Mensaje } from '../parser/whatsapp.js';

/** Lo que la IA devuelve para un día. La IA NUNCA calcula totales. */
export const DiaExtraido = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  salida: z.number().int().min(0).max(5000).nullable(),
  vuelta: z.number().int().min(0).max(5000).nullable(),
  confianza: z.enum(['alta', 'baja']),
  nota: z.string().max(300).default(''),
  mensaje_original: z.string().max(1000).default(''),
});
export type DiaExtraido = z.infer<typeof DiaExtraido>;

const Respuesta = z.object({ dias: z.array(DiaExtraido) });

/** Función que convierte los mensajes de un repartidor en días con salida/vuelta. */
export type Extractor = (entrada: { repartidor: string; mes: string; mensajes: Mensaje[] }) => Promise<DiaExtraido[]>;

export class ErrorIa extends Error {}

const INSTRUCCIONES = `Eres un asistente que extrae datos de reparto de mensajes de WhatsApp.
Recibirás los mensajes de UN repartidor durante un mes, con fecha y hora (hora de España).
Cada día de trabajo el repartidor indica con cuántos paquetes salió y con cuántos volvió.

Para cada día con datos de paquetes devuelve: fecha (AAAA-MM-DD), salida, vuelta, confianza ("alta" | "baja"), nota y mensaje_original (el texto del mensaje en el que te basas, tal cual).

Reglas:
- Si hay una corrección el mismo día ("perdona, eran 118"), usa el último dato y explícalo en "nota".
- Si un mensaje enviado de madrugada (00:00–05:59) se refiere claramente al día anterior ("ayer salí con..."), asígnalo a ese día anterior.
- Si falta salida o vuelta, pon null y confianza "baja".
- Si el repartidor indica entregados en vez de vuelta ("entregué 112 de 120"), deduce vuelta (120 - 112 = 8) y explícalo en "nota".
- Formatos habituales: "salí con 120 volví con 8", "120/8", "120 y 8", "salgo 130 vuelvo 10". El primer número es la salida y el segundo la vuelta.
- Si no está claro qué número es cuál, o el mensaje es ambiguo, usa confianza "baja" y explica la duda en "nota".
- Ignora los mensajes que no hablen de paquetes.
- Un solo resultado por fecha.
- NO calcules totales ni sumes nada.
- La "nota" va en español, breve. Déjala vacía si todo está claro.`;

const HERRAMIENTA: Anthropic.Tool = {
  name: 'guardar_dias',
  description: 'Guarda los datos de salida y vuelta de paquetes de cada día.',
  input_schema: {
    type: 'object',
    properties: {
      dias: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            fecha: { type: 'string', description: 'AAAA-MM-DD' },
            salida: { type: ['integer', 'null'], description: 'Paquetes con los que salió' },
            vuelta: { type: ['integer', 'null'], description: 'Paquetes con los que volvió' },
            confianza: { type: 'string', enum: ['alta', 'baja'] },
            nota: { type: 'string' },
            mensaje_original: { type: 'string' },
          },
          required: ['fecha', 'salida', 'vuelta', 'confianza', 'nota', 'mensaje_original'],
        },
      },
    },
    required: ['dias'],
  },
};

export function formatearMensajes(mensajes: Mensaje[]): string {
  return mensajes.map((m) => `${m.fechaHora.slice(0, 10)} ${m.fechaHora.slice(11, 16)} | ${m.texto.replace(/\n/g, ' / ')}`).join('\n');
}

export function crearExtractorAnthropic(opciones: { apiKey: string; modelo: string }): Extractor {
  const cliente = new Anthropic({ apiKey: opciones.apiKey, maxRetries: 2, timeout: 90_000 });

  return async ({ repartidor, mes, mensajes }) => {
    if (mensajes.length === 0) return [];
    const contenido = `Repartidor: ${repartidor}\nMes: ${mes}\n\nMensajes:\n${formatearMensajes(mensajes)}`;

    let ultimoError = '';
    for (let intento = 0; intento < 2; intento++) {
      let r: Anthropic.Message;
      try {
        r = await cliente.messages.create({
          model: opciones.modelo,
          max_tokens: 8000,
          system: INSTRUCCIONES,
          tools: [HERRAMIENTA],
          tool_choice: { type: 'tool', name: HERRAMIENTA.name, disable_parallel_tool_use: true },
          messages: [
            {
              role: 'user',
              content: intento === 0 ? contenido : `${contenido}\n\nTu respuesta anterior no era válida (${ultimoError}). Revisa el formato.`,
            },
          ],
        });
      } catch (e) {
        const err = e as { status?: number; message?: string };
        if (err.status === 401) throw new ErrorIa('La clave de la IA no es válida. Revisa ANTHROPIC_API_KEY.');
        if (err.status === 429) throw new ErrorIa('La IA está saturada ahora mismo. Inténtalo en unos minutos.');
        throw new ErrorIa(`No se pudo contactar con la IA: ${err.message ?? 'error desconocido'}`);
      }
      const bloque = r.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const datos = Respuesta.safeParse(bloque?.input);
      if (datos.success) return datos.data.dias;
      ultimoError = datos.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    }
    throw new ErrorIa(`La IA devolvió datos no válidos para ${repartidor}.`);
  };
}
