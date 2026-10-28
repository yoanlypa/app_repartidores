import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import Login from './paginas/Login'
import Configuracion from './paginas/Configuracion'
import Resumen from './paginas/Resumen'
import SubirChats from './paginas/SubirChats'
import { useSesion } from './sesion'

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/favicon.svg" alt="" className="size-8" />
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-tight">Repartos</div>
        <div className="text-[11px] text-zinc-500">Liquidaciones</div>
      </div>
    </div>
  )
}

const enlaces = [
  { a: '/', texto: 'Subir chats', icono: 'M12 16V4m0 0L7 9m5-5 5 5M4 20h16' },
  { a: '/resumen', texto: 'Resumen', icono: 'M4 19V9m6 10V5m6 14v-7m4 7H2' },
  {
    a: '/configuracion',
    texto: 'Configuración',
    icono:
      'M10.3 4.3a1.7 1.7 0 0 1 3.4 0 1.7 1.7 0 0 0 2.6 1.1 1.7 1.7 0 0 1 2.4 2.4 1.7 1.7 0 0 0 1.1 2.6 1.7 1.7 0 0 1 0 3.4 1.7 1.7 0 0 0-1.1 2.6 1.7 1.7 0 0 1-2.4 2.4 1.7 1.7 0 0 0-2.6 1.1 1.7 1.7 0 0 1-3.4 0 1.7 1.7 0 0 0-2.6-1.1 1.7 1.7 0 0 1-2.4-2.4 1.7 1.7 0 0 0-1.1-2.6 1.7 1.7 0 0 1 0-3.4 1.7 1.7 0 0 0 1.1-2.6 1.7 1.7 0 0 1 2.4-2.4 1.7 1.7 0 0 0 2.6-1.1ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  },
]

function Icono({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

function Marco() {
  const { yo, cargando, salir } = useSesion()
  if (cargando) return <div className="grid min-h-dvh place-items-center text-sm text-zinc-500">Cargando…</div>
  if (!yo) return <Navigate to="/login" replace />

  return (
    <div className="min-h-dvh pb-20 sm:pb-0">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav className="hidden gap-1 sm:flex">
            {enlaces.map((e) => (
              <NavLink
                key={e.a}
                to={e.a}
                end
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`
                }
              >
                {e.texto}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-right">
            <div className="hidden text-xs leading-tight text-zinc-500 sm:block">
              <div className="font-medium text-zinc-800">{yo.empresa?.nombre ?? 'Administrador'}</div>
              {yo.usuario.email}
            </div>
            <button onClick={salir} className="rounded-lg px-2.5 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-4 sm:py-8">
        {yo.empresa ? (
          <Outlet />
        ) : (
          <p className="text-sm text-zinc-600">Tu usuario es de administrador y no pertenece a ninguna empresa.</p>
        )}
      </main>

      {/* Navegación inferior en móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {enlaces.map((e) => (
          <NavLink
            key={e.a}
            to={e.a}
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-xs font-medium ${isActive ? 'text-zinc-900' : 'text-zinc-400'}`
            }
          >
            <Icono d={e.icono} />
            {e.texto}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Marco />}>
        <Route path="/" element={<SubirChats />} />
        <Route path="/resumen" element={<Resumen />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="/repartidores" element={<Navigate to="/configuracion" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
