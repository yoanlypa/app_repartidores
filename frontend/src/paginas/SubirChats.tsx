import { useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, fechaCorta, nombreMes, type Analisis, type Decision, type Detectado, type ResultadoImportacion } from '../api'
import { useSesion } from '../sesion'
import { Aviso, Boton, campo, claseBoton, Tarjeta } from '../ui'

const MAX_MESES_AUTO = 3

type Eleccion = { accion: 'crear'; nombre: string } | { accion: 'unir'; repartidorId: number } | { accion: 'descartar' }

const eleccionInicial = (d: Detectado): Eleccion =>
  d.coincidencia ? { accion: 'unir', repartidorId: d.coincidencia.id } : { accion: 'crear', nombre: d.nombre }

function ComoExportar() {
  return (
    <details className="group rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-700">
      <summary className="cursor-pointer font-medium text-zinc-900">¿Cómo saco los chats de WhatsApp?</summary>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5">
        <li>Abre el chat del repartidor en WhatsApp.</li>
        <li>
          Toca los <b>tres puntos</b> (Android) o el <b>nombre del contacto</b> (iPhone).
        </li>
        <li>
          Elige <b>Más → Exportar chat</b> y luego <b>Sin archivos</b>.
        </li>
        <li>Guárdalo en tu móvil (Archivos / Descargas) y súbelo aquí.</li>
      </ol>
      <p className="mt-2 text-zinc-500">Puedes subir varios chats a la vez, también chats de grupo.</p>
    </details>
  )
}

export default function SubirChats() {
  const { recargar } = useSesion()
  const navegar = useNavigate()
  const [leyendo, setLeyendo] = useState<string | null>(null)
  const [cambiandoDueno, setCambiandoDueno] = useState(false)
  const [erroresIa, setErroresIa] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const [archivos, setArchivos] = useState<File[]>([])
  const [arrastrando, setArrastrando] = useState(false)
  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [elecciones, setElecciones] = useState<Record<string, Eleccion>>({})
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  function anadir(lista: FileList | null) {
    if (!lista) return
    const nuevos = [...lista].filter((f) => /\.(txt|zip)$/i.test(f.name))
    setArchivos((prev) => {
      const nombres = new Set(prev.map((f) => f.name + f.size))
      return [...prev, ...nuevos.filter((f) => !nombres.has(f.name + f.size))]
    })
    if (nuevos.length < lista.length) setError('Solo se aceptan archivos .txt o .zip exportados de WhatsApp.')
    else setError('')
  }

  function soltar(e: DragEvent) {
    e.preventDefault()
    setArrastrando(false)
    anadir(e.dataTransfer.files)
  }

  async function analizar(dueno?: string) {
    setError('')
    setOcupado(true)
    try {
      if (analisis) await api.cancelar(analisis.importacionId).catch(() => {})
      const a = await api.analizar(archivos, dueno)
      setAnalisis(a)
      setElecciones(Object.fromEntries(a.detectados.map((d) => [d.clave, eleccionInicial(d)])))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function confirmar() {
    if (!analisis) return
    setError('')
    setOcupado(true)
    try {
      const decisiones: Decision[] = analisis.detectados.map((d) => {
        const e = elecciones[d.clave]
        if (e.accion === 'crear') return { clave: d.clave, accion: 'crear', nombre: e.nombre.trim() || d.nombre }
        if (e.accion === 'unir') return { clave: d.clave, accion: 'unir', repartidorId: e.repartidorId }
        return { clave: d.clave, accion: 'descartar' }
      })
      const res = await api.confirmar(analisis.importacionId, decisiones)
      setResultado(res)
      recargar()
      await leerConIa(res.mesesAfectados)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  /** La IA lee los meses con mensajes nuevos (como mucho los 3 más recientes) y vamos al resumen. */
  async function leerConIa(mesesAfectados: string[]) {
    const meses = mesesAfectados.slice(0, MAX_MESES_AUTO)
    if (meses.length === 0) return
    const fallos: string[] = []
    for (const mes of meses) {
      setLeyendo(nombreMes(mes))
      try {
        const r = await api.procesar(mes)
        fallos.push(...r.errores.map((e) => `${e.repartidor}: ${e.error}`))
      } catch (e) {
        fallos.push((e as Error).message)
        break
      }
    }
    setLeyendo(null)
    if (fallos.length === 0) navegar(`/resumen?mes=${meses[0]}`)
    else setErroresIa([...new Set(fallos)])
  }

  async function empezarDeNuevo() {
    if (analisis && !resultado) await api.cancelar(analisis.importacionId).catch(() => {})
    setArchivos([])
    setAnalisis(null)
    setResultado(null)
    setErroresIa([])
    setError('')
  }

  // --- La IA está leyendo ---
  if (leyendo) {
    return (
      <div className="grid min-h-[60dvh] place-items-center text-center">
        <div className="space-y-4">
          <span className="mx-auto block size-10 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-900" />
          <div>
            <p className="text-lg font-semibold">La IA está leyendo los mensajes…</p>
            <p className="mt-1 text-sm capitalize text-zinc-500">{leyendo}</p>
          </div>
          <p className="text-xs text-zinc-400">Suele tardar menos de un minuto.</p>
        </div>
      </div>
    )
  }

  // --- Paso 3: resultado ---
  if (resultado) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Chats guardados</h1>
        <Tarjeta className="space-y-3">
          <Aviso tipo="ok">
            Se han guardado <b>{resultado.mensajesNuevos}</b> mensajes nuevos
            {resultado.mensajesRepetidos > 0 && <> ({resultado.mensajesRepetidos} ya estaban de antes y no se han duplicado)</>}.
          </Aviso>
          {resultado.repartidores.length > 0 && (
            <p className="text-sm text-zinc-700">
              Repartidores nuevos: <b>{resultado.repartidores.join(', ')}</b>
            </p>
          )}
          {erroresIa.length > 0 && (
            <Aviso tipo="atencion">
              <p className="font-medium">No se pudieron leer algunos mensajes con la IA:</p>
              <ul className="mt-1 list-disc pl-5">
                {erroresIa.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Aviso>
          )}
          {resultado.mesesAfectados.length > MAX_MESES_AUTO && (
            <p className="text-xs text-zinc-500">
              Se han leído los {MAX_MESES_AUTO} meses más recientes. Los anteriores puedes leerlos desde Resumen.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to={`/resumen${resultado.mesesAfectados[0] ? `?mes=${resultado.mesesAfectados[0]}` : ''}`} className={`${claseBoton()} sm:flex-1`}>
              Ver resumen
            </Link>
            <Boton variante="secundario" onClick={empezarDeNuevo} className="sm:flex-1">
              Subir más chats
            </Boton>
          </div>
        </Tarjeta>
      </div>
    )
  }

  // --- Paso 2: confirmar repartidores detectados ---
  if (analisis) {
    const avisos = analisis.archivos.filter((a) => a.aviso)
    const sinDueno = !analisis.dueno && analisis.remitentesPosibles.length > 0
    const elegirDueno = sinDueno || cambiandoDueno
    const hayAlgo = analisis.detectados.length > 0
    const todoDescartado = analisis.detectados.every((d) => elecciones[d.clave]?.accion === 'descartar')

    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revisa los repartidores</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {archivos.length} {archivos.length === 1 ? 'chat leído' : 'chats leídos'}
            {analisis.dueno && (
              <>
                {' '}
                · El dueño es <b>{analisis.dueno}</b>{' '}
                {!cambiandoDueno && analisis.remitentesPosibles.length > 1 && (
                  <button className="font-medium text-zinc-900 underline underline-offset-2" onClick={() => setCambiandoDueno(true)}>
                    Cambiar
                  </button>
                )}
              </>
            )}
          </p>
        </div>

        {elegirDueno && (
          <Tarjeta className="space-y-3">
            <p className="text-sm font-medium">¿Quién es el dueño (el que recibe los reportes) en estos chats?</p>
            <p className="text-xs text-zinc-500">
              El resto de personas se tratan como repartidores. Los mensajes del dueño no se guardan.
            </p>
            <div className="flex flex-wrap gap-2">
              {analisis.remitentesPosibles.map((r) => (
                <Boton
                  key={r}
                  variante={r === analisis.dueno ? 'principal' : 'secundario'}
                  onClick={() => {
                    setCambiandoDueno(false)
                    if (r !== analisis.dueno) analizar(r)
                  }}
                  cargando={ocupado}
                >
                  {r}
                </Boton>
              ))}
            </div>
            {cambiandoDueno && (
              <Boton variante="fantasma" onClick={() => setCambiandoDueno(false)}>
                Cancelar
              </Boton>
            )}
          </Tarjeta>
        )}

        {avisos.length > 0 && !elegirDueno && (
          <Aviso tipo="atencion">
            <ul className="space-y-1">
              {avisos.map((a) => (
                <li key={a.nombreArchivo}>
                  <b>{a.nombreArchivo}:</b> {a.aviso}
                </li>
              ))}
            </ul>
          </Aviso>
        )}
        {analisis.errores.map((e) => (
          <Aviso key={e.nombreArchivo} tipo="error">
            <b>{e.nombreArchivo}:</b> {e.error}
          </Aviso>
        ))}

        {analisis.detectados.map((d) => {
          const e = elecciones[d.clave]
          const nuevo = !d.coincidencia
          return (
            <Tarjeta key={d.clave} className={e.accion === 'descartar' ? 'opacity-60' : ''}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold">{d.nombre}</h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        nuevo ? 'bg-lime-100 text-lime-800' : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {nuevo ? 'Nuevo' : `Ya existe: ${d.coincidencia!.nombre}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {d.totalMensajes} mensajes · del {fechaCorta(d.desde)} al {fechaCorta(d.hasta)}
                  </p>
                </div>
              </div>

              {d.ejemplos.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">
                  {d.ejemplos.map((m, i) => (
                    <li key={i} className="truncate">
                      <span className="text-zinc-400">{fechaCorta(m.fechaHora)}</span> {m.texto}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 grid gap-2">
                <select
                  className={campo}
                  value={e.accion === 'unir' ? `unir:${e.repartidorId}` : e.accion}
                  onChange={(ev) => {
                    const v = ev.target.value
                    const sig: Eleccion = v.startsWith('unir:')
                      ? { accion: 'unir', repartidorId: Number(v.slice(5)) }
                      : v === 'crear'
                        ? { accion: 'crear', nombre: d.nombre }
                        : { accion: 'descartar' }
                    setElecciones((p) => ({ ...p, [d.clave]: sig }))
                  }}
                >
                  <option value="crear">Crear repartidor nuevo</option>
                  {analisis.repartidoresExistentes.map((r) => (
                    <option key={r.id} value={`unir:${r.id}`}>
                      Es {r.nombre}
                    </option>
                  ))}
                  <option value="descartar">No es un repartidor (ignorar)</option>
                </select>
                {e.accion === 'crear' && (
                  <input
                    className={campo}
                    value={e.nombre}
                    onChange={(ev) => setElecciones((p) => ({ ...p, [d.clave]: { accion: 'crear', nombre: ev.target.value } }))}
                    placeholder="Nombre del repartidor"
                    aria-label="Nombre del repartidor"
                  />
                )}
              </div>
            </Tarjeta>
          )
        })}

        {!hayAlgo && !elegirDueno && <Aviso>No se ha encontrado ningún repartidor en estos archivos.</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Boton variante="secundario" onClick={empezarDeNuevo} className="sm:flex-1">
            Cancelar
          </Boton>
          {hayAlgo && (
            <Boton onClick={confirmar} cargando={ocupado} disabled={todoDescartado} className="sm:flex-1">
              Guardar
            </Boton>
          )}
        </div>
      </div>
    )
  }

  // --- Paso 1: elegir archivos ---
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Subir chats</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Sube los chats exportados de tus repartidores. Se crean solos con el nombre que tienes guardado en el contacto.
        </p>
      </div>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={soltar}
        className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${
          arrastrando ? 'border-marca-osc bg-lime-50' : 'border-zinc-300 bg-white hover:border-zinc-400'
        }`}
      >
        <span className="grid size-12 place-items-center rounded-full bg-zinc-900 text-marca">
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16" />
          </svg>
        </span>
        <span className="text-base font-semibold">Elegir archivos</span>
        <span className="text-xs text-zinc-500">.txt o .zip · puedes elegir varios</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept=".txt,.zip,text/plain,application/zip"
        className="hidden"
        onChange={(e) => {
          anadir(e.target.files)
          e.target.value = ''
        }}
      />

      {archivos.length > 0 && (
        <Tarjeta className="space-y-3">
          <ul className="divide-y divide-zinc-100">
            {archivos.map((f) => (
              <li key={f.name + f.size} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate">{f.name}</span>
                <button
                  onClick={() => setArchivos((p) => p.filter((x) => x !== f))}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
                  aria-label={`Quitar ${f.name}`}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
          <Boton onClick={() => analizar()} cargando={ocupado} className="w-full">
            Leer {archivos.length} {archivos.length === 1 ? 'chat' : 'chats'}
          </Boton>
        </Tarjeta>
      )}

      {error && <Aviso tipo="error">{error}</Aviso>}
      <ComoExportar />
    </div>
  )
}
