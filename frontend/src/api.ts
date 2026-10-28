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
  empresa: { id: number; nombre: string; nombreDuenoWhatsapp: string | null } | null;
}

export interface Repartidor {
  id: number;
  nombre: string;
  alias: string[];
  activo: boolean;
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
}

// --- Llamadas ---

export const api = {
  login: (email: string, password: string) => llamar<{ ok: true }>('/api/auth/login', json({ email, password })),
  logout: () => llamar<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  yo: () => llamar<Yo>('/api/auth/yo'),

  repartidores: () => llamar<{ repartidores: Repartidor[] }>('/api/repartidores'),
  cambiarRepartidor: (id: number, cambios: Partial<Pick<Repartidor, 'nombre' | 'alias' | 'activo'>>) =>
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
  cancelar: (id: number) => llamar<{ ok: true }>(`/api/importaciones/${id}/cancelar`, { method: 'POST' }),
};

// --- Utilidades ---

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a.slice(2)}`;
}
