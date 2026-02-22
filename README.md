# Studio Pro — Full Stack

Backend: **Node + Express + PostgreSQL**  
Frontend: **React + Vite**  
Deploy: **Railway** (backend + Postgres) + **GitHub Pages** (frontend estático)

---

## Estructura del proyecto

```
studio-full/
├── backend/
│   ├── server.js          ← API REST (Express + pg)
│   ├── package.json
│   └── .env.example       ← copiá como .env para desarrollo local
└── frontend/
    ├── src/
    │   ├── App.jsx        ← toda la UI
    │   ├── api.js         ← cliente HTTP al backend
    │   └── main.jsx
    ├── vite.config.js
    ├── package.json
    └── .env.example       ← copiá como .env.production para el build de prod
```

---

## Por qué fallaba (`ECONNREFUSED 127.0.0.1:5432`)

El backend intentaba conectarse a PostgreSQL en `localhost:5432`, pero:

- En **Railway**, Postgres NO corre en localhost. Railway inyecta `DATABASE_URL` con el host real.
- Si `DATABASE_URL` está vacío o no definido, `new Pool({ connectionString: undefined })` usa el default de `pg` que apunta a `127.0.0.1:5432` → ECONNREFUSED.
- El puerto de escucha del servidor (`PORT`) tampoco leía `process.env.PORT`, y Railway requiere eso obligatoriamente.
- `app.listen(PORT)` sin `'0.0.0.0'` puede fallar en algunos entornos de contenedores.

**Todos estos puntos están corregidos en el `server.js` del patch.**

---

## Desarrollo local

### Requisitos

- Node.js 18+ (https://nodejs.org)
- PostgreSQL corriendo localmente (instalá desde https://postgresql.org o usá Docker)

### 1. Configurar variables de entorno del backend

```bash
cd backend
cp .env.example .env
```

Editá `backend/.env` con tus credenciales locales de Postgres:

```env
NODE_ENV=development
PORT=3001
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=tu_password
PGDATABASE=studio_pro
```

> Si ya tenés un Postgres local, creá la base de datos antes de arrancar:
> ```sql
> CREATE DATABASE studio_pro;
> ```
> El backend crea la tabla `producciones` automáticamente al arrancar.

### 2. Instalar dependencias y arrancar

Abrí **dos terminales**:

**Terminal 1 — Backend:**
```bash
cd backend
npm install
npm run dev
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Abrí **http://localhost:5173** — el frontend habla con el backend en `:3001` automáticamente via el proxy de Vite. No necesitás configurar nada más en local.

---

## Deploy en Railway (backend + base de datos)

### Estrategia recomendada: 2 servicios en Railway

```
Railway Project
├── Service: studio-pro-backend    (Node.js)
└── Plugin:  PostgreSQL            (base de datos)
```

### Paso 1 — Crear cuenta y proyecto

1. Entrá a https://railway.app → registrate con GitHub.
2. Click en **"New Project"** → **"Deploy from GitHub repo"**.
3. Conectá tu repo y seleccioná el repositorio.

### Paso 2 — Configurar el Root Directory del backend

En el servicio creado → **Settings** → **Root Directory** → ponés: `backend`

Railway detecta Node.js automáticamente y usa `npm start` (que corre `node server.js`).

| Setting         | Valor              |
|-----------------|--------------------|
| Root Directory  | `backend`          |
| Build Command   | `npm install`      |
| Start Command   | `npm start`        |

### Paso 3 — Agregar PostgreSQL

1. En tu proyecto Railway → click en **"New"** → **"Database"** → **"Add PostgreSQL"**.
2. Railway crea la base de datos y **setea `DATABASE_URL` automáticamente** en el servicio de backend.
3. No tenés que hacer nada más. El backend crea la tabla `producciones` solo al arrancar.

### Paso 4 — Variables de entorno en Railway

En el servicio del backend → **Variables** → agregar:

| Variable       | Valor                                      |
|----------------|--------------------------------------------|
| `NODE_ENV`     | `production`                               |
| `FRONTEND_URL` | `https://tu-usuario.github.io` (o vacío)   |

> `DATABASE_URL` y `PORT` los inyecta Railway automáticamente. No los agregues a mano.

### Paso 5 — Obtener la URL pública del backend

En Railway, el servicio tiene un dominio público tipo:
```
https://studio-pro-backend-production.up.railway.app
```
**Guardala**. La necesitás para el frontend.

---

## Deploy del frontend en GitHub Pages

### Paso 1 — Configurar la URL del backend

```bash
cd frontend
cp .env.example .env.production
```

Editá `frontend/.env.production`:
```env
VITE_API_URL=https://studio-pro-backend-production.up.railway.app
```

### Paso 2 — Build

```bash
cd frontend
npm install
npm run build
```

Genera `frontend/dist/` con los archivos estáticos listos.

### Paso 3 — Subir a GitHub Pages

**Opción A — Manual:**
1. En GitHub → tu repo → Settings → Pages.
2. Source: **"Deploy from a branch"** → branch: `gh-pages` (o subí los archivos manualmente).
3. Subí el contenido de `frontend/dist/` al branch `gh-pages`.

**Opción B — GitHub Actions (recomendado):**

Creá `.github/workflows/deploy-frontend.yml`:

```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]
    paths: ['frontend/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Build
        working-directory: frontend
        run: |
          npm install
          npm run build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./frontend/dist
```

Agregá el secret `VITE_API_URL` en GitHub → repo → Settings → Secrets → Actions.

### Nota sobre rutas en GitHub Pages

Si tu repo se llama `studio-full`, GitHub Pages sirve en `https://usuario.github.io/studio-full/`.  
En ese caso, descomentá la línea `base` en `frontend/vite.config.js`:
```js
base: '/studio-full/',
```

---

## CORS

El backend acepta requests del dominio definido en `FRONTEND_URL`. Si dejás `FRONTEND_URL` vacío, acepta cualquier origen (`*`). Para producción, setealo al dominio exacto de tu frontend.

---

## Resumen de variables

### Backend (Railway)

| Variable        | Quién la setea        | Valor ejemplo                                |
|-----------------|-----------------------|----------------------------------------------|
| `DATABASE_URL`  | Railway (automático)  | `postgresql://user:pass@host:port/db`        |
| `PORT`          | Railway (automático)  | `8080` (lo que Railway asigne)               |
| `NODE_ENV`      | Vos                   | `production`                                 |
| `FRONTEND_URL`  | Vos                   | `https://tu-usuario.github.io`               |

### Frontend (build)

| Variable        | Quién la setea        | Valor ejemplo                                             |
|-----------------|-----------------------|-----------------------------------------------------------|
| `VITE_API_URL`  | Vos (.env.production) | `https://studio-pro-backend-production.up.railway.app`   |
