import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ErrorApi, type Yo } from './api'

interface Sesion {
  yo: Yo | null
  cargando: boolean
  recargar: () => Promise<void>
  salir: () => Promise<void>
}

const Ctx = createContext<Sesion | null>(null)

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [yo, setYo] = useState<Yo | null>(null)
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    try {
      setYo(await api.yo())
    } catch (e) {
      if (!(e instanceof ErrorApi) || e.status === 401) setYo(null)
    } finally {
      setCargando(false)
    }
  }, [])

  const salir = useCallback(async () => {
    await api.logout().catch(() => {})
    setYo(null)
  }, [])

  useEffect(() => {
    recargar()
  }, [recargar])

  return <Ctx.Provider value={{ yo, cargando, recargar, salir }}>{children}</Ctx.Provider>
}

export function useSesion() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSesion fuera de ProveedorSesion')
  return s
}
