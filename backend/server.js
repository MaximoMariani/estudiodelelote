import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;
const app = express();

// ─── DB CONNECTION ────────────────────────────────────────────────────────────
//
// Prioridad de conexión:
//   1. DATABASE_URL  → Railway lo inyecta automáticamente al agregar PostgreSQL.
//   2. Variables sueltas PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE → desarrollo local.
//   3. Fallback a localhost:5432 si no hay nada seteado.
//
// SSL:
//   - Railway (production) requiere ssl: { rejectUnauthorized: false }.
//   - Local sin SSL: ssl: false.

function buildConnectionString() {
  const host     = process.env.PGHOST     || 'localhost';
  const port     = process.env.PGPORT     || '5432';
  const user     = process.env.PGUSER     || 'postgres';
  const password = process.env.PGPASSWORD || '';
  const dbname   = process.env.PGDATABASE || 'studio_pro';
  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${dbname}`;
}

const isProduction = process.env.NODE_ENV === 'production'
  || !!process.env.RAILWAY_ENVIRONMENT;

const connectionString = process.env.DATABASE_URL || buildConnectionString();

// Log de conexión (sin exponer password)
const connForLog = connectionString.replace(/:([^@:]+)@/, ':***@');
console.log(`⚙  DB: ${connForLog}`);
console.log(`⚙  SSL: ${isProduction ? 'enabled (rejectUnauthorized: false)' : 'disabled'}`);

const pool = new Pool({
  connectionString,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  // Timeouts razonables para detectar errores rápido
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

// Verificar conexión al arrancar y dar error claro si falla
pool.on('error', (err) => {
  console.error('❌ Pool error inesperado:', err.message);
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json({ limit: '2mb' }));

// ─── INIT DATABASE ────────────────────────────────────────────────────────────
async function initDB() {
  // Ping rápido para detectar ECONNREFUSED antes de arrancar el servidor
  const client = await pool.connect().catch(err => {
    const hint = isProduction
      ? 'Verificá que DATABASE_URL esté seteada en Railway.'
      : 'Verificá que PostgreSQL esté corriendo y que PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE estén configuradas en .env';
    console.error(`❌ No se pudo conectar a la base de datos: ${err.message}`);
    console.error(`   Hint: ${hint}`);
    throw err;
  });

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS producciones (
        id         TEXT        PRIMARY KEY,
        data       JSONB       NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ Base de datos lista');
  } finally {
    client.release();
  }
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// GET /api/producciones — traer todas
app.get('/api/producciones', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT data FROM producciones ORDER BY created_at ASC'
    );
    res.json(result.rows.map(r => r.data));
  } catch (err) {
    console.error('GET /api/producciones error:', err.message);
    res.status(500).json({ error: 'Error al obtener producciones' });
  }
});

// PUT /api/producciones/:id — crear o actualizar (upsert)
app.put('/api/producciones/:id', async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  if (!data || !data.id) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  try {
    await pool.query(
      `INSERT INTO producciones (id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (id) DO UPDATE
         SET data = $2, updated_at = NOW()`,
      [id, JSON.stringify(data)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/producciones/:id error:', err.message);
    res.status(500).json({ error: 'Error al guardar producción' });
  }
});

// DELETE /api/producciones/:id — eliminar
app.delete('/api/producciones/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM producciones WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/producciones/:id error:', err.message);
    res.status(500).json({ error: 'Error al eliminar producción' });
  }
});

// Health check para Railway (Railway lo usa para saber si el servicio está vivo)
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// ─── START ────────────────────────────────────────────────────────────────────
// Railway inyecta process.env.PORT. NUNCA hardcodear el puerto.
const PORT = process.env.PORT || 3001;

initDB()
  .then(() => {
    // '0.0.0.0' es necesario para que Railway pueda rutear el tráfico.
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ Server corriendo en http://0.0.0.0:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Error iniciando la app:', err.message);
    process.exit(1);
  });
