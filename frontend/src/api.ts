const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export class ErrorApi extends Error {
  status: number;
  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.status = status;
  }
}

async function llamar<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(BASE + ruta, { credentials: 'include', ...init });
  } catch {
    throw new ErrorApi(0, 'No hay conexión con el servidor. Revisa tu internet.');
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorApi(r.status, datos.error ?? 'Algo ha fallado.');
  return datos as T;
}

const json = (cuerpo: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(cuerpo),
});

// --- Tipos ---

export interface Yo {
  usuario: { nombre: string; email: string; rol: 'superadmin' | 'empresa' };
  empresa: { id: number; nombre: string; nombreDuenoWhatsapp: string | null; precioPaquete: number } | null;
}

export interface Repartidor {
  id: number;
  nombre: string;
  alias: string[];
  activo: boolean;
  mostrarEnResumen: boolean;
  tarifaPaquete: string | null;
  totalMensajes: number;
  ultimoMensaje: string | null;
}

export interface Detectado {
  clave: string;
  nombre: string;
  alias: string[];
  archivos: string[];
  totalMensajes: number;
  desde: string | null;
  hasta: string | null;
  ejemplos: { fechaHora: string; texto: string }[];
  coincidencia: { id: number; nombre: string } | null;
}

export interface Analisis {
  importacionId: number;
  dueno: string | null;
  remitentesPosibles: string[];
  archivos: { nombreArchivo: string; formato: string; tipo: 'individual' | 'grupo' | 'vacio'; totalMensajes: number; aviso?: string }[];
  errores: { nombreArchivo: string; error: string }[];
  detectados: Detectado[];
  repartidoresExistentes: { id: number; nombre: string }[];
}

export type Decision =
  | { clave: string; accion: 'crear'; nombre?: string }
  | { clave: string; accion: 'unir'; repartidorId: number }
  | { clave: string; accion: 'descartar' };

export interface ResultadoImportacion {
  repartidores: string[];
  mensajesNuevos: number;
  mensajesRepetidos: number;
  mesesAfectados: string[];
}

export type EstadoDia = 'ok' | 'dudoso' | 'error';

export interface Totales {
  diasTrabajados: number;
  salida: number;
  entregados: number;
  incidencias: number;
  dudosos: number;
  errores: number;
}

export interface DiaMes {
  id: number;
  fecha: string;
  salida: number | null;
  entregados: number | null;
  incidencias: number | null;
  estado: EstadoDia;
  nota: string | null;
  mensajeOriginal: string | null;
  editadoManual: boolean;
}

export interface ResumenMes {
  mes: string;
  estado: 'abierto' | 'cerrado';
  procesado: string | null;
  iaDisponible: boolean;
  precioCentimos: number;
  pagoCentimos: number;
  totales: Totales;
  repartidores: {
    id: number;
    nombre: string;
    activo: boolean;
    mostrarEnResumen: boolean;
    mensajes: number;
    precioPropio: boolean;
    precioCentimos: number;
    pagoCentimos: number;
    totales: Totales;
    diasSinReporte: string[];
    dias: DiaMes[];
  }[];
}

// --- Llamadas ---

export const api = {
  login: (email: string, password: string) => llamar<{ ok: true }>('/api/auth/login', json({ email, password })),
  logout: () => llamar<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  yo: () => llamar<Yo>('/api/auth/yo'),

  repartidores: () => llamar<{ repartidores: Repartidor[] }>('/api/repartidores'),
  cambiarRepartidor: (id: number, cambios: Partial<Pick<Repartidor, 'nombre' | 'alias' | 'activo' | 'mostrarEnResumen'>> & { tarifaPaquete?: number | null }) =>
    llamar<{ ok: true }>(`/api/repartidores/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cambios),
    }),

  analizar: (archivos: File[], dueno?: string) => {
    const f = new FormData();
    if (dueno) f.append('dueno', dueno);
    for (const a of archivos) f.append('archivos', a, a.name);
    return llamar<Analisis>('/api/importaciones/analizar', { method: 'POST', body: f });
  },
  confirmar: (id: number, decisiones: Decision[]) =>
    llamar<ResultadoImportacion & { ok: true }>(`/api/importaciones/${id}/confirmar`, json({ decisiones })),
  meses: () => llamar<{ meses: { mes: string; estado: string; procesado: string | null }[] }>('/api/meses'),
  mes: (mes: string) => llamar<ResumenMes>(`/api/meses/${mes}`),
  procesar: (mes: string) =>
    llamar<{ ok: true; procesados: number; errores: { repartidor: string; error: string }[] }>(`/api/meses/${mes}/procesar`, {
      method: 'POST',
    }),
  corregirDia: (id: number, salida: number | null, entregados: number | null) =>
    llamar<{ ok: true; estado: EstadoDia }>(`/api/registros/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salida, entregados }),
    }),
  eliminarRepartidor: (id: number) => llamar<{ ok: true }>(`/api/repartidores/${id}`, { method: 'DELETE' }),
  crearRepartidor: (nombre: string, tarifaPaquete: number | null) =>
    llamar<{ ok: true; id: number }>('/api/repartidores', json({ nombre, tarifaPaquete })),
  apuntarDia: (datos: { repartidorId: number; fecha: string; salida: number | null; entregados: number | null; nota?: string }) =>
    llamar<{ ok: true; id: number; estado: EstadoDia }>('/api/registros', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    }),
  cambiarPrecio: (precioPaquete: number) =>
    llamar<{ ok: true }>('/api/empresa/precio', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precioPaquete }),
    }),
  cancelar: (id: number) => llamar<{ ok: true }>(`/api/importaciones/${id}/cancelar`, { method: 'POST' }),
};

// --- Utilidades ---

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a.slice(2)}`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-10" -> "octubre 2026" */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} ${a}`;
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** "2026-10-01" -> "jue 1" */
export function diaSemana(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00Z');
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** 2720 -> "27,20 €" */
export const euros = (centimos: number) =>
  (centimos / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

/** "0,85" o "0.85" -> 0.85 (null si no es un número válido). */
export function leerPrecio(texto: string): number | null {
  const n = Number(texto.trim().replace('€', '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
}

/** Días del mes para la tabla: todos menos los domingos (salvo que ese domingo tenga datos). */
export function diasDelMes(mes: string, conDatos: Set<string> = new Set()): string[] {
  const [a, m] = mes.split('-').map(Number)
  const dias: string[] = []
  for (let d = 1; d <= 31; d++) {
    const f = new Date(Date.UTC(a, m - 1, d))
    if (f.getUTCMonth() !== m - 1) break
    const iso = f.toISOString().slice(0, 10)
    if (f.getUTCDay() !== 0 || conDatos.has(iso)) dias.push(iso)
  }
  return dias
}
