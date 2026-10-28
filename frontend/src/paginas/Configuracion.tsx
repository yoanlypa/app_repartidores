import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, euros, fechaCorta, leerPrecio, type Repartidor } from '../api'
import { useSesion } from '../sesion'
import { Aviso, Boton, campo, Tarjeta } from '../ui'

const precioTexto = (n: number | string | null) => (n === null || n === '' ? '' : Number(n).toFixed(2).replace('.', ','))

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{titulo}</h2>
        {descripcion && <p className="text-xs text-zinc-500">{descripcion}</p>}
      </div>
      {children}
    </section>
  )
}

function Interruptor({ activo, onChange, etiqueta, cargando }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string; cargando?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={cargando}
      onClick={() => onChange(!activo)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${activo ? 'bg-zinc-900' : 'bg-zinc-300'}`}
    >
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${activo ? 'left-6' : 'left-1'}`} />
    </button>
  )
}

function PrecioGeneral() {
  const { yo, recargar } = useSesion()
  const actual = yo?.empresa?.precioPaquete ?? 0
  const [texto, setTexto] = useState(actual ? precioTexto(actual) : '')
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; t: string } | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    const p = leerPrecio(texto)
    if (p === null) return setMsg({ tipo: 'error', t: 'Escribe un precio, por ejemplo 0,85' })
    setOcupado(true)
    setMsg(null)
    try {
      await api.cambiarPrecio(p)
      await recargar()
      setMsg({ tipo: 'ok', t: `Guardado: ${euros(Math.round(p * 100))} por paquete entregado.` })
    } catch (err) {
      setMsg({ tipo: 'error', t: (err as Error).message })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <Tarjeta>
      <form onSubmit={guardar} className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="precio">
          ¿Cuánto pagas por cada paquete entregado?
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input id="precio" className={`${campo} pr-8`} inputMode="decimal" placeholder="0,85" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">€</span>
          </div>
          <Boton type="submit" cargando={ocupado}>
            Guardar
          </Boton>
        </div>
        <p className="text-xs text-zinc-500">Se aplica a todos. A quien le pagues distinto, ponle un precio propio abajo.</p>
        {msg && <Aviso tipo={msg.tipo}>{msg.t}</Aviso>}
      </form>
    </Tarjeta>
  )
}

function NuevoRepartidor({ alCrear }: { alCrear: () => void }) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function crear(e: FormEvent) {
    e.preventDefault()
    const p = precio.trim() ? leerPrecio(precio) : null
    if (precio.trim() && p === null) return setError('Precio no válido. Déjalo vacío para usar el general.')
    setOcupado(true)
    setError('')
    try {
      await api.crearRepartidor(nombre.trim(), p)
      setNombre('')
      setPrecio('')
      setAbierto(false)
      alCrear()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  if (!abierto) {
    return (
      <Boton variante="secundario" className="w-full" onClick={() => setAbierto(true)}>
        + Añadir repartidor
      </Boton>
    )
  }

  return (
    <Tarjeta>
      <form onSubmit={crear} className="space-y-3">
        <p className="text-sm font-medium">Nuevo repartidor</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Nombre (como lo tienes guardado en WhatsApp)</span>
          <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Precio propio por paquete (opcional)</span>
          <input className={campo} inputMode="decimal" placeholder="El general" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </label>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid grid-cols-2 gap-2">
          <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={ocupado} disabled={!nombre.trim()}>
            Añadir
          </Boton>
        </div>
      </form>
    </Tarjeta>
  )
}

function FilaRepartidor({ r, alCambiar }: { r: Repartidor; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(r.nombre)
  const [precio, setPrecio] = useState(precioTexto(r.tarifaPaquete))
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  async function guardar(cambios: Parameters<typeof api.cambiarRepartidor>[1]) {
    setOcupado(true)
    setError('')
    try {
      await api.cambiarRepartidor(r.id, cambios)
      setEditando(false)
      alCambiar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function eliminar() {
    const aviso =
      r.totalMensajes > 0
        ? `¿Eliminar a ${r.nombre}? Se borrarán también sus ${r.totalMensajes} mensajes y sus días. Si solo ha dejado de trabajar, mejor dale de baja.`
        : `¿Eliminar a ${r.nombre}?`
    if (!window.confirm(aviso)) return
    setOcupado(true)
    setError('')
    try {
      await api.eliminarRepartidor(r.id)
      alCambiar()
    } catch (e) {
      setError((e as Error).message)
      setOcupado(false)
    }
  }

  const otrosNombres = r.alias.filter((a) => a !== r.nombre)

  return (
    <li className={`px-4 py-3 ${r.activo ? '' : 'bg-zinc-50'}`}>
      {editando ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            const p = precio.trim() === '' ? null : leerPrecio(precio)
            if (precio.trim() !== '' && p === null) return setError('Precio no válido (ej. 0,85) o déjalo vacío.')
            if (nombre.trim()) guardar({ nombre: nombre.trim(), tarifaPaquete: p })
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600">Nombre</span>
            <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-600">Precio propio (€/paquete) — vacío = el general</span>
            <input className={campo} inputMode="decimal" placeholder="El general" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Boton type="submit" cargando={ocupado} className="flex-1">
              Guardar
            </Boton>
            <Boton type="button" variante="secundario" onClick={() => setEditando(false)}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              variante="secundario"
              cargando={ocupado}
              onClick={() => guardar(r.activo ? { activo: false, mostrarEnResumen: false } : { activo: true, mostrarEnResumen: true })}
              className="w-full"
            >
              {r.activo ? 'Dar de baja (ya no trabaja)' : 'Volver a dar de alta'}
            </Boton>
            <Boton type="button" variante="peligro" cargando={ocupado} onClick={eliminar} className="w-full">
              Eliminar (creado por error)
            </Boton>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <button className="min-w-0 flex-1 text-left" onClick={() => setEditando(true)}>
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold">{r.nombre}</span>
              {!r.activo && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600">De baja</span>}
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {r.tarifaPaquete !== null ? (
                <span className="font-medium text-lime-800">{euros(Math.round(Number(r.tarifaPaquete) * 100))}/paquete · </span>
              ) : null}
              {r.totalMensajes > 0 ? `${r.totalMensajes} ${r.totalMensajes === 1 ? "mensaje" : "mensajes"} · último ${fechaCorta(r.ultimoMensaje)}` : 'Sin mensajes todavía'}
            </p>
            {otrosNombres.length > 0 && <p className="truncate text-[11px] text-zinc-400">En WhatsApp: {otrosNombres.join(', ')}</p>}
          </button>
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <Interruptor
              activo={r.mostrarEnResumen}
              cargando={ocupado}
              etiqueta={`Mostrar a ${r.nombre} en el resumen`}
              onChange={(v) => guardar({ mostrarEnResumen: v })}
            />
            <span className="text-[10px] text-zinc-500">Resumen</span>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}
    </li>
  )
}

export default function Configuracion() {
  const { yo, salir } = useSesion()
  const [lista, setLista] = useState<Repartidor[] | null>(null)
  const [error, setError] = useState('')

  const cargar = () =>
    api
      .repartidores()
      .then((r) => setLista(r.repartidores))
      .catch((e) => setError(e.message))

  useEffect(() => {
    cargar()
  }, [])

  const activos = lista?.filter((r) => r.activo) ?? []
  const deBaja = lista?.filter((r) => !r.activo) ?? []
  const visibles = activos.filter((r) => r.mostrarEnResumen).length

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>

      <Seccion titulo="Precio">
        <PrecioGeneral />
      </Seccion>

      <Seccion
        titulo="Repartidores"
        descripcion={lista ? `${activos.length} activos · ${visibles} en el resumen. Toca un nombre para editarlo.` : undefined}
      >
        {error && <Aviso tipo="error">{error}</Aviso>}
        {lista === null && !error && <p className="px-1 text-sm text-zinc-500">Cargando…</p>}
        {activos.length > 0 && (
          <Tarjeta className="!p-0 overflow-hidden">
            <ul className="divide-y divide-zinc-100">
              {activos.map((r) => (
                <FilaRepartidor key={r.id} r={r} alCambiar={cargar} />
              ))}
            </ul>
          </Tarjeta>
        )}
        {lista?.length === 0 && <p className="px-1 text-sm text-zinc-500">Aún no hay repartidores. Se crean solos al subir sus chats, o añádelos aquí.</p>}
        <NuevoRepartidor alCrear={cargar} />
        {deBaja.length > 0 && (
          <details className="rounded-2xl bg-white ring-1 ring-zinc-200">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-600">De baja ({deBaja.length})</summary>
            <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
              {deBaja.map((r) => (
                <FilaRepartidor key={r.id} r={r} alCambiar={cargar} />
              ))}
            </ul>
          </details>
        )}
      </Seccion>

      <Seccion titulo="Cuenta">
        <Tarjeta className="space-y-3">
          <div className="text-sm">
            <div className="font-semibold">{yo?.empresa?.nombre}</div>
            <div className="text-zinc-500">{yo?.usuario.email}</div>
            {yo?.empresa?.nombreDuenoWhatsapp && <div className="mt-1 text-xs text-zinc-500">En los chats apareces como «{yo.empresa.nombreDuenoWhatsapp}».</div>}
          </div>
          <Boton variante="secundario" className="w-full" onClick={salir}>
            Cerrar sesión
          </Boton>
        </Tarjeta>
      </Seccion>
    </div>
  )
}
