import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variante = 'principal' | 'secundario' | 'peligro' | 'fantasma'

const estilos: Record<Variante, string> = {
  principal: 'bg-zinc-900 text-white hover:bg-zinc-800 active:bg-zinc-950',
  secundario: 'bg-white text-zinc-900 ring-1 ring-zinc-300 hover:bg-zinc-50',
  peligro: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
  fantasma: 'text-zinc-600 hover:bg-zinc-100',
}

export const claseBoton = (variante: Variante = 'principal') =>
  `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${estilos[variante]}`

export function Boton({
  variante = 'principal',
  cargando,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; cargando?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || cargando}
      className={`${claseBoton(variante)} ${className}`}
    >
      {cargando && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}

export function Tarjeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 sm:p-5 ${className}`}>{children}</div>
}

export function Aviso({ tipo = 'info', children }: { tipo?: 'info' | 'error' | 'ok' | 'atencion'; children: ReactNode }) {
  const c = {
    info: 'bg-zinc-100 text-zinc-700',
    error: 'bg-red-50 text-red-800 ring-1 ring-red-200',
    ok: 'bg-lime-50 text-lime-900 ring-1 ring-lime-200',
    atencion: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
  }[tipo]
  return <div className={`rounded-xl px-4 py-3 text-sm ${c}`}>{children}</div>
}

export const campo =
  'w-full rounded-xl border-0 bg-white px-3.5 py-3 text-base ring-1 ring-zinc-300 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900'
