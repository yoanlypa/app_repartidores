import { limpiarInvisibles } from './normalizar.js';

export interface Mensaje {
  /** Fecha y hora local del mensaje, formato "AAAA-MM-DDTHH:MM:SS" (sin zona horaria). */
  fechaHora: string;
  remitente: string;
  texto: string;
}

export interface ChatLeido {
  formato: 'android' | 'iphone' | 'desconocido';
  mensajes: Mensaje[];
  /** Líneas con fecha que no se pudieron interpretar (para depurar). */
  lineasIgnoradas: number;
}

// [07/10/26, 21:15:03] Juan: texto          (iPhone)
// 07/10/26, 21:15 - Juan: texto             (Android)
// 7/10/26, 9:15 p. m. - Juan: texto         (Android 12 h)
const CABECERA =
  /^(\[)?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?|am|pm)?(\])?(\s*-\s+|\s+)(.*)$/i;

/** Mensajes de sistema o vacíos que no aportan nada. */
const IGNORAR = [
  /cifrad[oa]s de extremo a extremo/i,
  /end-to-end encrypted/i,
  /^<?\s*multimedia omitid[oa]\s*>?$/i,
  /^<?\s*media omitted\s*>?$/i,
  /^(imagen|audio|video|vídeo|sticker|gif|documento) omitid[oa]$/i,
  /^(image|audio|video|sticker|gif|document) omitted$/i,
  /^se elimin[oó] este mensaje\.?$/i,
  /^eliminaste este mensaje\.?$/i,
  /^this message was deleted\.?$/i,
  /^you deleted this message\.?$/i,
  /^null$/i,
  /^mensaje temporal/i,
  /^los mensajes temporales/i,
];

/** Marcas de edición que se quitan del texto (el mensaje sí se conserva). */
const MARCA_EDITADO = /\s*<\s*(se edit[oó] este mensaje|this message was edited)\.?\s*>\s*$/i;

interface Cabecera {
  a: number;
  b: number;
  anio: number;
  hora: number;
  min: number;
  seg: number;
  iphone: boolean;
  resto: string;
}

function leerCabecera(linea: string): Cabecera | null {
  const m = CABECERA.exec(linea);
  if (!m) return null;
  const [, corchete, a, b, anio, hora, min, seg, ampm, cierre, separador, resto] = m;
  const esIphone = Boolean(corchete && cierre);
  if (Boolean(corchete) !== Boolean(cierre)) return null;
  // Android: tras la hora debe venir " - ". Si no, es texto que empieza por una fecha.
  if (!esIphone && !separador.includes('-')) return null;
  let h = Number(hora);
  if (ampm) {
    const pm = /^p/i.test(ampm);
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  let y = Number(anio);
  if (y < 100) y += 2000;
  return {
    a: Number(a),
    b: Number(b),
    anio: y,
    hora: h,
    min: Number(min),
    seg: seg ? Number(seg) : 0,
    iphone: esIphone,
    resto,
  };
}

const dos = (n: number) => String(n).padStart(2, '0');

/**
 * Lee el texto de un chat exportado de WhatsApp (Android o iPhone).
 * Por defecto las fechas son DD/MM (España). Si el archivo tiene alguna
 * fecha imposible como DD/MM (segundo número > 12), se interpreta como MM/DD.
 */
export function leerChat(textoBruto: string): ChatLeido {
  const lineas = textoBruto.replace(/\r\n?/g, '\n').split('\n').map(limpiarInvisibles);

  // Primera pasada: detectar el orden día/mes del archivo.
  let mesPrimero = false;
  for (const l of lineas) {
    const c = leerCabecera(l);
    if (c && c.b > 12 && c.a <= 12) {
      mesPrimero = true;
      break;
    }
  }

  const mensajes: Mensaje[] = [];
  let actual: (Mensaje & { sistema: boolean }) | null = null;
  let iphone = 0;
  let android = 0;
  let lineasIgnoradas = 0;

  const cerrar = () => {
    if (!actual) return;
    const texto = actual.texto.replace(MARCA_EDITADO, '').trim();
    if (!actual.sistema && texto && !IGNORAR.some((r) => r.test(texto))) {
      mensajes.push({ fechaHora: actual.fechaHora, remitente: actual.remitente, texto });
    }
    actual = null;
  };

  for (const linea of lineas) {
    const c = leerCabecera(linea);
    if (!c) {
      // Continuación de un mensaje multilínea.
      if (actual) actual.texto += '\n' + linea;
      continue;
    }
    cerrar();
    const dia = mesPrimero ? c.b : c.a;
    const mes = mesPrimero ? c.a : c.b;
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
      lineasIgnoradas++;
      continue;
    }
    if (c.iphone) iphone++;
    else android++;
    const fechaHora = `${c.anio}-${dos(mes)}-${dos(dia)}T${dos(c.hora)}:${dos(c.min)}:${dos(c.seg)}`;
    const sep = c.resto.indexOf(': ');
    if (sep === -1) {
      // Mensaje de sistema sin remitente ("Juan añadió a Pedro", aviso de cifrado en Android...).
      actual = { fechaHora, remitente: '', texto: c.resto, sistema: true };
    } else {
      actual = {
        fechaHora,
        remitente: c.resto.slice(0, sep).trim(),
        texto: c.resto.slice(sep + 2),
        sistema: false,
      };
    }
  }
  cerrar();

  return {
    formato: iphone > android ? 'iphone' : android > 0 ? 'android' : 'desconocido',
    mensajes,
    lineasIgnoradas,
  };
}

/** Filtra los mensajes de un mes concreto ("AAAA-MM"). */
export function mensajesDelMes(mensajes: Mensaje[], mes: string): Mensaje[] {
  return mensajes.filter((m) => m.fechaHora.startsWith(mes));
}
