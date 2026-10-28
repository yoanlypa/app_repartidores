# Despliegue en el VPS con Coolify

Resultado final:

- `https://api.yoapro.site` → backend
- `https://repartos.yoapro.site` → frontend
- PostgreSQL dentro de Coolify (no se expone a internet)

## 1. DNS (panel de Hostinger → Dominios → yoapro.site → DNS)

Crea dos registros **A** que apunten a la IP de tu VPS:

| Tipo | Nombre    | Apunta a      | TTL  |
|------|-----------|---------------|------|
| A    | `api`      | IP del VPS    | 3600 |
| A    | `repartos` | IP del VPS    | 3600 |

## 2. Base de datos

1. En Coolify: **+ New → Database → PostgreSQL** (en el mismo proyecto que las apps).
2. Nombre: `repartos-db`. Arráncala.
3. Copia la **Postgres URL (internal)**. Es la que usará el backend (`DATABASE_URL`).
4. En la pestaña **Backups**, programa una copia diaria (por ejemplo `0 3 * * *`).

## 3. Backend

1. **+ New → Application → GitHub** → repo `yoanlypa/app_repartidores`, rama `main`.
2. **Build Pack:** Dockerfile. **Base Directory:** `/backend`.
3. **Domains:** `https://api.yoapro.site`. **Port:** `3000`.
4. **Environment Variables:**
   ```
   DATABASE_URL=<la URL interna del paso 2>
   CORS_ORIGIN=https://repartos.yoapro.site
   NODE_ENV=production
   ```
5. **Deploy.** Las tablas se crean solas al arrancar.
6. Comprueba: `https://api.yoapro.site/api/salud` debe devolver `{"ok":true}`.

## 4. Frontend

1. **+ New → Application → GitHub** → mismo repo, rama `main`.
2. **Build Pack:** Dockerfile. **Base Directory:** `/frontend`.
3. **Domains:** `https://repartos.yoapro.site`. **Port:** `80`.
4. **Environment Variables:** `VITE_API_URL=https://api.yoapro.site`, marcada como **Build Variable**.
5. **Deploy.**

## 5. Crear los usuarios

En Coolify, abre el backend → **Terminal** y ejecuta:

```bash
# Tu usuario (administrador)
node dist/scripts/crear-usuario.js --email tu@email.com --nombre "Yoa" --superadmin --password "contraseña-larga"

# El dueño de la empresa de reparto
node dist/scripts/crear-usuario.js --email dueno@empresa.com --nombre "Nombre" --empresa "Nombre de la empresa" --password "contraseña-larga"
```

Si el email ya existe, el script le cambia la contraseña (sirve para resetearla).

## 6. Actualizaciones

Activa **Auto Deploy** en las dos aplicaciones: cada `git push` a `main` vuelve a desplegar.
Si solo cambia el frontend, solo se redespliega el frontend.

## Problemas típicos

- **El login no guarda la sesión:** revisa que `CORS_ORIGIN` sea exactamente `https://repartos.yoapro.site` (sin barra final) y que las dos webs estén en HTTPS.
- **"No hay conexión con el servidor":** `VITE_API_URL` mal puesta o el backend caído. Se fija al construir: si la cambias, redespliega el frontend.
- **Error 413 al subir:** el chat se exportó "con archivos". Hay que exportarlo "sin archivos".
