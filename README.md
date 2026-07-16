# AtriumIQ

AtriumIQ is a full-stack smart comfort dashboard for the Nazarbayev University atrium. It reads sensor measurements, stores them in SQLite, calculates comfort analytics, and helps students decide whether the atrium is good for studying right now.

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Recharts, Framer Motion
- Backend: Python, FastAPI, Pydantic
- Database: SQLite
- ORM: SQLAlchemy
- Data exchange: REST API with JSON

## Architecture

- `backend/main.py`: FastAPI app, SQLAlchemy models, Pydantic schemas, API routes, analytics, reports CRUD.
- `backend/seed.py`: imports `result.json` or seeds initial demo data.
- `backend/atriumiq.db`: SQLite database created automatically.
- `frontend/`: React + TypeScript app that fetches data from the FastAPI API.
- `atriumiq_dashboard.html`: standalone dashboard preview connected to the same API when the backend is running.

## Data Import

The backend looks for `result.json` in:

- `backend/result.json`
- `result.json` in the project root

Run import/seed:

```bash
cd backend
python seed.py
```

Or import a specific file:

```bash
cd backend
python seed.py ../result.json
```

Minimum imported model:

```text
Reading
- id
- measured_at
- location        # atrium or outside
- temperature
- brightness      # optional for outside
- noise           # optional for outside
```

## Setup

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:

- Frontend: `http://localhost:5173`
- Backend docs: `http://localhost:8000/docs`

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/readings` | List imported readings |
| GET | `/api/readings/{id}` | Get one reading or return 404 |
| GET | `/api/summary` | Min, max, average temperature |
| GET | `/api/reports` | List user reports |
| POST | `/api/reports` | Create report, returns 201 Created |
| PATCH | `/api/reports/{id}` | Update one report or return 404 |
| DELETE | `/api/reports/{id}` | Delete one report or return 404 |
| GET | `/api/current` | Current atrium status and comfort score |
| GET | `/api/history` | Filtered and sorted history table |
| GET | `/api/analytics/trend` | Chart data for temperature, noise, brightness |
| GET | `/api/community-mood` | Report breakdown and satisfaction rate |

All endpoints return JSON, use Pydantic validation, and are included in FastAPI Swagger docs.

## Database Models

Reading:

- `id`
- `measured_at`
- `location`
- `temperature`
- `brightness`
- `noise`

Report:

- `id`
- `created_at`
- `category`
- `comment`
- `status`

The API also keeps compatibility fields for the UI: `timestamp`, `description`, `location`, and `author`.

## Comfort Score Formula

AtriumIQ calculates study, meeting, and relax scores from temperature, noise, and brightness:

```text
study = 100 - abs(atrium_temp - 21) * 6 - max(0, noise_db - 40) * 1.1
meeting = 100 - abs(atrium_temp - 22) * 5 - max(0, noise_db - 55) * 1.3
relax = 100 - abs(atrium_temp - 23) * 4 - max(0, noise_db - 50) * 0.8 - max(0, brightness_lux - 600) * 0.05
overall = average(study, meeting, relax)
```

The result is clamped to a comfort score range and converted into statuses such as Excellent for Study, Comfortable, Too Noisy, or Too Warm.

## Features

- Current atrium temperature, outdoor temperature, noise, brightness, and last update time.
- Comfort status with YES / MAYBE / NO-style study recommendation.
- History table with time, location, temperature, noise, and brightness.
- Filters by date, location, temperature, noise, and brightness.
- Sorting by time, temperature, noise, and brightness.
- Analytics for min, max, and average temperature.
- Own analytics: comfort score, best study time, smart insights, trend charts.
- Reports CRUD: create, read, update, delete community comfort reports.
- UI states: loading, error, and empty states.
- Responsive desktop and mobile design.
- Barsik mascot assistant with mood-based animation.
- Dark/light visual theme support in the standalone HTML dashboard.

## Deployment Links

- GitHub repo: TODO
- Frontend URL (Vercel): TODO
- Backend URL (Railway): TODO

Fill these in after deployment.
