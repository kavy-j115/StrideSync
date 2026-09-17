/* ============================================================
   StrideSync – PostgreSQL Schema Migration
   Run: node src/db/migrate.js
   ============================================================ */

require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const schema = `

/* ── Users ──────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

/* ── Interval programs (saved templates) ───────────────────── */
CREATE TABLE IF NOT EXISTS interval_programs (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  target_dist_m INTEGER NOT NULL,          -- total target in metres
  repeat_count  INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

/* ── Segments inside a program (ordered) ───────────────────── */
CREATE TABLE IF NOT EXISTS program_segments (
  id            SERIAL PRIMARY KEY,
  program_id    INTEGER REFERENCES interval_programs(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,          -- 1-based order
  type          TEXT NOT NULL CHECK (type IN ('run', 'walk')),
  dist_m        INTEGER NOT NULL           -- target distance in metres
);

/* ── Recorded activities ────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS activities (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  duration_sec    INTEGER,                 -- total elapsed seconds
  distance_m      NUMERIC(10,2),           -- actual metres covered
  avg_pace_sec    INTEGER,                 -- seconds per km
  calories        INTEGER,
  gps_point_count INTEGER DEFAULT 0,
  target_dist_m   INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

/* ── Per-segment log for each activity ─────────────────────── */
CREATE TABLE IF NOT EXISTS activity_segments (
  id            SERIAL PRIMARY KEY,
  activity_id   INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('run', 'walk')),
  target_dist_m INTEGER NOT NULL,
  actual_dist_m NUMERIC(10,2),
  duration_sec  INTEGER
);

/* ── GPS route points ───────────────────────────────────────── */
/*
   Stores every coordinate recorded during the activity.
   Using NUMERIC for lat/lon keeps 6 decimal places (≈ 11 cm accuracy).
   For heavy use, consider PostGIS GEOGRAPHY(POINT) instead.
*/
CREATE TABLE IF NOT EXISTS route_points (
  id            BIGSERIAL PRIMARY KEY,
  activity_id   INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,          -- chronological order
  lat           NUMERIC(9,6) NOT NULL,
  lon           NUMERIC(9,6) NOT NULL,
  recorded_at   TIMESTAMPTZ DEFAULT NOW()
);

/* ── Indexes ────────────────────────────────────────────────── */
CREATE INDEX IF NOT EXISTS idx_activities_user    ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_act_segs_activity  ON activity_segments(activity_id);
CREATE INDEX IF NOT EXISTS idx_route_activity     ON route_points(activity_id, seq);

`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running migration…');
    await client.query(schema);
    console.log('✓ Schema applied successfully');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
