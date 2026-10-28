# app_repartidores

Liquidaciones de repartidores a partir de los chats de WhatsApp exportados.

- **Qué hace y cómo:** [`SPEC.md`](SPEC.md)
- **Cómo trabajar en el código:** [`CLAUDE.md`](CLAUDE.md)
- **Cómo desplegarlo en el VPS:** [`DEPLOY.md`](DEPLOY.md)

## Arrancar en local

```bash
# Backend (necesita un PostgreSQL)
cd backend && npm install
DATABASE_URL=postgres://... npm run crear-usuario -- --email demo@demo.com --nombre Demo --empresa Demo --password demo12345
DATABASE_URL=postgres://... npm run dev

# Frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

Tests del backend (no necesitan PostgreSQL): `cd backend && npm test`.
