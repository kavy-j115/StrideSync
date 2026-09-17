# StrideSync Backend

Node.js + Express + PostgreSQL (Supabase) API for the StrideSync interval run tracker.

---

## Architecture

```
Frontend (React Native / PWA)
        │
        │  HTTPS
        ▼
  Express API  ──►  PostgreSQL (Supabase)
  (Railway / Render)
```

### Tables

| Table | Purpose |
|---|---|
| `users` | User accounts |
| `interval_programs` | Saved workout templates |
| `program_segments` | Ordered segments in a template |
| `activities` | Completed workout records |
| `activity_segments` | Per-segment log (type, distance, time) |
| `route_points` | GPS coordinates, one row per ping |

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in DATABASE_URL from your Supabase project
```

Get your Supabase connection string:
> Supabase Dashboard → Settings → Database → Connection string → Session mode

### 3. Run database migration

```bash
npm run db:migrate
```

This creates all tables and indexes. Safe to run multiple times (uses `IF NOT EXISTS`).

### 4. Start the dev server

```bash
npm run dev
# API live at http://localhost:3001
```

---

## API Reference

### Health check
```
GET /health
```

### Save activity (called by frontend after workout ends)
```
POST /api/activities
Content-Type: application/json

{
  "name":        "Morning intervals",
  "date":        "2026-05-24T06:30:00.000Z",   ← workout start time
  "distanceKm":  3.82,
  "durationSec": 1420,
  "calories":    185,
  "avgPaceSec":  372,                           ← seconds/km, or null
  "targetDistM": 5000,
  "segments": [
    { "type": "run",  "dist": 1000, "duration": 360 },
    { "type": "walk", "dist": 300,  "duration": 180 },
    { "type": "run",  "dist": 1000, "duration": 355 }
  ],
  "route": [
    { "lat": 26.912434, "lon": 75.787270 },
    { "lat": 26.912501, "lon": 75.787341 },
    ...
  ]
}
```

Response:
```json
{ "success": true, "activityId": 42, "message": "Activity saved with 3 segments and 284 GPS points" }
```

### List activities
```
GET /api/activities
```

### Get single activity + full route
```
GET /api/activities/:id
```
Returns activity metadata, segment log, and full GPS route array.

### Delete activity
```
DELETE /api/activities/:id
```

---

## GPS & Distance Accuracy

The frontend uses two complementary mechanisms:

| Mechanism | When active | Accuracy |
|---|---|---|
| `navigator.geolocation.watchPosition()` | GPS granted | ±3–15 m outdoors |
| Haversine formula on lat/lon deltas | Per GPS ping | Depends on GPS |
| Time × speed estimate | GPS denied / indoors | Rough only |

Points with GPS accuracy > 30 m are filtered out automatically to prevent GPS drift from inflating the distance total.

---

## Deploy to Railway (recommended)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and link
railway login
railway init

# Set environment variables in Railway dashboard
# Then deploy
railway up
```

Set `DATABASE_URL` to your Supabase connection string in Railway environment variables.

---

## Deploy to Render

1. Create a new Web Service → connect your GitHub repo
2. Build command: `npm install`
3. Start command: `node src/index.js`
4. Add environment variables from `.env.example`

---

## Wiring the frontend to this API

In the frontend's `saveActivity()` function, replace the `console.log` line with:

```js
const API = 'https://your-api.railway.app'; // or localhost:3001 in dev

const res = await fetch(`${API}/api/activities`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(record),
});
const data = await res.json();
if (data.success) {
  // show saved message, then navigate home
}
```
