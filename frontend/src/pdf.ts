import type { ResumenMes } from './api'
import { diaSemana, euros, nombreMes } from './api'

type Rep = ResumenMes['repartidores'][number]

// Las fuentes estándar del PDF solo tienen Latin-1 (+ €, comillas…): quitamos emojis y símbolos raros.
const EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
const limpiar = (t: string) =>
  [...t]
    .filter((c) => c.charCodeAt(0) <= 0xff || EXTRA.includes(c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

export interface DatosPdf {
  empresa: string
  datos: ResumenMes
  repartidores: Rep[]
  dias: string[]
  notasDe: (fecha: string) => string
}

export async function descargarPdf({ empresa, datos, repartidores, dias, notasDe }: DatosPdf) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const titulo = `Liquidación ${nombreMes(datos.mes)}`

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(titulo.charAt(0).toUpperCase() + titulo.slice(1), 12, 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  doc.text(
    `${limpiar(empresa)} · generado el ${new Date().toLocaleDateString('es-ES')} · cifras = paquetes entregados`,
    12,
    19.5,
  )
  doc.setTextColor(0)

  const porDia = new Map<string, Map<number, Rep['dias'][number]>>()
  for (const r of repartidores) for (const d of r.dias) {
    if (!porDia.has(d.fecha)) porDia.set(d.fecha, new Map())
    porDia.get(d.fecha)!.set(r.id, d)
  }

  const cabecera = ['Día', ...repartidores.map((r) => limpiar(r.nombre)), 'Notas']
  const cuerpo = dias.map((f) => [
    diaSemana(f),
    ...repartidores.map((r) => {
      const d = porDia.get(f)?.get(r.id)
      return d?.entregados == null ? (d ? '?' : '') : String(d.entregados)
    }),
    limpiar(notasDe(f)),
  ])
  const total = (fn: (r: Rep) => string) => repartidores.map(fn)
  const pie = [
    ['Entreg.', ...total((r) => String(r.totales.entregados)), ''],
    ['Incid.', ...total((r) => String(r.totales.incidencias)), ''],
    ['Precio', ...total((r) => (r.precioCentimos ? euros(r.precioCentimos) : '—')), ''],
    ['A pagar', ...total((r) => (r.precioCentimos ? euros(r.pagoCentimos) : '—')), limpiar(`Total: ${euros(repartidores.reduce((t, r) => t + r.pagoCentimos, 0))}`)],
  ]

  const anchoNotas = Math.max(60, 273 - 19 - repartidores.length * 20)

  autoTable(doc, {
    startY: 24,
    head: [cabecera],
    body: cuerpo,
    foot: pie,
    theme: 'grid',
    margin: { left: 12, right: 12, top: 12, bottom: 8 },
    showFoot: 'lastPage',
    styles: { fontSize: 8, cellPadding: { top: 0.7, bottom: 0.7, left: 1.5, right: 1.5 }, lineColor: [220, 220, 225], lineWidth: 0.2, valign: 'middle' },
    headStyles: { fillColor: [24, 24, 27], textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [244, 244, 245], textColor: 20, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'left', cellWidth: 19, fontStyle: 'bold' },
      [cabecera.length - 1]: { halign: 'left', cellWidth: anchoNotas, fontSize: 6.5, textColor: 70 },
    },
    bodyStyles: { halign: 'center' },
    didParseCell: (h) => {
      if (h.section === 'body' && h.column.index > 0 && h.column.index < cabecera.length - 1) {
        const r = repartidores[h.column.index - 1]
        const d = porDia.get(dias[h.row.index])?.get(r.id)
        if (d?.estado === 'dudoso') h.cell.styles.fillColor = [254, 243, 199]
        if (d?.estado === 'error') h.cell.styles.fillColor = [254, 226, 226]
        h.cell.styles.fontSize = 9
      }
      if (h.section === 'foot' && h.column.index === cabecera.length - 1) h.cell.styles.halign = 'right'
      if (h.section === 'foot' && h.row.index === pie.length - 1) h.cell.styles.fillColor = [236, 252, 203]
    },
  })

  const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 190
  if (y < 196) {
    doc.setFontSize(7.5)
    doc.setTextColor(120)
    doc.text('Amarillo: dato para revisar · Rojo: error (no suma) · ?: sin entregados', 12, y + 5)
  }

  doc.save(`liquidacion-${datos.mes}.pdf`)
}
