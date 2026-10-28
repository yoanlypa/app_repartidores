import JSZip from 'jszip';
import { limpiarInvisibles } from './normalizar.js';

export interface ArchivoChat {
  /** Nombre del archivo tal como se subió. */
  nombreArchivo: string;
  /** Nombre del contacto o grupo sacado del nombre del archivo (o null si no se puede). */
  nombreDesdeArchivo: string | null;
  texto: string;
}

const PATRONES_NOMBRE = [
  /^chat de whatsapp con\s+(.+)$/i,
  /^chat de whatsapp\s*[-–]\s*(.+)$/i,
  /^whatsapp chat with\s+(.+)$/i,
  /^whatsapp chat\s*[-–]\s*(.+)$/i,
  /^conversa do whatsapp com\s+(.+)$/i,
  /^discussion whatsapp avec\s+(.+)$/i,
  /^whatsapp[- ]chat mit\s+(.+)$/i,
];

/** "Chat de WhatsApp con Juan Moto (1).txt" -> "Juan Moto" */
export function nombreDesdeArchivo(nombreArchivo: string): string | null {
  let base = limpiarInvisibles(nombreArchivo.split(/[/\\]/).pop() ?? '')
    .replace(/\.(txt|zip)$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .trim();
  for (const p of PATRONES_NOMBRE) {
    const m = p.exec(base);
    if (m) {
      base = m[1].replace(/\s*\(\d+\)$/, '').trim();
      return base || null;
    }
  }
  return null;
}

/** Lee un .txt o un .zip exportado de WhatsApp y devuelve el texto del chat. */
export async function leerArchivo(nombreArchivo: string, datos: Buffer): Promise<ArchivoChat> {
  const esZip = /\.zip$/i.test(nombreArchivo) || (datos[0] === 0x50 && datos[1] === 0x4b);
  let texto: string;
  let nombre = nombreDesdeArchivo(nombreArchivo);

  if (esZip) {
    const zip = await JSZip.loadAsync(datos);
    const txts = Object.values(zip.files).filter((f) => !f.dir && /\.txt$/i.test(f.name));
    if (txts.length === 0) throw new Error('El .zip no contiene ningún chat (.txt).');
    const chat = txts.find((f) => /_chat\.txt$/i.test(f.name)) ?? txts[0];
    texto = await chat.async('string');
    nombre ??= nombreDesdeArchivo(chat.name);
  } else {
    texto = datos.toString('utf8');
  }

  return { nombreArchivo, nombreDesdeArchivo: nombre, texto };
}
