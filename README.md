# Flux

AI-inspired **smart energy grid simulation** for the ten largest US cities: demand, renewable supply, storage, risk, and animated inter-city power flows. Built for hackathon demos with a FastAPI backend and a React + Leaflet front end.

## Prerequisites

- **Python 3.11+** (3.13 tested)
- **Node.js 20+** and npm (for the frontend)

## Backend (FastAPI)

```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API (default `http://127.0.0.1:8000`):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/city-state` | Current metrics for all 10 cities |
| POST | `/simulate` | Body: `temperature`, `solar_factor`, `ev_multiplier`, `data_center_multiplier` — updates simulation and returns cities |
| GET | `/forecast` | Predicted demand for next 3 hours per city |
| GET | `/energy-flow` | `{ "flows": [ { "from", "to", "mw" } ] }` for visualization |
| GET | `/recommendations` | Grid stabilization actions |
| POST | `/ai-query` | Body: `{ "query": "..." }` — short natural-language answers + structured hints |
| GET | `/health` | Liveness check |

Interactive docs: `http://127.0.0.1:8000/docs`

## Frontend (Vite + React + Leaflet)

In a **second** terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The dev server proxies API calls to the backend on port 8000.

**Production build:**

```powershell
cd frontend
npm run build
npm run preview
```

Serve `frontend/dist` behind any static host; configure that host to proxy `/simulate`, `/city-state`, `/forecast`, `/energy-flow`, `/recommendations`, and `/ai-query` to the API, or set `VITE_API_BASE` (see below).

### API base URL

By default the app uses same-origin paths (Vite proxy in dev). For a deployed frontend pointing at a remote API, create `frontend/.env`:

```env
VITE_API_BASE=https://your-api.example.com
```

Then rebuild; `src/api.ts` prepends this base to requests when set.

## Cities (fixed set)

New York City, Los Angeles, Chicago, Houston, Phoenix, Philadelphia, San Antonio, San Diego, Dallas, San Jose.

## What to demo

1. Move **scenario sliders** (temperature, solar, EV, data centers) and watch **risk-colored nodes** and **animated flow lines** update.
2. **Click a city** for demand, renewables, storage, risk, and inbound/outbound flows.
3. Use the **Decision agent** panel for sample questions (risk, routing, EV scenario).
4. Open **Swagger** at `/docs` to show the API contract.

## Project layout

```
Flux/
  backend/           # FastAPI app + simulation engine
  frontend/          # React + Leaflet UI
  README.md
```

## Notes

- All numbers are **synthetic** — tuned for visual clarity, not grid certification.
- Risk bands: low &lt; 50, medium 50–150, high 150–300, critical &gt; 300 (on the internal score).
- No external ML dependencies; “AI” panel uses lightweight rule + template responses over live simulation state.
