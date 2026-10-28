import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { leerArchivo, nombreDesdeArchivo } from '../src/parser/archivos.js';
import { analizarChats, type ChatParaAnalizar } from '../src/parser/deteccion.js';
import { normalizarNombre } from '../src/parser/normalizar.js';
import { leerChat, mensajesDelMes } from '../src/parser/whatsapp.js';

const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n));

async function zipIphone(nombreZip: string, fixture: string) {
  const zip = new JSZip();
  zip.file('_chat.txt', fx(fixture));
  return { nombre: nombreZip, datos: await zip.generateAsync({ type: 'nodebuffer' }) };
}

async function preparar(nombre: string, datos: Buffer): Promise<ChatParaAnalizar> {
  const a = await leerArchivo(nombre, datos);
  return { nombreArchivo: a.nombreArchivo, nombreDesdeArchivo: a.nombreDesdeArchivo, chat: leerChat(a.texto) };
}

describe('nombreDesdeArchivo', () => {
  it.each([
    ['Chat de WhatsApp con Juan Moto.txt', 'Juan Moto'],
    ['Chat de WhatsApp con Juan Moto (1).txt', 'Juan Moto'],
    ['Chat de WhatsApp - Pedro 🚚.zip', 'Pedro 🚚'],
    ['WhatsApp Chat - Pedro.zip', 'Pedro'],
    ['WhatsApp Chat with Mike.txt', 'Mike'],
    ['_chat.txt', null],
    ['notas.txt', null],
  ])('%s -> %s', (archivo, esperado) => {
    expect(nombreDesdeArchivo(archivo)).toBe(esperado);
  });
});

describe('normalizarNombre', () => {
  it('quita emojis, tildes y mayúsculas', () => {
    expect(normalizarNombre('  Pedro 🚚 ')).toBe('pedro');
    expect(normalizarNombre('José  Ángel')).toBe('jose angel');
  });
});

describe('leerChat — Android', () => {
  const chat = leerChat(fx('Chat de WhatsApp con Juan Moto.txt').toString());

  it('detecta el formato', () => expect(chat.formato).toBe('android'));

  it('ignora el aviso de cifrado y el multimedia omitido', () => {
    expect(chat.mensajes.some((m) => /cifrados/.test(m.texto))).toBe(false);
    expect(chat.mensajes.some((m) => /Multimedia/.test(m.texto))).toBe(false);
  });

  it('lee fecha, hora, remitente y texto', () => {
    expect(chat.mensajes[0]).toEqual({
      fechaHora: '2026-10-01T21:15:00',
      remitente: 'Juan Moto',
      texto: 'Salí con 120, volví con 8',
    });
  });

  it('une los mensajes multilínea', () => {
    const m = chat.mensajes.find((x) => x.texto.startsWith('mañana'));
    expect(m?.texto).toBe('mañana llego un poco tarde\nque tengo médico');
  });

  it('quita la marca de mensaje editado', () => {
    expect(chat.mensajes.find((x) => x.fechaHora === '2026-10-07T21:10:00')?.texto).toBe('100 y 2');
  });

  it('filtra por mes', () => {
    const oct = mensajesDelMes(chat.mensajes, '2026-10');
    expect(oct.every((m) => m.fechaHora.startsWith('2026-10'))).toBe(true);
    expect(mensajesDelMes(chat.mensajes, '2026-09')).toHaveLength(1);
  });
});

describe('leerChat — iPhone', () => {
  const chat = leerChat(fx('_chat_pedro.txt').toString());

  it('detecta formato y quita caracteres invisibles y mensajes de sistema', () => {
    expect(chat.formato).toBe('iphone');
    expect(chat.mensajes.map((m) => m.texto)).toEqual([
      'Salgo 130 vuelvo 10',
      '125 / 4',
      'Perfecto',
    ]);
    expect(chat.mensajes[0].fechaHora).toBe('2026-10-01T21:15:03');
    expect(chat.mensajes[0].remitente).toBe('Pedro 🚚');
  });
});

describe('leerChat — 12 horas y MM/DD', () => {
  it('convierte p. m. / a. m. a 24 h', () => {
    const chat = leerChat(fx('Chat de WhatsApp con Ana.txt').toString());
    expect(chat.mensajes.map((m) => m.fechaHora)).toEqual([
      '2026-10-01T21:15:00',
      '2026-10-02T00:05:00',
      '2026-10-02T09:00:00',
    ]);
  });

  it('detecta archivos con el mes primero', () => {
    const chat = leerChat(fx('WhatsApp Chat with Mike.txt').toString());
    expect(chat.mensajes[0].fechaHora).toBe('2026-10-13T21:15:00');
  });

  it('no confunde un texto que empieza por fecha con un mensaje nuevo', () => {
    const chat = leerChat('01/10/26, 21:15 - Juan: hola\n02/10/26 es mi día libre');
    expect(chat.mensajes).toHaveLength(1);
    expect(chat.mensajes[0].texto).toBe('hola\n02/10/26 es mi día libre');
  });
});

describe('leerArchivo', () => {
  it('extrae el _chat.txt de un .zip de iPhone y toma el nombre del zip', async () => {
    const z = await zipIphone('Chat de WhatsApp - Pedro 🚚.zip', '_chat_pedro.txt');
    const a = await leerArchivo(z.nombre, z.datos);
    expect(a.nombreDesdeArchivo).toBe('Pedro 🚚');
    expect(leerChat(a.texto).mensajes).toHaveLength(3);
  });
});

describe('analizarChats', () => {
  it('detecta al dueño común y un repartidor por chat individual', async () => {
    const z = await zipIphone('Chat de WhatsApp - Pedro 🚚.zip', '_chat_pedro.txt');
    const chats = [
      await preparar('Chat de WhatsApp con Juan Moto.txt', fx('Chat de WhatsApp con Juan Moto.txt')),
      await preparar(z.nombre, z.datos),
    ];
    const r = analizarChats(chats);
    expect(r.dueno).toBe('Yoa Jefe');
    expect(r.detectados.map((d) => d.nombre)).toEqual(['Juan Moto', 'Pedro 🚚']);
    // Solo se quedan los mensajes del repartidor, nunca los del dueño.
    expect(r.detectados.every((d) => d.mensajes.every((m) => m.remitente !== 'Yoa Jefe'))).toBe(true);
    expect(r.detectados[0].desde).toBe('2026-09-30');
  });

  it('con un solo chat deduce el dueño gracias al nombre del archivo', async () => {
    const r = analizarChats([await preparar('Chat de WhatsApp con Ana.txt', fx('Chat de WhatsApp con Ana.txt'))]);
    expect(r.dueno).toBe('Yoa Jefe');
    expect(r.detectados.map((d) => d.nombre)).toEqual(['Ana']);
  });

  it('en un grupo cada remitente que no es el dueño es un repartidor', async () => {
    const r = analizarChats(
      [await preparar('Chat de WhatsApp con Repartidores.txt', fx('Chat de WhatsApp con Repartidores.txt'))],
      { duenoConocido: 'Yoa Jefe' },
    );
    expect(r.archivos[0].tipo).toBe('grupo');
    expect(r.detectados.map((d) => d.nombre)).toEqual(['Juan Moto', 'Luis']);
  });

  it('si no se sabe el dueño de un grupo, pide elegirlo', async () => {
    const r = analizarChats([
      await preparar('Chat de WhatsApp con Repartidores.txt', fx('Chat de WhatsApp con Repartidores.txt')),
    ]);
    expect(r.dueno).toBeNull();
    expect(r.remitentesPosibles).toEqual(['Juan Moto', 'Luis', 'Yoa Jefe']);
    expect(r.archivos[0].aviso).toMatch(/Elige tu nombre/);
  });

  it('une el mismo repartidor que aparece en el chat individual y en el grupo', async () => {
    const r = analizarChats(
      [
        await preparar('Chat de WhatsApp con Juan Moto.txt', fx('Chat de WhatsApp con Juan Moto.txt')),
        await preparar('Chat de WhatsApp con Repartidores.txt', fx('Chat de WhatsApp con Repartidores.txt')),
      ],
      { duenoConocido: 'Yoa Jefe' },
    );
    const juan = r.detectados.find((d) => d.clave === 'juan moto');
    expect(juan?.archivos).toHaveLength(2);
  });

  it('sugiere un repartidor existente si coincide un alias', async () => {
    const r = analizarChats(
      [await preparar('Chat de WhatsApp con Pedro 🚚.txt', fx('_chat_pedro.txt'))],
      { existentes: [{ id: 7, nombre: 'Pedro García', alias: ['Pedro 🚚'] }] },
    );
    expect(r.detectados[0].coincidencia).toEqual({ id: 7, nombre: 'Pedro García' });
  });
});
