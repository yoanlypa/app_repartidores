import type { DiaExtraido } from '../ia/extraer.js';

export type Estado = 'ok' | 'dudoso' | 'error';

export interface DiaValidado {
  fecha: string;
  salida: number | null;
  entregados: number | null;
  incidencias: number | null;
  estado: Estado;
  nota: string;
  mensajeOriginal: string;
}

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Completa con código lo que se puede deducir y comprueba que cuadra:
 * - entregados = salida − incidencias (si no lo dijo)
 * - incidencias = salida − entregados (si no lo dijo)
 * - salida = entregados + incidencias (si no lo dijo)
 */
export function completar(d: { salida: number | null; entregados: number | null; incidencias: number | null }) {
  let { salida, entregados, incidencias } = d;
  if (entregados === null && salida !== null && incidencias !== null && incidencias <= salida) entregados = salida - incidencias;
  if (salida === null && entregados !== null && incidencias !== null) salida = entregados + incidencias;
  if (incidencias === null && salida !== null && entregados !== null && entregados <= salida) incidencias = salida - entregados;
  return { salida, entregados, incidencias };
}

/** Estado de un día según sus números (lo usan la IA y las correcciones manuales). */
export function estadoDia(d: { salida: number | null; entregados: number | null; incidencias: number | null }): {
  estado: Estado;
  nota: string | null;
} {
  if (d.entregados === null) return { estado: 'dudoso', nota: 'No se sabe cuántos entregó.' };
  if (d.salida !== null && d.entregados > d.salida) return { estado: 'error', nota: 'Entregó más paquetes de los que salió.' };
  if (d.salida !== null && d.incidencias !== null && d.entregados + d.incidencias !== d.salida) {
    return { estado: 'dudoso', nota: 'Entregados + incidencias no coincide con la salida.' };
  }
  return { estado: 'ok', nota: null };
}

/**
 * Valida lo que devolvió la IA (todo con código, nada con IA):
 * - quita fechas fuera del mes o imposibles y duplicados (se queda con el último)
 * - sin entregados → dudoso; entregados > salida → error
 * - confianza baja → dudoso
 * - entregados muy fuera de lo normal para ese repartidor → dudoso
 */
export function validarDias(dias: DiaExtraido[], mes: string): DiaValidado[] {
  const porFecha = new Map<string, DiaExtraido>();
  for (const d of dias) {
    if (!d.fecha.startsWith(mes + '-')) continue;
    const [a, m, dd] = d.fecha.split('-').map(Number);
    const f = new Date(Date.UTC(a, m - 1, dd));
    if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== dd) continue; // fecha imposible (31/02)
    porFecha.set(d.fecha, d);
  }

  const completos = [...porFecha.values()].map((d) => ({ ...d, ...completar(d) }));
  const entregas = completos.map((d) => d.entregados).filter((x): x is number => x !== null && x > 0);
  const mediaEntregas = entregas.length >= 4 ? media(entregas) : null;

  return completos
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((d) => {
      const notas = d.nota ? [d.nota] : [];
      let { estado, nota } = estadoDia(d);
      if (nota) notas.push(nota);
      if (estado === 'ok' && d.confianza === 'baja') estado = 'dudoso';
      if (estado === 'ok' && mediaEntregas && d.entregados !== null && (d.entregados > mediaEntregas * 2.5 || d.entregados < mediaEntregas * 0.25)) {
        estado = 'dudoso';
        notas.push(`Cifra poco habitual (media de entregas: ${Math.round(mediaEntregas)}).`);
      }
      return {
        fecha: d.fecha,
        salida: d.salida,
        entregados: d.entregados,
        incidencias: d.incidencias,
        estado,
        nota: [...new Set(notas)].join(' '),
        mensajeOriginal: d.mensaje_original,
      };
    });
}

/**
 * Días laborables (lunes a sábado por defecto) del mes sin ningún registro, entre el primer
 * día con datos del repartidor (no avisa de los días antes de empezar) y `hasta`.
 */
export function diasSinReporte(mes: string, fechasConDatos: Set<string>, hasta: string, laborables = [1, 2, 3, 4, 5, 6]): string[] {
  const primero = [...fechasConDatos].sort()[0] ?? `${mes}-01`;
  const [a, m] = mes.split('-').map(Number);
  const faltan: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCMonth() !== m - 1) break;
    const iso = f.toISOString().slice(0, 10);
    if (iso > hasta) break;
    if (iso < primero) continue;
    if (laborables.includes(f.getUTCDay()) && !fechasConDatos.has(iso)) faltan.push(iso);
  }
  return faltan;
}

export interface Totales {
  diasTrabajados: number;
  salida: number;
  entregados: number;
  incidencias: number;
  dudosos: number;
  errores: number;
}

/**
 * Totales del mes. Suman los entregados de todos los días que los tienen, salvo los
 * días con error (hasta que se corrijan). Los dudosos suman, pero quedan contados para revisarlos.
 */
export function calcularTotales(
  dias: { salida: number | null; entregados: number | null; incidencias: number | null; estado: Estado }[],
): Totales {
  const t: Totales = { diasTrabajados: 0, salida: 0, entregados: 0, incidencias: 0, dudosos: 0, errores: 0 };
  for (const d of dias) {
    if (d.estado === 'dudoso') t.dudosos++;
    if (d.estado === 'error') {
      t.errores++;
      continue;
    }
    if (d.entregados === null) continue;
    t.diasTrabajados++;
    t.entregados += d.entregados;
    t.salida += d.salida ?? 0;
    t.incidencias += d.incidencias ?? 0;
  }
  return t;
}

/** "0.85" -> 85 céntimos. Se calcula en céntimos para no perder decimales. */
export const aCentimos = (precio: string | number | null) => Math.round(Number(precio ?? 0) * 100);

/** Pago = entregados × precio por paquete (en céntimos). */
export const pagoCentimos = (entregados: number, precioCentimos: number) => entregados * precioCentimos;
