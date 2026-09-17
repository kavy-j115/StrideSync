const express = require('express');
const { body, param, validationResult } = require('express-validator');
const pool = require('../db/pool');

const router = express.Router();

/* ── helpers ───────────────────────────────────────────────── */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

/* ── POST /api/activities ──────────────────────────────────── */
/*
   Body shape (mirrors what the frontend builds in saveActivity()):
   {
     name:        string,
     date:        ISO string  (start time),
     distanceKm:  number,
     durationSec: number,
     calories:    number,
     avgPaceSec:  number | null,
     targetDistM: number,
     segments: [{ type, dist, duration }],
     route:    [{ lat, lon }]
   }
*/
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('name is required'),
    body('date').isISO8601().withMessage('date must be ISO 8601'),
    body('distanceKm').isFloat({ min: 0 }).withMessage('distanceKm must be a positive number'),
    body('durationSec').isInt({ min: 0 }).withMessage('durationSec must be a non-negative integer'),
    body('segments').isArray().withMessage('segments must be an array'),
    body('route').isArray().withMessage('route must be an array'),
  ],
  validate,
  async (req, res) => {
    const client = await pool.connect();
    try {
      const {
        name,
        date,
        distanceKm,
        durationSec,
        calories,
        avgPaceSec,
        targetDistM,
        segments = [],
        route = [],
      } = req.body;

      const distanceM = Math.round(distanceKm * 1000);

      await client.query('BEGIN');

      /* 1. Insert the activity row */
      const actResult = await client.query(
        `INSERT INTO activities
           (name, started_at, ended_at, duration_sec, distance_m,
            avg_pace_sec, calories, gps_point_count, target_dist_m)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          name,
          new Date(date),
          new Date(Date.now()),
          durationSec,
          distanceM,
          avgPaceSec || null,
          calories || null,
          route.length,
          targetDistM || null,
        ]
      );

      const activityId = actResult.rows[0].id;

      /* 2. Insert segment log */
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i];
        await client.query(
          `INSERT INTO activity_segments
             (activity_id, position, type, target_dist_m, duration_sec)
           VALUES ($1, $2, $3, $4, $5)`,
          [activityId, i + 1, s.type, s.dist, s.duration]
        );
      }

      /* 3. Bulk-insert GPS points (chunked for large routes) */
      if (route.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < route.length; i += CHUNK) {
          const chunk = route.slice(i, i + CHUNK);
          const values = chunk
            .map((_, j) => {
              const base = (j * 3) + 1;
              return `($${base}, $${base + 1}, $${base + 2})`;
            })
            .join(', ');

          const flat = chunk.flatMap((pt, j) => [
            activityId,
            parseFloat(pt.lat.toFixed(6)),
            parseFloat(pt.lon.toFixed(6)),
          ]);

          /* rebuild placeholders with activity_id, seq, lat, lon */
          const vals4 = chunk
            .map((_, j) => {
              const base = (j * 4) + 1;
              return `($${base}, $${base + 1}, $${base + 2}, $${base + 3})`;
            })
            .join(', ');

          const flat4 = chunk.flatMap((pt, j) => [
            activityId,
            i + j + 1,
            parseFloat(pt.lat.toFixed(6)),
            parseFloat(pt.lon.toFixed(6)),
          ]);

          await client.query(
            `INSERT INTO route_points (activity_id, seq, lat, lon) VALUES ${vals4}`,
            flat4
          );
        }
      }

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        activityId,
        message: `Activity "${name}" saved with ${segments.length} segments and ${route.length} GPS points`,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Save activity error:', err.message);
      res.status(500).json({ error: 'Failed to save activity', detail: err.message });
    } finally {
      client.release();
    }
  }
);

/* ── GET /api/activities ───────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, started_at, duration_sec, distance_m,
              avg_pace_sec, calories, gps_point_count
       FROM activities
       ORDER BY started_at DESC
       LIMIT 50`
    );
    res.json({ activities: result.rows });
  } catch (err) {
    console.error('Fetch activities error:', err);
    res.status(500).json({
      error: 'Failed to fetch activities',
      detail: err.message
    });
  }
});

/* ── GET /api/activities/:id ───────────────────────────────── */
router.get(
  '/:id',
  [param('id').isInt().withMessage('id must be an integer')],
  validate,
  async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const [actQ, segsQ, routeQ] = await Promise.all([
        pool.query('SELECT * FROM activities WHERE id = $1', [id]),
        pool.query(
          'SELECT * FROM activity_segments WHERE activity_id = $1 ORDER BY position',
          [id]
        ),
        pool.query(
          'SELECT seq, lat, lon FROM route_points WHERE activity_id = $1 ORDER BY seq',
          [id]
        ),
      ]);

      if (!actQ.rows.length) return res.status(404).json({ error: 'Activity not found' });

      res.json({
        activity: actQ.rows[0],
        segments: segsQ.rows,
        route: routeQ.rows,
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch activity' });
    }
  }
);

/* ── DELETE /api/activities/:id ────────────────────────────── */
router.delete(
  '/:id',
  [param('id').isInt()],
  validate,
  async (req, res) => {
    try {
      await pool.query('DELETE FROM activities WHERE id = $1', [parseInt(req.params.id)]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete activity' });
    }
  }
);

module.exports = router;
