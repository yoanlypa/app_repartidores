import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, diaSemana, nombreMes, type DiaMes, type ResumenMes } from '../api'
import { Aviso, Boton, campo, claseBoton, Tarjeta } from '../ui'

type FilaRepartidor = ResumenMes['repartidores'][number]

const colorEstado: Record<DiaMes['estado'], string> = {
  ok: '',
  dudoso: 'bg-amber-50',
  error: 'bg-red-50',
}

const etiquetaEstado: Record<DiaMes['estado'], { texto: string; clase: string } | null> = {
  ok: null,
  dudoso: { texto: 'Revisar', clase: 'bg-amber-100 text-amber-800' },
  error: { texto: 'Error', clase: 'bg-red-100 text-red-800' },
}

const pl = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`

const n = (x: number | null) => (x === null ? '—' : x.toLocaleString('es-ES'))

function Cifra({ valor, texto, destacado }: { valor: number; texto: string; destacado?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${destacado ? 'bg-zinc-900 text-white' : 'bg-zinc-100'}`}>
      <div className={`text-lg font-bold tabular-nums ${destacado ? 'text-marca' : ''}`}>{valor.toLocaleString('es-ES')}</div>
      <div className={`text-[11px] ${destacado ? 'text-zinc-400' : 'text-zinc-500'}`}>{texto}</div>
    </div>
  )
}

function Dia({ d, editable, alCambiar }: { d: DiaMes; editable: boolean; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [salida, setSalida] = useState(d.salida?.toString() ?? '')
  const [vuelta, setVuelta] = useState(d.vuelta?.toString() ?? '')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const et = etiquetaEstado[d.estado]

  async function guardar() {
    const s = salida.trim() === '' ? null : Number(salida)
    const v = vuelta.trim() === '' ? null : Number(vuelta)
    if ((s !== null && !Number.isInteger(s)) || (v !== null && !Number.isInteger(v))) {
      setError('Escribe números enteros.')
      return
    }
    setOcupado(true)
    setError('')
    try {
      await api.corregirDia(d.id, s, v)
      setEditando(false)
      alCambiar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <li className={`px-3 py-2.5 ${colorEstado[d.estado]}`}>
      <div className="grid grid-cols-[4.5rem_1fr_1fr_1fr] items-center gap-2 text-sm">
        <span className="font-medium text-zinc-700">{diaSemana(d.fecha)}</span>
        {editando ? (
          <>
            <input className={`${campo} !py-1.5 text-right`} inputMode="numeric" value={salida} onChange={(e) => setSalida(e.target.value)} aria-label="Salida" />
            <input className={`${campo} !py-1.5 text-right`} inputMode="numeric" value={vuelta} onChange={(e) => setVuelta(e.target.value)} aria-label="Vuelta" />
            <span />
          </>
        ) : (
          <>
            <span className="text-right tabular-nums">{n(d.salida)}</span>
            <span className="text-right tabular-nums">{n(d.vuelta)}</span>
            <span className="text-right font-semibold tabular-nums">{n(d.entregados)}</span>
          </>
        )}
      </div>

      {(d.mensajeOriginal || d.nota || et || d.editadoManual) && !editando && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[4.5rem] text-xs text-zinc-500">
          {et && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${et.clase}`}>{et.texto}</span>}
          {d.editadoManual && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">Corregido</span>}
          {d.mensajeOriginal && <span className="italic">“{d.mensajeOriginal}”</span>}
          {d.nota && <span className="w-full text-zinc-600">{d.nota}</span>}
        </div>
      )}

      {editable && (
        <div className="mt-1.5 flex justify-end gap-2 pl-[4.5rem]">
          {editando ? (
            <>
              <Boton variante="fantasma" className="!min-h-8 !px-2 text-xs" onClick={() => setEditando(false)}>
                Cancelar
              </Boton>
              <Boton className="!min-h-8 !px-3 text-xs" cargando={ocupado} onClick={guardar}>
                Guardar
              </Boton>
            </>
          ) : (
            (d.estado !== 'ok' || d.editadoManual) && (
              <button className="text-xs font-medium text-zinc-600 underline underline-offset-2" onClick={() => setEditando(true)}>
                Corregir
              </button>
            )
          )}
        </div>
      )}
      {error && <p className="mt-1 pl-[4.5rem] text-xs text-red-700">{error}</p>}
    </li>
  )
}

function TarjetaRepartidor({ r, editable, alCambiar }: { r: FilaRepartidor; editable: boolean; alCambiar: () => void }) {
  const avisos = r.totales.dudosos + r.totales.errores
  const [abierto, setAbierto] = useState(false)

  return (
    <Tarjeta className="!p-0 overflow-hidden">
      <button className="w-full p-4 text-left sm:p-5" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{r.nombre}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {pl(r.totales.diasTrabajados, 'día trabajado', 'días trabajados')}
              {r.diasSinReporte.length > 0 && <> · {r.diasSinReporte.length} sin reporte</>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {avisos > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                {avisos} por revisar
              </span>
            )}
            <svg viewBox="0 0 24 24" className={`size-5 text-zinc-400 transition ${abierto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Cifra valor={r.totales.salida} texto="salieron" />
          <Cifra valor={r.totales.vuelta} texto="volvieron" />
          <Cifra valor={r.totales.entregados} texto="entregados" destacado />
        </div>
      </button>

      {abierto && (
        <div className="border-t border-zinc-200">
          {r.dias.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">
              No hay días con datos. {r.mensajes > 0 && 'Pulsa "Leer con IA" para procesar sus mensajes.'}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-[4.5rem_1fr_1fr_1fr] gap-2 bg-zinc-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                <span>Día</span>
                <span className="text-right">Salida</span>
                <span className="text-right">Vuelta</span>
                <span className="text-right">Entreg.</span>
              </div>
              <ul className="divide-y divide-zinc-100">
                {r.dias.map((d) => (
                  <Dia key={d.id} d={d} editable={editable} alCambiar={alCambiar} />
                ))}
              </ul>
            </>
          )}
          {r.diasSinReporte.length > 0 && (
            <p className="border-t border-zinc-100 px-3 py-2.5 text-xs text-zinc-500">
              Sin reporte: {r.diasSinReporte.map(diaSemana).join(', ')}
            </p>
          )}
        </div>
      )}
    </Tarjeta>
  )
}

export default function Resumen() {
  const [params, setParams] = useSearchParams()
  const [meses, setMeses] = useState<string[] | null>(null)
  const [datos, setDatos] = useState<ResumenMes | null>(null)
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [avisoIa, setAvisoIa] = useState<string[]>([])

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

  const abierto = datos?.estado !== 'cerrado'
  const sinProcesar = datos && datos.repartidores.some((r) => r.mensajes > 0 && r.dias.length === 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Resumen</h1>
          {datos?.procesado && (
            <p className="mt-1 text-xs text-zinc-500">
              Leído por la IA el {new Date(datos.procesado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
          )}
        </div>
        {meses && mes && (
          <select
            className={`${campo} !w-auto capitalize`}
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
          <Tarjeta className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium capitalize text-zinc-600">{nombreMes(datos.mes)}</span>
              <span className="text-xs text-zinc-500">{pl(datos.repartidores.length, 'repartidor', 'repartidores')}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Cifra valor={datos.totales.salida} texto="salieron" />
              <Cifra valor={datos.totales.vuelta} texto="volvieron" />
              <Cifra valor={datos.totales.entregados} texto="entregados" destacado />
            </div>
            {datos.totales.dudosos + datos.totales.errores > 0 && (
              <p className="text-xs text-amber-800">
                {pl(datos.totales.dudosos + datos.totales.errores, 'día marcado', 'días marcados')} para revisar. Ábrelos y pulsa “Corregir” si hace falta.
              </p>
            )}
            {abierto && datos.iaDisponible && (
              <Boton variante={sinProcesar ? 'principal' : 'secundario'} className="w-full" cargando={procesando} onClick={leerConIa}>
                {procesando ? 'La IA está leyendo los mensajes…' : sinProcesar ? 'Leer con IA' : 'Volver a leer con IA'}
              </Boton>
            )}
            {!datos.iaDisponible && <Aviso tipo="atencion">La IA aún no está configurada en el servidor.</Aviso>}
          </Tarjeta>

          {datos.repartidores.map((r) => (
            <TarjetaRepartidor key={r.id} r={r} editable={abierto} alCambiar={cargar} />
          ))}
        </>
      )}
    </div>
  )
}
