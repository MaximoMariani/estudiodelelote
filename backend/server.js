import express from 'express';
import cors from 'cors';
import pg from 'pg';

const { Pool } = pg;
const app = express();

// ─── ENTORNO ──────────────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production'
  || process.env.RAILWAY_ENVIRONMENT !== undefined;

// ─── DB CONNECTION ────────────────────────────────────────────────────────────
function getConnectionConfig() {
  // PRODUCCIÓN: DATABASE_URL es obligatoria. Sin ella, no arrancamos.
  if (isProduction) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        '❌ DATABASE_URL missing. ' +
        'En Railway: asegurate de que el servicio de Postgres esté linkeado al backend ' +
        '(Settings → Variables → debería aparecer DATABASE_URL automáticamente).'
      );
    }
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    };
  }

  // DESARROLLO: DATABASE_URL tiene prioridad, sino variables sueltas, sino localhost.
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: false,
    };
  }

  return {
    host:     process.env.PGHOST     || 'localhost',
    port:     parseInt(process.env.PGPORT || '5432', 10),
    user:     process.env.PGUSER     || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'studio_pro',
    ssl: false,
  };
}

// Construye config y la loguea sin exponer el password
let poolConfig;
try {
  poolConfig = getConnectionConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

function safeConnString(config) {
  if (config.connectionString) {
    return config.connectionString.replace(/:([^@:/?]+)@/, ':***@');
  }
  return `postgresql://${config.user}:***@${config.host}:${config.port}/${config.database}`;
}

console.log(`⚙  Entorno : ${isProduction ? 'production' : 'development'}`);
console.log(`⚙  DB      : ${safeConnString(poolConfig)}`);
console.log(`⚙  SSL     : ${poolConfig.ssl ? 'enabled (rejectUnauthorized: false)' : 'disabled'}`);

const pool = new Pool({
  ...poolConfig,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

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
  const client = await pool.connect().catch(err => {
    const hint = isProduction
      ? 'Verificá en Railway: Variables → DATABASE_URL debe estar presente y el plugin de Postgres debe estar linkeado.'
      : 'Verificá que Postgres esté corriendo y que .env tenga PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE correctos.';
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

// Raíz — confirma que el servidor está vivo (evita "Cannot GET /")
app.get('/', (_, res) => {
  res.send('API online ✅');
});

// Health check con ping real a DB — Railway lo usa para readiness
app.get('/health', async (_, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: 'unknown',
  };

  try {
    await pool.query('SELECT 1');
    health.db = 'ok';
    res.json(health);
  } catch (err) {
    health.status = 'degraded';
    health.db = 'down';
    health.db_error = err.message.slice(0, 120);
    res.status(503).json(health);
  }
});

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

// ─── START ────────────────────────────────────────────────────────────────────
// Railway inyecta PORT. Nunca hardcodear. Default 8080 es el estándar Railway.
const PORT = process.env.PORT || 8080;

initDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ Server escuchando en http://0.0.0.0:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Fallo al iniciar:', err.message);
    process.exit(1);
  });
