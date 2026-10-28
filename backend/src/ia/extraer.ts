import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Mensaje } from '../parser/whatsapp.js';

/** Lo que la IA devuelve para un día. La IA NUNCA calcula totales ni importes. */
export const DiaExtraido = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  salida: z.number().int().min(0).max(5000).nullable(),
  entregados: z.number().int().min(0).max(5000).nullable(),
  incidencias: z.number().int().min(0).max(5000).nullable(),
  confianza: z.enum(['alta', 'baja']),
  nota: z.string().max(400).default(''),
  mensaje_original: z.string().max(1000).default(''),
});
export type DiaExtraido = z.infer<typeof DiaExtraido>;

const Respuesta = z.object({ dias: z.array(DiaExtraido) });

/** Función que convierte los mensajes de un repartidor en días con salida/entregados/incidencias. */
export type Extractor = (entrada: { repartidor: string; mes: string; mensajes: Mensaje[] }) => Promise<DiaExtraido[]>;

export class ErrorIa extends Error {}

const INSTRUCCIONES = `Eres un asistente que extrae datos de reparto de mensajes de WhatsApp.
Recibirás los mensajes de UN repartidor durante un mes, cada uno con la fecha y hora en que se ENVIÓ (hora de España).

Lo MÁS IMPORTANTE es el número de paquetes ENTREGADOS de cada día: es lo que se le paga al repartidor.
Para cada día de trabajo devuelve:
- salida: paquetes con los que salió (null si no lo dice).
- entregados: paquetes que entregó (null si no lo dice).
- incidencias: paquetes que no entregó (incidencias, devueltos, ausentes, vuelta...). null si no lo dice.

Cómo reconocer cada número:
- ENTREGADOS: "entregados", "entregado", "entreg", "entrg", "entre", "ent", "entregué", "entrega", "repartidos", "ok". Ejemplos: "Entregado 9" → entregados 9. "13 entreg" → entregados 13. "Salida 14 entregados 9" → salida 14, entregados 9.
- SALIDA: "salida", "salí con", "salgo con", "llevo", "cargué". Ejemplo: "20 salida 10 entregados" → salida 20, entregados 10.
- INCIDENCIAS: "incidencias", "inc", "incid", "devueltos", "vuelta", "volví con", "me quedan", "sobran", "ausentes". Ejemplo: "10 entreg 10 incidencias" → entregados 10, incidencias 10 y, como no dice la salida, salida = 20 (entregados + incidencias).
- "salí con 120 volví con 8" → salida 120, incidencias 8, entregados 112 (salida − incidencias).
- Dos números sin palabras ("120/8", "120 y 8"): el primero es la salida y el segundo los entregados; pon confianza "baja" y explícalo en "nota".
- NUNCA pongas como entregados un número que el repartidor llama incidencias o vuelta, ni al revés.

Fechas:
- Si el mensaje dice una fecha ("15/8", "17/08", "el 14"), esa es la fecha del día, aunque el mensaje se enviara otro día. El formato es día/mes. El año es el del envío.
- Si no dice fecha, es el día del envío. Si se envió de madrugada (00:00–05:59) y habla de la jornada anterior, es el día anterior.
- Si un día tiene varios mensajes (por la mañana la salida y por la noche los entregados), júntalos en un solo resultado.
- Si hay una corrección ("perdona, eran 118"), usa el último dato y explícalo en "nota".

Casos que hay que interpretar bien:
- "Ok entregados todos" + "14 el 14/8" → salida 14, entregados 14, incidencias 0 ("todos" = todo lo que llevaba).
- "Salida 14 entrega 9, no conté uno que entregué sin querer, dejé 4 inc al compañero" → el repartidor se corrige: entregados 10 (9 + 1 que no contó), incidencias 4, salida 14. Explícalo en "nota".
- "20 salida 10 entregados 10 info" → "info" también son incidencias: salida 20, entregados 10, incidencias 10.
- "Te dejo 3 inc que me quedaron" ese día → incidencias 3 de ese día.
- Por la mañana "Salida 20 26/8" y por la noche "Entreg 18" (sin fecha) → los dos son del día 26: salida 20, entregados 18.
- "Entreg 13 paq 27/8" enviado el 28 → es del día 27, aunque se enviara el 28.
- "hoy" = el día del envío.
- Ignora números que no son paquetes: DNI o NIE (por ejemplo 12345678Z), códigos de verificación, teléfonos, direcciones, horas y duraciones de llamadas.
- Si el repartidor da cifras de memoria o con duda ("creo que fueron 10", "no lo tengo"), confianza "baja".

Confianza:
- "alta" si los entregados están claros.
- "baja" si no sabes cuántos entregó, si los números se contradicen o si no está claro a qué día pertenece.

Otras reglas:
- Ignora los mensajes que no hablen de paquetes.
- Un solo resultado por fecha.
- mensaje_original: el texto de el/los mensajes en los que te basas, tal cual (si son varios, sepáralos con " · ").
- nota: en español y muy breve; solo si hay algo que aclarar. Déjala vacía si todo está claro.
- NO sumes ni calcules totales del mes.`;

/** Formato de salida estructurada (JSON garantizado por la API). */
const ESQUEMA = {
  type: 'object',
  properties: {
    dias: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'AAAA-MM-DD del día de trabajo' },
          salida: { type: ['integer', 'null'], description: 'Paquetes con los que salió' },
          entregados: { type: ['integer', 'null'], description: 'Paquetes entregados (lo que se paga)' },
          incidencias: { type: ['integer', 'null'], description: 'Paquetes no entregados' },
          confianza: { type: 'string', enum: ['alta', 'baja'] },
          nota: { type: 'string' },
          mensaje_original: { type: 'string' },
        },
        required: ['fecha', 'salida', 'entregados', 'incidencias', 'confianza', 'nota', 'mensaje_original'],
        additionalProperties: false,
      },
    },
  },
  required: ['dias'],
  additionalProperties: false,
};

export function formatearMensajes(mensajes: Mensaje[]): string {
  return mensajes.map((m) => `[enviado ${m.fechaHora.slice(0, 10)} ${m.fechaHora.slice(11, 16)}] ${m.texto.replace(/\n/g, ' / ')}`).join('\n');
}

export function crearExtractorAnthropic(opciones: { apiKey: string; modelo: string; fetch?: typeof fetch }): Extractor {
  const cliente = new Anthropic({ apiKey: opciones.apiKey, maxRetries: 2, timeout: 120_000, fetch: opciones.fetch });

  return async ({ repartidor, mes, mensajes }) => {
    if (mensajes.length === 0) return [];
    const contenido = `Repartidor: ${repartidor}\nMes: ${mes}\n\nMensajes:\n${formatearMensajes(mensajes)}`;

    let ultimoError = '';
    for (let intento = 0; intento < 2; intento++) {
      let r: Anthropic.Message;
      try {
        r = await cliente.messages.create({
          model: opciones.modelo,
          max_tokens: 16000,
          system: INSTRUCCIONES,
          output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
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
        if (err.status === 404) throw new ErrorIa(`El modelo "${opciones.modelo}" no existe. Revisa ANTHROPIC_MODEL.`);
        if (err.status === 429) throw new ErrorIa('La IA está saturada ahora mismo. Inténtalo en unos minutos.');
        throw new ErrorIa(`No se pudo contactar con la IA: ${err.message ?? 'error desconocido'}`);
      }
      if (r.stop_reason === 'max_tokens') {
        ultimoError = 'respuesta cortada';
        continue;
      }
      const texto = r.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
      let json: unknown = null;
      try {
        json = JSON.parse(texto);
      } catch {
        ultimoError = 'no es JSON';
        continue;
      }
      const datos = Respuesta.safeParse(json);
      if (datos.success) return datos.data.dias;
      ultimoError = datos.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    }
    throw new ErrorIa(`La IA devolvió datos no válidos para ${repartidor}.`);
  };
}
