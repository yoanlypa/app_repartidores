import { normalizarNombre } from './normalizar.js';
import type { ChatLeido, Mensaje } from './whatsapp.js';

export interface ChatParaAnalizar {
  nombreArchivo: string;
  nombreDesdeArchivo: string | null;
  chat: ChatLeido;
}

export interface RepartidorExistente {
  id: number;
  nombre: string;
  alias: string[];
}

export interface RepartidorDetectado {
  /** Nombre normalizado; sirve de clave para confirmar. */
  clave: string;
  nombre: string;
  alias: string[];
  archivos: string[];
  mensajes: Mensaje[];
  desde: string | null;
  hasta: string | null;
  /** Repartidor ya existente con el mismo nombre o alias. */
  coincidencia: { id: number; nombre: string } | null;
}

export interface ResumenArchivo {
  nombreArchivo: string;
  formato: ChatLeido['formato'];
  tipo: 'individual' | 'grupo' | 'vacio';
  totalMensajes: number;
  aviso?: string;
}

export interface Analisis {
  /** Nombre del dueño en los chats (null si no se ha podido deducir). */
  dueno: string | null;
  /** Todos los remitentes de los chats, para elegir (o cambiar) quién es el dueño. */
  remitentesPosibles: string[];
  archivos: ResumenArchivo[];
  detectados: RepartidorDetectado[];
}

function remitentes(chat: ChatLeido): Map<string, string> {
  // normalizado -> nombre original (el primero que aparece)
  const m = new Map<string, string>();
  for (const msg of chat.mensajes) {
    const n = normalizarNombre(msg.remitente);
    if (n && !m.has(n)) m.set(n, msg.remitente);
  }
  return m;
}

/** Deduce quién es el dueño (normalizado) a partir de los chats subidos. */
export function detectarDueno(chats: ChatParaAnalizar[], duenoConocido?: string | null): string | null {
  const porChat = chats.map((c) => remitentes(c.chat)).filter((m) => m.size > 0);
  if (porChat.length === 0) return null;

  if (duenoConocido) {
    const n = normalizarNombre(duenoConocido);
    if (porChat.some((m) => m.has(n))) return n;
  }

  // Remitente común a todos los chats (con 2 o más chats).
  if (porChat.length >= 2) {
    let comun = new Set(porChat[0].keys());
    for (const m of porChat.slice(1)) comun = new Set([...comun].filter((k) => m.has(k)));
    if (comun.size === 1) return [...comun][0];
  }

  // Chat individual: el remitente que NO coincide con el nombre del archivo es el dueño.
  const candidatos = new Set<string>();
  chats.forEach((c) => {
    const m = remitentes(c.chat);
    const delArchivo = c.nombreDesdeArchivo ? normalizarNombre(c.nombreDesdeArchivo) : null;
    if (m.size === 2 && delArchivo && m.has(delArchivo)) {
      for (const k of m.keys()) if (k !== delArchivo) candidatos.add(k);
    }
  });
  if (candidatos.size === 1) return [...candidatos][0];

  return null;
}

function buscarCoincidencia(clave: string, alias: string[], existentes: RepartidorExistente[]) {
  const buscar = new Set([clave, ...alias.map(normalizarNombre)]);
  for (const r of existentes) {
    const suyos = [r.nombre, ...r.alias].map(normalizarNombre);
    if (suyos.some((s) => buscar.has(s))) return { id: r.id, nombre: r.nombre };
  }
  return null;
}

export function analizarChats(
  chats: ChatParaAnalizar[],
  opciones: { duenoConocido?: string | null; existentes?: RepartidorExistente[] } = {},
): Analisis {
  const existentes = opciones.existentes ?? [];
  const duenoClave = detectarDueno(chats, opciones.duenoConocido);
  let duenoNombre: string | null = null;

  const archivos: ResumenArchivo[] = [];
  const detectados = new Map<string, RepartidorDetectado>();

  const anadir = (clave: string, nombre: string, alias: string[], archivo: string, mensajes: Mensaje[]) => {
    let d = detectados.get(clave);
    if (!d) {
      d = { clave, nombre, alias: [], archivos: [], mensajes: [], desde: null, hasta: null, coincidencia: null };
      detectados.set(clave, d);
    }
    for (const a of alias) if (a && !d.alias.includes(a)) d.alias.push(a);
    if (!d.archivos.includes(archivo)) d.archivos.push(archivo);
    d.mensajes.push(...mensajes);
  };

  for (const c of chats) {
    const rem = remitentes(c.chat);
    if (duenoClave && rem.has(duenoClave)) duenoNombre ??= rem.get(duenoClave)!;
    const otros = [...rem.keys()].filter((k) => k !== duenoClave);
    const resumen: ResumenArchivo = {
      nombreArchivo: c.nombreArchivo,
      formato: c.chat.formato,
      tipo: 'individual',
      totalMensajes: c.chat.mensajes.length,
    };
    archivos.push(resumen);

    if (c.chat.mensajes.length === 0) {
      resumen.tipo = 'vacio';
      resumen.aviso = 'No se ha encontrado ningún mensaje. ¿Es una exportación de WhatsApp?';
      continue;
    }

    if (!duenoClave) {
      // Sin dueño solo podemos resolver chats donde el archivo dice quién es el repartidor.
      const delArchivo = c.nombreDesdeArchivo ? normalizarNombre(c.nombreDesdeArchivo) : null;
      if (delArchivo && rem.has(delArchivo)) {
        const nombre = c.nombreDesdeArchivo!;
        anadir(delArchivo, nombre, [rem.get(delArchivo)!], c.nombreArchivo,
          c.chat.mensajes.filter((m) => normalizarNombre(m.remitente) === delArchivo));
      } else {
        resumen.aviso = 'No se sabe quién eres tú en este chat. Elige tu nombre.';
      }
      continue;
    }

    if (otros.length === 0) {
      resumen.aviso = 'En este chat solo hay mensajes tuyos.';
      continue;
    }

    if (otros.length > 1) resumen.tipo = 'grupo';

    // El nombre del archivo es como el dueño tiene guardado al repartidor, salvo que el chat se
    // exportara desde el móvil del repartidor: entonces el archivo lleva el nombre del dueño.
    const archivoEsDelRepartidor =
      resumen.tipo === 'individual' &&
      Boolean(c.nombreDesdeArchivo) &&
      normalizarNombre(c.nombreDesdeArchivo!) !== duenoClave;

    for (const clave of otros) {
      const original = rem.get(clave)!;
      const nombre = archivoEsDelRepartidor ? c.nombreDesdeArchivo! : original;
      const claveFinal = normalizarNombre(nombre);
      const alias = [original];
      if (archivoEsDelRepartidor) alias.push(c.nombreDesdeArchivo!);
      anadir(claveFinal, nombre, alias, c.nombreArchivo,
        c.chat.mensajes.filter((m) => normalizarNombre(m.remitente) === clave));
    }
  }

  for (const d of detectados.values()) {
    d.mensajes.sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
    d.desde = d.mensajes[0]?.fechaHora.slice(0, 10) ?? null;
    d.hasta = d.mensajes.at(-1)?.fechaHora.slice(0, 10) ?? null;
    d.coincidencia = buscarCoincidencia(d.clave, d.alias, existentes);
  }

  const remitentesPosibles = [...new Set(chats.flatMap((c) => [...remitentes(c.chat).values()]))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );

  return {
    dueno: duenoNombre,
    remitentesPosibles,
    archivos,
    detectados: [...detectados.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  };
}
