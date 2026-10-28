# App de repartidores — guía rápida

**Lee `SPEC.md` antes de empezar cualquier tarea.** Es la fuente de verdad (requisitos, fases y decisiones).

## Qué es
App web para que el dueño de una empresa de reparto suba los chats de WhatsApp exportados de sus repartidores y obtenga los totales del mes para pagarles. Los repartidores se dan de alta solos a partir de los chats.

## Estructura
```
backend/    API Fastify + TypeScript + Drizzle + PostgreSQL  → api.yoapro.site
  src/parser/     lector de chats de WhatsApp y detección de repartidores (sin IA)
  src/rutas/      endpoints /api/...
  src/db/         esquema Drizzle (migraciones en backend/drizzle)
  test/           Vitest (PGlite en memoria, no necesita Postgres)
frontend/   React + Vite + Tailwind (estático, nginx)        → repartos.yoapro.site
```

## Comandos
```bash
# Backend
cd backend
npm test                         # tests
npm run dev                      # API en :3000 (necesita DATABASE_URL)
npm run db:generar               # nueva migración tras cambiar src/db/schema.ts
npm run crear-usuario -- --email x@y.com --nombre "Nombre" --empresa "Empresa" --password "..."

# Frontend
cd frontend
npm run dev                      # :5173 (VITE_API_URL=http://localhost:3000)
npm run build
```

## Reglas
- El código lee, la IA interpreta, el código suma. Nunca calcula totales la IA.
- Todas las consultas filtran por `empresa_id`.
- No se guardan los chats originales ni los mensajes del dueño.
- Interfaz y textos en español. Mobile-first.
- Las migraciones se aplican solas al arrancar el backend.
