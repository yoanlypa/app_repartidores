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
              <th key={r.id} className={`${thBase} w-[4.75rem] max-w-[4.75rem] text-center`} title={r.nombre}>
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
                        className={`relative flex h-full min-h-11 w-full items-center justify-center tabular-nums transition ${d ? fondoCelda[d.estado] : 'hover:bg-zinc-50'} ${editable ? '' : 'cursor-default'}`}
                        onClick={() => (editable || d) && abrir({ rep: r, fecha: f, dia: d })}
                        aria-label={`${r.nombre} ${diaSemana(f)}: ${d?.entregados ?? 'sin datos'}`}
                      >
                        {d ? (
                          <span className={`text-[15px] font-bold ${d.entregados === null ? 'text-amber-700' : ''}`}>{d.entregados ?? '?'}</span>
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

  const reps = useMemo(() => datos?.repartidores.filter((r) => r.mostrarEnResumen) ?? [], [datos])
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
            <Tabla datos={datos} reps={reps} dias={dias} porDia={porDia} abrir={setSel} />
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
            <span>Toca una casilla para ver o corregir.</span>
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
