import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import Login from './paginas/Login'
import Repartidores from './paginas/Repartidores'
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
  { a: '/repartidores', texto: 'Repartidores', icono: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-12 9a8 8 0 0 1 16 0' },
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

      <main className="mx-auto max-w-3xl px-4 py-5 sm:py-8">
        {yo.empresa ? (
          <Outlet />
        ) : (
          <p className="text-sm text-zinc-600">Tu usuario es de administrador y no pertenece a ninguna empresa.</p>
        )}
      </main>

      {/* Navegación inferior en móvil */}
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-2 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
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
        <Route path="/repartidores" element={<Repartidores />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
