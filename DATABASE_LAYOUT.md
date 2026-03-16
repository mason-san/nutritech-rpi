# NutriTech Database & Endpoint Documentation

This document details exactly which tables and columns are used by the application, how they relate, and which API/Supabase calls are responsible for fetching them.

---

## 🏗️ 1. Database Schema Layout

The database is divided into multiple schemas for organization:
- `public`: Hardware signals, raw sensor telemetry, and weather.
- `experiment`: High-level business objects (Tubs, Experiments, Configurations).
- `ml`: Outputs from machine learning models (Health scores, stress predictions).

### Key Tables & Column Mappings

| Table | Schema | Primary Use | Critical Columns |
|-------|--------|-------------|------------------|
| `experiments` | `experiment` | Research Protocols | `id`, `title`, `started_at`, `ended_at`, `status` |
| `tubs` | `experiment` | Individual Buckets | `id`, `label`, `plant_name`, `soil_type`, `experiment_id` |
| `mapping` | `experiment` | Join table | `id`, `experiment_id`, `tub_id` |
| `sensor_data`| `public` | Raw Telemetry | `tub_id`, `soil_moisture`, `soil_ph`, `soil_temp`, `nitrogen`, `phosphorus`, `potassium`, `created_at` |
| `computed_scores`| `ml` | Model Inference | `tub_id`, `health_t` (0-1), `risk_t` (0-1), `timestamp` |
| `sensor_status`| `public` | Hardware Health | `sensor_id`, `is_active`, `is_locked`, `last_seen` |
| `wifi_status` | `public` | Zone Connectivity | `location`, `is_online`, `offline_since`, `restored_at` |

---

## 🔗 2. Data Relationships

1. **Experiments → Tubs (1:N and M:N)**:
   - Tubs can be linked directly to an Experiment via `tubs.experiment_id`.
   - Alternatively, complex historical relationships are tracked in the `mapping` table.
   - **Application Logic**: The frontend combines both sources to find all tubs involved in an experiment.

2. **Tubs → Telemetry (1:N)**:
   - `sensor_data`, `computed_scores`, and `sensor_status` all use `tub_id` as a Foreign Key.
   - This allows the "Analyze" button to filter every chart by the specific container selected.

---

## 📡 3. API Endpoints & Queries

### 🐍 Backend API (Flask)
Used primarily as a proxy or for complex aggregate logic.
- `GET /api/tubs/`: Fetches all rows from `experiment.tubs`. Used for system-wide counts.
- `GET /api/experiments/`: Fetches all `experiment.experiments` sorted by date.
- `GET /api/experiments/<id>`: Performs a join between `experiments`, `mapping`, and `tubs` to return a complete "Experiment Package".

### ⚡ Client-Side Supabase (Direct)
The React frontend uses `dataQueries.js` to bypass the backend for high-frequency telemetry data.
1. **Dashboard Home**:
   - Fetches `sensor_status` to show the "System Online" pulse.
   - Fetches latest 500 records of `sensor_data` grouped by `tub_id`.
2. **Analytics Page**:
   - Queries `ml.computed_scores` and `ml.processed_readings` for advanced visualizations.
   - Queries `public.wifi_status` for the connectivity panel.

---

## 📊 4. Data Consumption Map (Frontend)

- **Tub Cards (Home)**:
  - `health_t` → Scaled to % for the "Health" meter.
  - `risk_t` → Scaled to % for the "Risk" meter.
  - `soil_moisture` → Displayed in the analysis grid.
- **Charts (Experiment Details)**:
  - `X-Axis`: `created_at` (Sensor Data) or `timestamp` (ML Scores).
  - `Y-Axis`: Dynamic based on the Metric dropdown (e.g., `soil_ph`).

---

## ⚠️ 5. Implementation Requirements (RLS)
The database uses **Row Level Security (RLS)**. For the frontend to fetch data directly, policies must be enabled for the `anon` role (public) for:
- `SELECT` on `public` tables.
- `SELECT` on `experiment` tables.
- `SELECT` on `ml` tables.
