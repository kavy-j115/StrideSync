require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const activitiesRouter = require('./routes/activities');

const app = express();
const PORT = process.env.PORT || 3001;

/* ── Security & middleware ──────────────────────────────────── */
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '2mb' })); /* route arrays can be large */

/* ── Routes ─────────────────────────────────────────────────── */
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.use('/api/activities', activitiesRouter);

/* ── 404 ────────────────────────────────────────────────────── */
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

/* ── Global error handler ───────────────────────────────────── */
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

/* ── Start ──────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\nStrideSync API running on http://localhost:${PORT}`);
  console.log(`Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database    : ${process.env.DATABASE_URL ? 'connected (Supabase)' : '⚠ DATABASE_URL not set'}\n`);
});
