# Packages and runtimes for Flux

Install these **before** cloning or running the project. Exact versions are pinned in the manifests below; use those files as the source of truth.

## Runtimes (install once per machine)

| Tool | Purpose | Suggested |
|------|---------|-----------|
| **Node.js** | Frontend (Vite, React, build) | **20.x LTS** or newer (18+ required for modern Vite) |
| **npm** | Comes with Node | Same major as your Node install |
| **Python** | Backend API | **3.11** or **3.12** (3.10+ should work) |

---

## Frontend (`frontend/`)

Dependencies are declared in `frontend/package.json`. Install with:

```bash
cd frontend
npm install
```

### Production dependencies

| Package | Role |
|---------|------|
| `react` / `react-dom` | UI |
| `vite` (dev) | Dev server & production build |
| `@vitejs/plugin-react` | React in Vite |
| `typescript` | Types & `tsc` build step |
| `chart.js` | Analytics charts |
| `framer-motion` | Motion |
| `@tailwindcss/vite` / `tailwindcss` / `postcss` / `autoprefixer` | Styling |
| `@osdk/client` | Palantir OSDK client |
| `@osdk/foundry.models` | Foundry model types |
| `@osdk/oauth` | Foundry OAuth |

All resolved versions (including transitive) land in `frontend/package-lock.json` if you use one; otherwise `npm install` resolves from `package.json`.

**Run dev:** `npm run dev`  
**Production build:** `npm run build` → output in `frontend/dist/`

---

## Backend (`backend/`)

Dependencies are declared in `backend/requirements.txt`. Use a virtual environment:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate   # macOS / Linux

pip install -r requirements.txt
```

### Pinned packages

| Package | Role |
|---------|------|
| `fastapi` | HTTP API framework |
| `uvicorn[standard]` | ASGI server |
| `pydantic` | Data validation |
| `pydantic-settings` | Settings from env |

**Typical run:** `uvicorn app.main:app --reload` (from `backend/` with app layout as in your repo).

---

## Optional / deployment

- **Static hosting:** only the **frontend build** (`dist/`) is required for a pure static deploy; Node is only needed at **build** time unless you run `vite preview`.
- **Palantir / Foundry:** credentials and OAuth redirect URLs are configured in your environment and app config, not via extra npm packages beyond the `@osdk/*` entries above.
