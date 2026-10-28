import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { api, ErrorApi } from '../api'
import { useSesion } from '../sesion'
import { Aviso, Boton, campo } from '../ui'

export default function Login() {
  const { yo, cargando, recargar } = useSesion()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (!cargando && yo) return <Navigate to="/" replace />

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      await api.login(email, password)
      await recargar()
    } catch (err) {
      setError(err instanceof ErrorApi && err.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : (err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-zinc-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3 text-white">
          <img src="/favicon.svg" alt="" className="size-11 rounded-xl ring-1 ring-white/10" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Repartos</h1>
            <p className="text-sm text-zinc-400">Liquidaciones de repartidores</p>
          </div>
        </div>

        <form onSubmit={enviar} className="space-y-4 rounded-2xl bg-white p-6 shadow-xl">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={campo}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={campo}
            />
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <Boton type="submit" cargando={enviando} className="w-full">
            Entrar
          </Boton>
        </form>
        <p className="mt-6 text-center text-xs text-zinc-500">¿Sin acceso? Pídeselo a quien te instaló la app.</p>
      </div>
    </div>
  )
}
