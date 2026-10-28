import type { DiaExtraido } from '../ia/extraer.js';

export type Estado = 'ok' | 'dudoso' | 'error';

export interface DiaValidado {
  fecha: string;
  salida: number | null;
  vuelta: number | null;
  estado: Estado;
  nota: string;
  mensajeOriginal: string;
}

const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Valida lo que devolvió la IA (todo con código, nada con IA):
 * - quita fechas fuera del mes y duplicados (se queda con el último)
 * - vuelta > salida → error
 * - nulos o confianza baja → dudoso
 * - cifras muy fuera de lo normal para ese repartidor → dudoso
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

  const salidas = [...porFecha.values()].map((d) => d.salida).filter((x): x is number => x !== null && x > 0);
  const mediaSalida = salidas.length >= 4 ? media(salidas) : null;

  return [...porFecha.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((d) => {
      const notas = d.nota ? [d.nota] : [];
      let estado: Estado = 'ok';

      if (d.salida === null || d.vuelta === null) {
        estado = 'dudoso';
        notas.push('Falta la salida o la vuelta.');
      } else if (d.vuelta > d.salida) {
        estado = 'error';
        notas.push('Vuelve con más paquetes de los que salió.');
      } else if (d.confianza === 'baja') {
        estado = 'dudoso';
      } else if (mediaSalida && (d.salida > mediaSalida * 2 || d.salida < mediaSalida * 0.3)) {
        estado = 'dudoso';
        notas.push(`Cifra poco habitual (media de salida: ${Math.round(mediaSalida)}).`);
      }

      return {
        fecha: d.fecha,
        salida: d.salida,
        vuelta: d.vuelta,
        estado,
        nota: [...new Set(notas)].join(' '),
        mensajeOriginal: d.mensaje_original,
      };
    });
}

/** Días laborables (lunes a sábado por defecto) del mes sin ningún registro. */
export function diasSinReporte(mes: string, fechasConDatos: Set<string>, hasta: string, laborables = [1, 2, 3, 4, 5, 6]): string[] {
  const [a, m] = mes.split('-').map(Number);
  const faltan: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const f = new Date(Date.UTC(a, m - 1, d));
    if (f.getUTCMonth() !== m - 1) break;
    const iso = f.toISOString().slice(0, 10);
    if (iso > hasta) break;
    if (laborables.includes(f.getUTCDay()) && !fechasConDatos.has(iso)) faltan.push(iso);
  }
  return faltan;
}

export interface Totales {
  diasTrabajados: number;
  salida: number;
  vuelta: number;
  entregados: number;
  dudosos: number;
  errores: number;
}

/** Entregados de un día, o null si no se puede calcular. */
export const entregadosDia = (d: { salida: number | null; vuelta: number | null }) =>
  d.salida !== null && d.vuelta !== null && d.vuelta <= d.salida ? d.salida - d.vuelta : null;

/**
 * Totales del mes. Solo suman los días con salida y vuelta coherentes;
 * los dudosos con datos completos suman, pero quedan contados para revisarlos.
 */
export function calcularTotales(dias: { salida: number | null; vuelta: number | null; estado: Estado }[]): Totales {
  const t: Totales = { diasTrabajados: 0, salida: 0, vuelta: 0, entregados: 0, dudosos: 0, errores: 0 };
  for (const d of dias) {
    if (d.estado === 'dudoso') t.dudosos++;
    if (d.estado === 'error') t.errores++;
    const e = entregadosDia(d);
    if (e === null) continue;
    t.diasTrabajados++;
    t.salida += d.salida!;
    t.vuelta += d.vuelta!;
    t.entregados += e;
  }
  return t;
}
