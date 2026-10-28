import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, diaSemana, diasDelMes, euros, nombreMes, type DiaMes, type ResumenMes } from '../api'
import { useSesion } from '../sesion'
import { Aviso, Boton, campo, claseBoton, Tarjeta } from '../ui'

type Rep = ResumenMes['repartidores'][number]
type Seleccion = { rep: Rep; fecha: string; dia: DiaMes | null }

const pl = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`
const NOMBRE_DIA: Record<string, string> = { lun: 'L', mar: 'M', mié: 'X', jue: 'J', vie: 'V', sáb: 'S', dom: 'D' }

const fondoCelda: Record<DiaMes['estado'], string> = {
  ok: 'hover:bg-zinc-50',
  dudoso: 'bg-amber-100/70 hover:bg-amber-100',
  error: 'bg-red-100/80 hover:bg-red-100',
}

/** Texto de notas de un día: mensajes y notas de cada repartidor visible. */
function notasDelDia(fecha: string, reps: Rep[], porDia: Map<string, Map<number, DiaMes>>) {
  const partes: { nombre: string; mensaje: string | null; nota: string | null }[] = []
  for (const r of reps) {
    const d = porDia.get(fecha)?.get(r.id)
    if (d && (d.mensajeOriginal || d.nota)) partes.push({ nombre: r.nombre, mensaje: d.mensajeOriginal, nota: d.nota })
  }
  return partes
}

function Detalle({ sel, cerrar, alGuardar }: { sel: Seleccion; cerrar: () => void; alGuardar: () => void }) {
  const { rep, fecha, dia } = sel
  const [salida, setSalida] = useState(dia?.salida?.toString() ?? '')
  const [entregados, setEntregados] = useState(dia?.entregados?.toString() ?? '')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  const s = salida.trim() === '' ? null : Number(salida)
  const e = entregados.trim() === '' ? null : Number(entregados)
  const inc = s !== null && e !== null && e <= s ? s - e : null

  async function guardar() {
    if ((s !== null && !Number.isInteger(s)) || (e !== null && !Number.isInteger(e))) {
      setError('Escribe números enteros.')
      return
    }
    setOcupado(true)
    setError('')
    try {
      await api.apuntarDia({ repartidorId: rep.id, fecha, salida: s, entregados: e })
      alGuardar()
      cerrar()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  const [a, m, d] = fecha.split('-')
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={cerrar}>
      <div
        className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-label={`${rep.nombre}, ${diaSemana(fecha)}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{rep.nombre}</h2>
            <p className="text-sm capitalize text-zinc-500">
              {diaSemana(fecha)} · {d}/{m}/{a}
            </p>
          </div>
          <button onClick={cerrar} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {dia?.mensajeOriginal && (
          <div className="rounded-xl bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
            <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Mensaje</div>“{dia.mensajeOriginal}”
          </div>
        )}
        {dia?.nota && <Aviso tipo={dia.estado === 'ok' ? 'info' : 'atencion'}>{dia.nota}</Aviso>}
        {!dia && <p className="text-sm text-zinc-500">No hay datos de este día. Puedes apuntarlos a mano.</p>}

        <div className="grid grid-cols-3 gap-2">
          <label>
            <span className="mb-1 block text-xs font-medium text-zinc-600">Salida</span>
            <input className={`${campo} text-center`} inputMode="numeric" value={salida} onChange={(ev) => setSalida(ev.target.value)} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold text-zinc-900">Entregados</span>
            <input
              className={`${campo} text-center text-lg font-bold ring-2 ring-zinc-900`}
              inputMode="numeric"
              value={entregados}
              onChange={(ev) => setEntregados(ev.target.value)}
              autoFocus={!dia}
            />
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-600">Incidencias</span>
            <div className="flex h-[50px] items-center justify-center rounded-xl bg-zinc-100 text-base tabular-nums text-zinc-600">{inc ?? '—'}</div>
          </div>
        </div>
        {e !== null && s !== null && e > s && <p className="text-xs text-red-700">Hay más entregados que salida.</p>}
        {error && <Aviso tipo="error">{error}</Aviso>}

        <div className="grid grid-cols-2 gap-2">
          <Boton variante="secundario" onClick={cerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} cargando={ocupado}>
            Guardar
          </Boton>
        </div>
        {dia && !dia.editadoManual && <p className="text-center text-[11px] text-zinc-400">Si lo corriges, la IA ya no cambiará este día.</p>}
      </div>
    </div>
  )
}

function Tabla({ datos, reps, dias, porDia, abrir }: { datos: ResumenMes; reps: Rep[]; dias: string[]; porDia: Map<string, Map<number, DiaMes>>; abrir: (s: Seleccion) => void }) {
  const [notaAbierta, setNotaAbierta] = useState<string | null>(null)
  const editable = datos.estado !== 'cerrado'
  const [, mm] = datos.mes.split('-')
  const mesCorto = nombreMes(datos.mes).slice(0, 3)
  const totalPago = reps.reduce((t, r) => t + r.pagoCentimos, 0)

  const thBase = 'sticky top-0 z-20 border-b border-zinc-200 bg-zinc-900 px-2 py-2.5 text-xs font-semibold text-white'
  const celdaDia = 'sticky left-0 z-10 border-b border-r border-zinc-200 bg-white px-2 py-1.5'

  return (
    <div className="max-h-[calc(100dvh-19rem)] min-h-80 overflow-auto overscroll-contain rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 sm:max-h-[75vh]">
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className={`${thBase} left-0 z-30 w-14 text-left capitalize`}>
              {mesCorto}
              <span className="block text-[10px] font-normal text-zinc-400">{datos.mes.slice(0, 4)}</span>
            </th>
            {reps.map((r) => (
              <th key={r.id} className={`${thBase} w-[5.25rem] max-w-[5.25rem] text-center text-[13px]`} title={r.nombre}>
                <span className="line-clamp-2 break-words leading-tight">{r.nombre}</span>
              </th>
            ))}
            <th className={`${thBase} w-64 min-w-64 max-w-64 text-left sm:w-96 sm:min-w-96 sm:max-w-96`}>Notas</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((f) => {
            const sabado = new Date(f + 'T12:00:00Z').getUTCDay() === 6
            const notas = notasDelDia(f, reps, porDia)
            const abierta = notaAbierta === f
            const ds = diaSemana(f).split(' ')
            return (
              <tr key={f} className={sabado ? '[&>td]:border-b-zinc-300' : ''}>
                <td className={`${celdaDia} ${sabado ? 'border-b-zinc-300' : ''}`}>
                  <span className="mr-1 text-[11px] font-medium text-zinc-400">{NOMBRE_DIA[ds[0]] ?? ds[0]}</span>
                  <span className="font-semibold tabular-nums">{ds[1]}</span>
                  <span className="sr-only">/{mm}</span>
                </td>
                {reps.map((r) => {
                  const d = porDia.get(f)?.get(r.id) ?? null
                  return (
                    <td key={r.id} className="h-px border-b border-r border-zinc-100 p-0 text-center">
                      <button
                        className={`relative flex h-full min-h-12 w-full items-center justify-center tabular-nums transition ${d ? fondoCelda[d.estado] : 'hover:bg-zinc-50'} ${editable ? '' : 'cursor-default'}`}
                        onClick={() => (editable || d) && abrir({ rep: r, fecha: f, dia: d })}
                        aria-label={`${r.nombre} ${diaSemana(f)}: ${d?.entregados ?? 'sin datos'}`}
                      >
                        {d ? (
                          <span className={`text-[17px] font-bold ${d.entregados === null ? 'text-amber-700' : ''}`}>{d.entregados ?? '?'}</span>
                        ) : (
                          <span className="text-zinc-300">·</span>
                        )}
                        {d?.editadoManual && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-zinc-400" />}
                      </button>
                    </td>
                  )
                })}
                <td className="w-64 min-w-64 max-w-64 whitespace-normal border-b border-zinc-100 px-2 py-1.5 align-middle sm:w-96 sm:min-w-96 sm:max-w-96">
                  {notas.length > 0 && (
                    <button className="block w-full text-left" onClick={() => setNotaAbierta(abierta ? null : f)}>
                      <span className={`text-xs leading-snug text-zinc-600 ${abierta ? 'block' : 'line-clamp-2'}`}>
                        {notas.map((n, i) => (
                          <span key={i} className="mr-2">
                            {reps.length > 1 && <b className="text-zinc-900">{n.nombre}: </b>}
                            {n.mensaje && <span className="italic">“{n.mensaje}”</span>}
                            {n.nota && <span className="text-amber-800"> {n.nota}</span>}
                          </span>
                        ))}
                      </span>
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot className="text-xs">
          {[
            { t: 'Salida', v: (r: Rep) => r.totales.salida },
            { t: 'Incid.', v: (r: Rep) => r.totales.incidencias },
            { t: 'Días', v: (r: Rep) => r.totales.diasTrabajados },
            { t: '€/paq.', v: (r: Rep) => (r.precioCentimos ? euros(r.precioCentimos) : '—') },
          ].map((fila) => (
            <tr key={fila.t} className="bg-zinc-50">
              <td className={`${celdaDia} bg-zinc-50 font-semibold`}>{fila.t}</td>
              {reps.map((r) => (
                <td key={r.id} className="border-b border-r border-zinc-200 px-1 py-2 text-center tabular-nums text-zinc-600">
                  {fila.v(r)}
                </td>
              ))}
              <td className="border-b border-zinc-200" />
            </tr>
          ))}
          {/* Fila fija abajo: siempre se ven los entregados y lo que hay que pagar a cada uno */}
          <tr className="[&>td]:sticky [&>td]:bottom-0 [&>td]:z-10 [&>td]:border-t [&>td]:border-lime-300 [&>td]:bg-lime-50">
            <td className="left-0 !z-20 border-r border-lime-200 px-2 py-1.5 font-semibold leading-tight text-lime-900">
              Total
              <span className="block text-[10px] font-normal">a pagar</span>
            </td>
            {reps.map((r) => (
              <td key={r.id} className="border-r border-lime-200 px-1 py-1.5 text-center leading-tight tabular-nums text-lime-950">
                <span className="block text-sm font-bold">{r.totales.entregados}</span>
                <span className="block text-[11px] font-semibold">{r.precioCentimos ? euros(r.pagoCentimos) : '—'}</span>
              </td>
            ))}
            <td className="px-2 py-1.5 text-right leading-tight text-lime-950">
              <span className="block text-sm font-bold">{reps.reduce((t, r) => t + r.totales.entregados, 0)} entregados</span>
              <span className="block text-xs font-semibold">{euros(totalPago)}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const hoyIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })

/** Hoja con todos los repartidores de un día (vista "Todos"). */
function DiaTodos({
  fecha,
  reps,
  porDia,
  editable,
  cerrar,
  abrir,
}: {
  fecha: string
  reps: Rep[]
  porDia: Map<string, Map<number, DiaMes>>
  editable: boolean
  cerrar: () => void
  abrir: (s: Seleccion) => void
}) {
  const [a, m, d] = fecha.split('-')
  const total = reps.reduce((t, r) => t + (porDia.get(fecha)?.get(r.id)?.entregados ?? 0), 0)
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={cerrar}>
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold capitalize">{diaSemana(fecha)}</h2>
            <p className="text-sm text-zinc-500">
              {d}/{m}/{a} · {total} entregados
            </p>
          </div>
          <button onClick={cerrar} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <ul className="divide-y divide-zinc-100">
          {reps.map((r) => {
            const dia = porDia.get(fecha)?.get(r.id) ?? null
            return (
              <li key={r.id}>
                <button
                  className="flex w-full items-center gap-3 py-3 text-left"
                  onClick={() => {
                    if (!editable && !dia) return
                    cerrar()
                    abrir({ rep: r, fecha, dia })
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.nombre}</span>
                    {dia?.mensajeOriginal && <span className="block truncate text-xs italic text-zinc-500">“{dia.mensajeOriginal}”</span>}
                  </span>
                  <span
                    className={`grid h-11 min-w-14 place-items-center rounded-xl px-2 text-lg font-bold tabular-nums ${
                      !dia ? 'bg-zinc-100 text-zinc-300' : dia.estado === 'error' ? 'bg-red-100' : dia.estado === 'dudoso' ? 'bg-amber-100' : 'bg-zinc-100'
                    }`}
                  >
                    {dia ? (dia.entregados ?? '?') : '·'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/** Vista calendario (pensada para el móvil): un repartidor o todos, el mes en cuadrícula. */
function Calendario({
  datos,
  reps,
  porDia,
  abrir,
}: {
  datos: ResumenMes
  reps: Rep[]
  porDia: Map<string, Map<number, DiaMes>>
  abrir: (s: Seleccion) => void
}) {
  const [elegido, setElegido] = useState<number | 'todos'>(() => (reps.length === 1 ? reps[0].id : 'todos'))
  const [diaTodos, setDiaTodos] = useState<string | null>(null)
  const editable = datos.estado !== 'cerrado'
  const rep = elegido === 'todos' ? null : (reps.find((r) => r.id === elegido) ?? null)
  const visibles = rep ? [rep] : reps
  const hoy = hoyIso()

  useEffect(() => {
    if (elegido !== 'todos' && !reps.some((r) => r.id === elegido)) setElegido('todos')
  }, [reps, elegido])

  // Cuadrícula L–S (y domingo solo si alguien trabajó algún domingo).
  const [a, m] = datos.mes.split('-').map(Number)
  const conDomingo = visibles.some((r) => r.dias.some((d) => new Date(d.fecha + 'T12:00:00Z').getUTCDay() === 0))
  const columnas = conDomingo ? 7 : 6
  const celdas: (string | null)[] = []
  const primero = new Date(Date.UTC(a, m - 1, 1))
  const desfase = (primero.getUTCDay() + 6) % 7 // lunes = 0
  for (let i = 0; i < desfase && i < columnas; i++) celdas.push(null)
  for (let d = 1; d <= 31; d++) {
    const f = new Date(Date.UTC(a, m - 1, d))
    if (f.getUTCMonth() !== m - 1) break
    if (!conDomingo && f.getUTCDay() === 0) continue
    celdas.push(f.toISOString().slice(0, 10))
  }
  while (celdas.length % columnas) celdas.push(null)

  const valor = (f: string) => {
    if (rep) return porDia.get(f)?.get(rep.id) ?? null
    const ds = reps.map((r) => porDia.get(f)?.get(r.id)).filter((x): x is DiaMes => Boolean(x))
    if (!ds.length) return null
    const estado: DiaMes['estado'] = ds.some((x) => x.estado === 'error') ? 'error' : ds.some((x) => x.estado === 'dudoso') ? 'dudoso' : 'ok'
    return { entregados: ds.reduce((t, x) => t + (x.entregados ?? 0), 0), estado, editadoManual: false } as Pick<DiaMes, 'entregados' | 'estado' | 'editadoManual'>
  }

  const tot = {
    entregados: visibles.reduce((t, r) => t + r.totales.entregados, 0),
    salida: visibles.reduce((t, r) => t + r.totales.salida, 0),
    incidencias: visibles.reduce((t, r) => t + r.totales.incidencias, 0),
    dias: visibles.reduce((t, r) => t + r.totales.diasTrabajados, 0),
    pago: visibles.reduce((t, r) => t + r.pagoCentimos, 0),
  }

  const notas = visibles
    .flatMap((r) => r.dias.filter((d) => d.mensajeOriginal || d.nota || d.estado !== 'ok').map((d) => ({ r, d })))
    .sort((x, y) => x.d.fecha.localeCompare(y.d.fecha))

  return (
    <div className="space-y-3">
      {/* Selector de repartidor, como las pestañas de una agenda */}
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
        {reps.length > 1 && (
          <button
            onClick={() => setElegido('todos')}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${elegido === 'todos' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-300'}`}
          >
            Todos
          </button>
        )}
        {reps.map((r) => (
          <button
            key={r.id}
            onClick={() => setElegido(r.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${elegido === r.id ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 ring-1 ring-zinc-300'}`}
          >
            {r.nombre}
            {r.totales.dudosos + r.totales.errores > 0 && <span className="ml-1.5 inline-block size-2 rounded-full bg-amber-400 align-middle" />}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-2 shadow-sm ring-1 ring-zinc-200 sm:p-3">
        <div className="mb-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
          {SEMANA.slice(0, columnas).map((d) => (
            <div key={d} className="py-1 text-center text-xs font-semibold text-zinc-400">
              {d}
            </div>
          ))}
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
          {celdas.map((f, i) => {
            if (!f) return <div key={`v${i}`} />
            const v = valor(f)
            const esHoy = f === hoy
            const futuro = f > hoy
            const fondo = !v
              ? futuro
                ? 'bg-transparent ring-1 ring-dashed ring-zinc-200'
                : 'bg-zinc-50 ring-1 ring-zinc-200'
              : v.estado === 'error'
                ? 'bg-red-100 ring-1 ring-red-300'
                : v.estado === 'dudoso'
                  ? 'bg-amber-100 ring-1 ring-amber-300'
                  : 'bg-zinc-900 text-white'
            return (
              <button
                key={f}
                onClick={() => {
                  if (rep) {
                    if (editable || v) abrir({ rep, fecha: f, dia: (v as DiaMes | null) ?? null })
                  } else setDiaTodos(f)
                }}
                className={`relative flex aspect-[4/5] flex-col items-center justify-center rounded-xl transition active:scale-95 ${fondo} ${esHoy ? 'outline outline-2 outline-offset-1 outline-marca-osc' : ''}`}
                aria-label={`${diaSemana(f)}: ${v ? (v.entregados ?? 'sin entregados') : 'sin datos'}`}
              >
                <span className={`absolute left-1.5 top-1 text-[11px] font-medium ${v && v.estado === 'ok' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {Number(f.slice(8))}
                </span>
                <span className={`mt-2 text-xl font-bold tabular-nums ${v ? (v.estado === 'ok' ? 'text-marca' : 'text-zinc-900') : 'text-zinc-300'}`}>
                  {v ? (v.entregados ?? '?') : futuro ? '' : '·'}
                </span>
                {rep && v?.editadoManual && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-zinc-400" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Totales de lo seleccionado */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{rep ? rep.nombre : 'Todos'}</span>
          <span className="text-xs text-zinc-500">{pl(tot.dias, 'día trabajado', 'días trabajados')}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-zinc-100 py-2">
            <div className="text-lg font-bold tabular-nums">{tot.salida}</div>
            <div className="text-[11px] text-zinc-500">salida</div>
          </div>
          <div className="rounded-xl bg-zinc-900 py-2 text-white">
            <div className="text-lg font-bold tabular-nums text-marca">{tot.entregados}</div>
            <div className="text-[11px] text-zinc-400">entregados</div>
          </div>
          <div className="rounded-xl bg-zinc-100 py-2">
            <div className="text-lg font-bold tabular-nums">{tot.incidencias}</div>
            <div className="text-[11px] text-zinc-500">incidencias</div>
          </div>
        </div>
        <div className="mt-2 flex items-baseline justify-between rounded-xl bg-lime-50 px-3 py-2.5 ring-1 ring-lime-200">
          <span className="text-sm text-lime-900">
            A pagar{rep && rep.precioCentimos > 0 && <> · {euros(rep.precioCentimos)}/paquete</>}
          </span>
          <span className="text-xl font-bold tabular-nums text-lime-950">{euros(tot.pago)}</span>
        </div>
      </div>

      {/* Notas en forma de agenda */}
      {notas.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
          <h3 className="border-b border-zinc-100 px-4 py-2.5 text-sm font-semibold">Notas</h3>
          <ul className="divide-y divide-zinc-100">
            {notas.map(({ r, d }) => (
              <li key={`${r.id}-${d.fecha}`}>
                <button className="flex w-full gap-3 px-4 py-3 text-left" onClick={() => abrir({ rep: r, fecha: d.fecha, dia: d })}>
                  <span className="w-12 shrink-0 text-sm font-semibold capitalize leading-tight">
                    {diaSemana(d.fecha).split(' ')[0]}
                    <span className="block text-lg">{Number(d.fecha.slice(8))}</span>
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    {!rep && <span className="block font-semibold">{r.nombre}</span>}
                    {d.mensajeOriginal && <span className="block italic text-zinc-600">“{d.mensajeOriginal}”</span>}
                    {d.nota && <span className={`block ${d.estado === 'ok' ? 'text-zinc-500' : 'text-amber-800'}`}>{d.nota}</span>}
                  </span>
                  <span
                    className={`grid h-9 min-w-11 shrink-0 place-items-center self-center rounded-lg px-2 font-bold tabular-nums ${
                      d.estado === 'error' ? 'bg-red-100' : d.estado === 'dudoso' ? 'bg-amber-100' : 'bg-zinc-100'
                    }`}
                  >
                    {d.entregados ?? '?'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {diaTodos && (
        <DiaTodos fecha={diaTodos} reps={reps} porDia={porDia} editable={editable} cerrar={() => setDiaTodos(null)} abrir={abrir} />
      )}
    </div>
  )
}

const leerVista = (): 'calendario' | 'tabla' => {
  try {
    const v = localStorage.getItem('vistaResumen')
    if (v === 'calendario' || v === 'tabla') return v
  } catch {
    /* sin almacenamiento */
  }
  return window.matchMedia('(min-width: 768px)').matches ? 'tabla' : 'calendario'
}

export default function Resumen() {
  const { yo } = useSesion()
  const [params, setParams] = useSearchParams()
  const [meses, setMeses] = useState<string[] | null>(null)
  const [datos, setDatos] = useState<ResumenMes | null>(null)
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [avisoIa, setAvisoIa] = useState<string[]>([])
  const [sel, setSel] = useState<Seleccion | null>(null)
  const [vista, setVistaEstado] = useState(leerVista)
  const setVista = (v: 'calendario' | 'tabla') => {
    setVistaEstado(v)
    try {
      localStorage.setItem('vistaResumen', v)
    } catch {
      /* sin almacenamiento */
    }
  }

  const mes = params.get('mes') ?? meses?.[0] ?? null

  useEffect(() => {
    api
      .meses()
      .then((r) => setMeses(r.meses.map((m) => m.mes)))
      .catch((e) => setError(e.message))
  }, [])

  const cargar = useCallback(() => {
    if (!mes) return
    api
      .mes(mes)
      .then(setDatos)
      .catch((e) => setError(e.message))
  }, [mes])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Se ven los marcados para el resumen; los dados de baja solo si trabajaron ese mes.
  const reps = useMemo(
    () => datos?.repartidores.filter((r) => r.mostrarEnResumen && (r.activo || r.dias.length > 0)) ?? [],
    [datos],
  )
  const ocultos = (datos?.repartidores.length ?? 0) - reps.length
  const porDia = useMemo(() => {
    const m = new Map<string, Map<number, DiaMes>>()
    for (const r of reps) for (const d of r.dias) {
      if (!m.has(d.fecha)) m.set(d.fecha, new Map())
      m.get(d.fecha)!.set(r.id, d)
    }
    return m
  }, [reps])
  const dias = useMemo(() => (datos ? diasDelMes(datos.mes, new Set(porDia.keys())) : []), [datos, porDia])

  const total = reps.reduce((t, r) => t + r.totales.entregados, 0)
  const pago = reps.reduce((t, r) => t + r.pagoCentimos, 0)
  const revisar = reps.reduce((t, r) => t + r.totales.dudosos + r.totales.errores, 0)
  const sinProcesar = reps.some((r) => r.mensajes > 0 && r.dias.length === 0)

  async function leerConIa() {
    if (!mes) return
    setProcesando(true)
    setError('')
    setAvisoIa([])
    try {
      const r = await api.procesar(mes)
      setAvisoIa(r.errores.map((e) => `${e.repartidor}: ${e.error}`))
      cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setProcesando(false)
    }
  }

  async function pdf() {
    if (!datos) return
    setGenerandoPdf(true)
    try {
      const { descargarPdf } = await import('../pdf')
      await descargarPdf({
        empresa: yo?.empresa?.nombre ?? '',
        datos,
        repartidores: reps,
        dias,
        notasDe: (f) =>
          notasDelDia(f, reps, porDia)
            .map((n) => `${reps.length > 1 ? n.nombre + ': ' : ''}${n.mensaje ? `“${n.mensaje}”` : ''}${n.nota ? ` ${n.nota}` : ''}`)
            .join('  ·  '),
      })
    } catch (e) {
      setError('No se pudo generar el PDF: ' + (e as Error).message)
    } finally {
      setGenerandoPdf(false)
    }
  }

  if (meses && meses.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Resumen</h1>
        <Tarjeta className="space-y-3 text-center">
          <p className="text-sm text-zinc-600">Todavía no hay mensajes. Sube los chats de tus repartidores.</p>
          <Link to="/" className={claseBoton()}>
            Subir chats
          </Link>
        </Tarjeta>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Resumen</h1>
        <div className="flex items-center gap-2">
          {meses && mes && (
            <select
              className={`${campo} !w-auto !py-2 text-sm capitalize`}
              value={mes}
              onChange={(e) => {
                setDatos(null)
                setParams({ mes: e.target.value })
              }}
              aria-label="Mes"
            >
              {meses.map((m) => (
                <option key={m} value={m} className="capitalize">
                  {nombreMes(m)}
                </option>
              ))}
            </select>
          )}
          <Boton variante="secundario" className="!px-3" onClick={pdf} cargando={generandoPdf} disabled={!datos || reps.length === 0} aria-label="Descargar PDF">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v12m0 0-5-5m5 5 5-5M5 20h14" />
            </svg>
            PDF
          </Boton>
        </div>
      </div>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {avisoIa.map((a) => (
        <Aviso key={a} tipo="atencion">
          {a}
        </Aviso>
      ))}
      {!datos && !error && <p className="text-sm text-zinc-500">Cargando…</p>}

      {datos && (
        <>
          <div className="grid grid-cols-2 rounded-xl bg-zinc-200/70 p-1 text-sm font-semibold" role="tablist" aria-label="Vista">
            {(['calendario', 'tabla'] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={vista === v}
                onClick={() => setVista(v)}
                className={`rounded-lg py-2 transition ${vista === v ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}
              >
                {v === 'calendario' ? 'Calendario' : 'Tabla completa'}
              </button>
            ))}
          </div>

          {vista === 'tabla' && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-zinc-900 px-4 py-3 text-white">
              <div className="text-2xl font-bold tabular-nums text-marca">{total.toLocaleString('es-ES')}</div>
              <div className="text-xs text-zinc-400">entregados · {pl(reps.length, 'repartidor', 'repartidores')}</div>
            </div>
            <div className="rounded-2xl bg-lime-50 px-4 py-3 ring-1 ring-lime-200">
              <div className="text-2xl font-bold tabular-nums text-lime-950">{datos.precioCentimos || reps.some((r) => r.precioPropio) ? euros(pago) : '— €'}</div>
              <div className="text-xs text-lime-800">a pagar en total</div>
            </div>
          </div>
          )}

          {datos.precioCentimos === 0 && !reps.some((r) => r.precioPropio) && (
            <Aviso tipo="atencion">
              Pon el precio por paquete entregado en{' '}
              <Link to="/configuracion" className="font-semibold underline">
                Configuración
              </Link>{' '}
              para calcular lo que hay que pagar.
            </Aviso>
          )}

          {reps.length === 0 ? (
            <Tarjeta className="text-center text-sm text-zinc-600">
              No hay repartidores para mostrar.{' '}
              <Link to="/configuracion" className="font-semibold underline">
                Elige cuáles ver en Configuración
              </Link>
              .
            </Tarjeta>
          ) : (
            vista === 'calendario' ? (
              <Calendario datos={datos} reps={reps} porDia={porDia} abrir={setSel} />
            ) : (
              <Tabla datos={datos} reps={reps} dias={dias} porDia={porDia} abrir={setSel} />
            )
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="size-3 rounded bg-amber-100 ring-1 ring-amber-200" /> revisar
            </span>
            <span className="flex items-center gap-1">
              <span className="size-3 rounded bg-red-100 ring-1 ring-red-200" /> error (no suma)
            </span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-zinc-400" /> corregido a mano
            </span>
            <span>Toca un día para ver o corregir.</span>
          </div>

          {revisar > 0 && <Aviso tipo="atencion">{pl(revisar, 'casilla marcada', 'casillas marcadas')} para revisar.</Aviso>}
          {ocultos > 0 && (
            <p className="text-xs text-zinc-500">
              {pl(ocultos, 'repartidor oculto', 'repartidores ocultos')} en este mes.{' '}
              <Link to="/configuracion" className="underline">
                Cambiar en Configuración
              </Link>
            </p>
          )}

          {datos.estado !== 'cerrado' && datos.iaDisponible && (
            <Boton variante={sinProcesar ? 'principal' : 'secundario'} className="w-full" cargando={procesando} onClick={leerConIa}>
              {procesando ? 'La IA está leyendo los mensajes…' : sinProcesar ? 'Leer con IA' : 'Volver a leer con IA'}
            </Boton>
          )}
          {datos.procesado && (
            <p className="text-center text-[11px] text-zinc-400">
              Leído por la IA el {new Date(datos.procesado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}. Lo corregido a mano no se toca.
            </p>
          )}
          {!datos.iaDisponible && <Aviso tipo="atencion">La IA aún no está configurada en el servidor.</Aviso>}
        </>
      )}

      {sel && <Detalle key={`${sel.rep.id}-${sel.fecha}`} sel={sel} cerrar={() => setSel(null)} alGuardar={cargar} />}
    </div>
  )
}
