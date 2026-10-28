import { describe, expect, it } from 'vitest';
import { crearExtractorAnthropic, ErrorIa } from '../src/ia/extraer.js';

const mensajes = [{ fechaHora: '2026-08-16T21:49:00', remitente: 'Yoa', texto: 'Entregado 9 15/8' }];

function respuesta(texto: string, stop = 'end_turn') {
  return new Response(
    JSON.stringify({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'm',
      content: [{ type: 'text', text: texto }],
      stop_reason: stop,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('extractor de Anthropic', () => {
  it('pide salida estructurada (sin tool_choice) y lee el JSON', async () => {
    let cuerpo: Record<string, unknown> = {};
    const ex = crearExtractorAnthropic({
      apiKey: 'x',
      modelo: 'claude-sonnet-5-5',
      fetch: (async (_url: string, init: RequestInit) => {
        cuerpo = JSON.parse(String(init.body));
        return respuesta(
          JSON.stringify({ dias: [{ fecha: '2026-08-15', salida: null, entregados: 9, incidencias: null, confianza: 'alta', nota: '', mensaje_original: 'Entregado 9 15/8' }] }),
        );
      }) as typeof fetch,
    });
    const dias = await ex({ repartidor: 'Yoa', mes: '2026-08', mensajes });
    expect(dias[0]).toMatchObject({ fecha: '2026-08-15', entregados: 9 });
    expect(cuerpo.tool_choice).toBeUndefined();
    expect((cuerpo.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    expect(String(cuerpo.messages && JSON.stringify(cuerpo.messages))).toContain('[enviado 2026-08-16 21:49] Entregado 9 15/8');
  });

  it('reintenta una vez si el JSON no es válido y luego da un error claro', async () => {
    let llamadas = 0;
    const ex = crearExtractorAnthropic({
      apiKey: 'x',
      modelo: 'm',
      fetch: (async () => {
        llamadas++;
        return respuesta('{"dias": [{"fecha": "mal"}]}');
      }) as typeof fetch,
    });
    await expect(ex({ repartidor: 'Yoa', mes: '2026-08', mensajes })).rejects.toBeInstanceOf(ErrorIa);
    expect(llamadas).toBe(2);
  });
});
