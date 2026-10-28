import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, euros, fechaCorta, leerPrecio, type Repartidor } from '../api'
import { Aviso, Boton, campo, claseBoton, Tarjeta } from '../ui'

function Fila({ r, alCambiar }: { r: Repartidor; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState(r.nombre)
  const [precio, setPrecio] = useState(r.tarifaPaquete ? Number(r.tarifaPaquete).toFixed(2).replace('.', ',') : '')
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

  const otrosNombres = r.alias.filter((a) => a !== r.nombre)

  return (
    <Tarjeta className={r.activo ? '' : 'opacity-60'}>
      {editando ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            if (!nombre.trim()) return
            const p = precio.trim() === '' ? null : leerPrecio(precio)
            if (precio.trim() !== '' && p === null) {
              setError('Escribe un precio válido, por ejemplo 0,85, o déjalo vacío.')
              return
            }
            guardar({ nombre: nombre.trim(), tarifaPaquete: p })
          }}
        >
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-zinc-600">Nombre</span>
            <input className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
          </label>
          <label className="sm:w-40">
            <span className="mb-1 block text-xs font-medium text-zinc-600">Precio propio (€/paquete)</span>
            <input className={campo} inputMode="decimal" placeholder="El general" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Boton type="submit" cargando={ocupado} className="flex-1">
              Guardar
            </Boton>
            <Boton type="button" variante="fantasma" onClick={() => setEditando(false)}>
              Cancelar
            </Boton>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-semibold">{r.nombre}</h2>
              {!r.activo && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">Inactivo</span>}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {r.totalMensajes} mensajes · último: {fechaCorta(r.ultimoMensaje)}
            </p>
            {r.tarifaPaquete !== null && (
              <p className="mt-1 text-xs font-medium text-lime-800">Precio propio: {euros(Math.round(Number(r.tarifaPaquete) * 100))} por paquete</p>
            )}
            {otrosNombres.length > 0 && (
              <p className="mt-1 truncate text-xs text-zinc-400">En WhatsApp: {otrosNombres.join(', ')}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Boton variante="fantasma" onClick={() => setEditando(true)}>
              Editar
            </Boton>
            <Boton variante="fantasma" cargando={ocupado} onClick={() => guardar({ activo: !r.activo })}>
              {r.activo ? 'Desactivar' : 'Activar'}
            </Boton>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Aviso tipo="error">{error}</Aviso>
        </div>
      )}
    </Tarjeta>
  )
}

export default function Repartidores() {
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Repartidores</h1>
        <p className="mt-1 text-sm text-zinc-600">Se añaden solos cuando subes sus chats.</p>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {lista === null && !error && <p className="text-sm text-zinc-500">Cargando…</p>}
      {lista?.length === 0 && (
        <Tarjeta className="space-y-3 text-center">
          <p className="text-sm text-zinc-600">Todavía no hay repartidores.</p>
          <Link to="/" className={claseBoton()}>
            Subir los primeros chats
          </Link>
        </Tarjeta>
      )}
      {lista?.map((r) => <Fila key={r.id} r={r} alCambiar={cargar} />)}
    </div>
  )
}
