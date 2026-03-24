import { useMemo, useState, useEffect } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageHeader from "../components/PageHeader";
import {
  fromAnySchema,
  normalizeSupabaseError,
  queryAnySchema,
  safeDate,
} from "../services/dataQueries";

/**
 * METRICS DEFINITION
 * Central configuration for all sensor and model fields that can be graphed.
 * Each entry ties a unique ID to a human-readable label and the specific 
 * backend table/column where the data resides.
 */
const METRICS = [
  { id: "soil_ph", label: "pH Levels", table: "sensor_data", field: "soil_ph" },
  {
    id: "soil_moisture",
    label: "Moisture",
    table: "sensor_data",
    field: "soil_moisture",
  },
  { id: "soil_temp", label: "Soil Temp", table: "sensor_data", field: "soil_temp" },
  { id: "air_temp", label: "Air Temp", table: "sensor_data", field: "air_temp" },
  {
    id: "air_humidity",
    label: "Air Humidity",
    table: "sensor_data",
    field: "air_humidity",
  },
  { id: "nitrogen", label: "Nitrogen (N)", table: "sensor_data", field: "nitrogen" },
  {
    id: "phosphorus",
    label: "Phosphorus (P)",
    table: "sensor_data",
    field: "phosphorus",
  },
  {
    id: "potassium",
    label: "Potassium (K)",
    table: "sensor_data",
    field: "potassium",
  },
  { id: "health", label: "Health (sensor)", table: "sensor_data", field: "health" },
  { id: "risk_t", label: "Risk (model)", table: "computed_scores", field: "risk_t" },
  {
    id: "health_t",
    label: "Health (model)",
    table: "computed_scores",
    field: "health_t",
  },
  {
    id: "stress_t",
    label: "Stress (model)",
    table: "computed_scores",
    field: "stress_t",
  },
];


function formatDayLabel(iso) {
  const d = safeDate(iso);
  if (!d) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function pickLineColor(i) {
  const colors = ["#22c55e", "#38bdf8", "#a855f7", "#f97316", "#ef4444"];
  return colors[i % colors.length];
}

// Pearson correlation coefficient
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    sx  += (xs[i] - mx) ** 2;
    sy  += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(sx * sy);
  return den === 0 ? 0 : +(num / den).toFixed(3);
}

// Descriptive statistics for an array of numbers
function descStats(arr) {
  const vals = arr.filter(v => typeof v === 'number' && !isNaN(v)).sort((a, b) => a - b);
  const n = vals.length;
  if (n === 0) return null;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  return {
    n, mean: +mean.toFixed(3), std: +Math.sqrt(variance).toFixed(3),
    min: +vals[0].toFixed(3), max: +vals[n-1].toFixed(3),
    p25: +vals[Math.floor(n * 0.25)].toFixed(3),
    median: +vals[Math.floor(n * 0.5)].toFixed(3),
    p75: +vals[Math.floor(n * 0.75)].toFixed(3),
  };
}

// Sensor fields used in correlation / distribution analysis
const CORR_FIELDS = [
  { key: 'soil_ph',       short: 'pH',    label: 'Soil pH',     unit: 'pH'     },
  { key: 'soil_moisture', short: 'Moist', label: 'Moisture',    unit: '%'      },
  { key: 'soil_temp',     short: 'STemp', label: 'Soil Temp',   unit: '\u00b0C' },
  { key: 'air_temp',      short: 'ATemp', label: 'Air Temp',    unit: '\u00b0C' },
  { key: 'air_humidity',  short: 'Humid', label: 'Humidity',    unit: '%'      },
  { key: 'nitrogen',      short: 'N',     label: 'Nitrogen',    unit: 'mg/kg'  },
  { key: 'phosphorus',    short: 'P',     label: 'Phosphorus',  unit: 'mg/kg'  },
  { key: 'potassium',     short: 'K',     label: 'Potassium',   unit: 'mg/kg'  },
];

// Cell background color: green = positive corr, red = negative
function corrColor(r) {
  if (r === null || isNaN(r)) return 'rgba(30,41,59,0.8)';
  const abs = Math.min(Math.abs(r), 1);
  return r >= 0
    ? `rgba(16,185,129,${(0.12 + abs * 0.78).toFixed(2)})`
    : `rgba(239,68,68,${(0.12 + abs * 0.78).toFixed(2)})`;
}

function ExperimentDetails() {
  const { experimentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

  const [experiment, setExperiment] = useState(null);
  const [tubs, setTubs] = useState([]);
  const [selectedMetricId, setSelectedMetricId] = useState("soil_ph");
  const [timeframe, setTimeframe] = useState("7d"); // 24h | 7d | 30d | all
  const [viewMode, setViewMode] = useState("combined"); // combined | tub
  const [activeTubId, setActiveTubId] = useState(null);
  const [activeSection, setActiveSection] = useState('chart'); // 'chart' | 'correlations' | 'distributions'
  const [corrViewTub, setCorrViewTub] = useState(null); // null = all tubs

  const [seriesRows, setSeriesRows] = useState([]);

  const metric = useMemo(
    () => METRICS.find((m) => m.id === selectedMetricId) ?? METRICS[0],
    [selectedMetricId]
  );

  const sinceIso = useMemo(() => {
    if (timeframe === "all") {
      return new Date(0).toISOString(); // January 1, 1970 - all time
    }
    const now = Date.now();
    const ms =
      timeframe === "24h"
        ? 24 * 60 * 60 * 1000
        : timeframe === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;
    return new Date(now - ms).toISOString();
  }, [timeframe]);

  const loadExperiment = async () => {
    setLoading(true);
    setErrors({});

    try {
      const [expRes, mapRes, tubsByExpRes] = await Promise.all([
        queryAnySchema("experiments", (q) => q.select("*").eq("id", experimentId).maybeSingle()),
        queryAnySchema("mapping", (q) => q.select("tub_id").eq("experiment_id", experimentId)),
        queryAnySchema("tubs", (q) => q.select("id,label,soil_type,plant_name,growth_rate,experiment_id,created_at,updated_at").eq("experiment_id", experimentId)),
      ]);

      const expErr = normalizeSupabaseError(expRes.error);
      const mapErr = normalizeSupabaseError(mapRes.error);
      const tubsByExpErr = normalizeSupabaseError(tubsByExpRes.error);
      if (expErr || mapErr || tubsByExpErr) setErrors({ experiments: expErr, mapping: mapErr, tubs: tubsByExpErr });

      setExperiment(expRes.data ?? null);

      const mappedTubIds = (mapRes.data ?? []).map((r) => r.tub_id).filter(Boolean);
      const directTubIds = (tubsByExpRes.data ?? []).map((t) => t.id);
      const tubIds = Array.from(new Set([...mappedTubIds, ...directTubIds]));

      if (tubIds.length === 0) {
        setTubs([]);
        setActiveTubId(null);
        return;
      }

      // If we don't have all details yet (e.g. from mapping), fetch them.
      // But we already fetched tubs by experiment_id. Let's merge if needed.
      /**
       * FETCH LINKED TUB PROFILES
       * Ensures we have the labels and metadata for every tub involved.
       */
      const tubsRes = await queryAnySchema("tubs", (q) => 
        q.select("id,label,soil_type,plant_name,growth_rate,experiment_id,created_at,updated_at")
         .in("id", tubIds)
      );


      const linked = tubsRes.data ?? [];
      setTubs(linked);
      setActiveTubId((prev) => prev ?? linked[0]?.id ?? null);
    } finally {
      setLoading(false);
    }
  };

  const loadSeries = async () => {
    if (!experimentId) return;
    const tubIds = tubs.map((t) => t.id).filter(Boolean);
    if (tubIds.length === 0) {
      setSeriesRows([]);
      return;
    }

    const common = metric.table === "sensor_data"
      ? "tub_id,created_at,soil_ph,soil_moisture,soil_temp,air_temp,air_humidity,nitrogen,phosphorus,potassium,health"
      : "tub_id,timestamp,health_t,stress_t,risk_t";

    const timeField = metric.table === "sensor_data" ? "created_at" : "timestamp";

    const res = await queryAnySchema(metric.table, (q) =>
      q
        .select(common)
        .in("tub_id", tubIds)
        .gte(timeField, sinceIso)
        .order(timeField, { ascending: true })
        .limit(2000)
    );

    const err = normalizeSupabaseError(res.error);
    if (err) setErrors((prev) => ({ ...prev, [metric.table]: err }));

    setSeriesRows(res.data ?? []);
  };

  useEffect(() => {
    loadExperiment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId]);

  useEffect(() => {
    loadSeries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric.id, timeframe, tubs.map((t) => t.id).join(",")]);

  const combinedSeries = useMemo(() => {
    if (!seriesRows.length) return [];

    const timeField = metric.table === "sensor_data" ? "created_at" : "timestamp";
    const rows = seriesRows
      .map((r) => ({ ...r, _t: safeDate(r[timeField]) }))
      .filter((r) => Boolean(r._t))
      .sort((a, b) => a._t.getTime() - b._t.getTime());

    // Build time buckets by day label to keep chart readable.
    const buckets = new Map();
    if (seriesRows.length > 0) {
      for (const r of rows) {
        const label = formatDayLabel(r[timeField]);
        if (!label) continue;
        const b = buckets.get(label) ?? { label, source: 'Database' };
        b[String(r.tub_id)] = r[metric.field];
        buckets.set(label, b);
      }
    } else {
      // Hardcoded fallback for empty experiments
      const now = Date.now();
      for (let i = 0; i < 7; i++) {
        const date = new Date(now - (6 - i) * 24 * 60 * 60 * 1000);
        const label = formatDayLabel(date.toISOString());
        const b = { label, source: 'Simulated' };
        tubs.forEach((t, idx) => {
          // Generate a semi-realistic trajectory
          const base = metric.field.includes('ph') ? 6.0 : metric.field.includes('temp') ? 22 : 40;
          b[String(t.id)] = base + Math.sin(i + idx) * 2 + Math.random();
        });
        buckets.set(label, b);
      }
    }
    return Array.from(buckets.values());
  }, [seriesRows, metric, tubs]);

  const tubSeries = useMemo(() => {
    if (!seriesRows.length || !activeTubId) return [];
    const timeField = metric.table === "sensor_data" ? "created_at" : "timestamp";
    const rows = seriesRows
      .filter((r) => String(r.tub_id) === String(activeTubId))
      .map((r) => ({ ...r, _t: safeDate(r[timeField]) }))
      .filter((r) => Boolean(r._t))
      .sort((a, b) => a._t.getTime() - b._t.getTime());

    const buckets = new Map();
    if (rows.length > 0) {
      for (const r of rows) {
        const label = formatDayLabel(r[timeField]);
        if (!label) continue;
        buckets.set(label, { label, value: r[metric.field], source: 'Database' });
      }
    } else {
      const now = Date.now();
      for (let i = 0; i < 7; i++) {
        const date = new Date(now - (6 - i) * 24 * 60 * 60 * 1000);
        const label = formatDayLabel(date.toISOString());
        const base = metric.field.includes('ph') ? 6.5 : metric.field.includes('temp') ? 25 : 50;
        buckets.set(label, { label, value: base + Math.cos(i) * 3, source: 'Simulated' });
      }
    }
    return Array.from(buckets.values());
  }, [seriesRows, metric, activeTubId, tubs]);

  const activeTub = useMemo(
    () => tubs.find((t) => String(t.id) === String(activeTubId)) ?? null,
    [tubs, activeTubId]
  );

  // Build pairwise Pearson correlation matrix from sensor_data rows
  const correlationMatrix = useMemo(() => {
    if (metric.table !== 'sensor_data') return null;
    const src = corrViewTub
      ? seriesRows.filter(r => String(r.tub_id) === String(corrViewTub))
      : seriesRows;
    if (src.length < 3) return null;
    return CORR_FIELDS.map(fi =>
      CORR_FIELDS.map(fj => {
        if (fi.key === fj.key) return { r: 1, n: src.length };
        const pairs = src.filter(r => typeof r[fi.key] === 'number' && typeof r[fj.key] === 'number');
        if (pairs.length < 2) return { r: null, n: 0 };
        return { r: pearson(pairs.map(r => r[fi.key]), pairs.map(r => r[fj.key])), n: pairs.length };
      })
    );
  }, [seriesRows, corrViewTub, metric.table]);

  // Descriptive stats per sensor field
  const distributionStats = useMemo(() => {
    if (metric.table !== 'sensor_data') return {};
    const src = corrViewTub
      ? seriesRows.filter(r => String(r.tub_id) === String(corrViewTub))
      : seriesRows;
    const out = {};
    for (const f of CORR_FIELDS) {
      const s = descStats(src.map(r => r[f.key]));
      if (s) out[f.key] = s;
    }
    return out;
  }, [seriesRows, corrViewTub, metric.table]);

  // Strong correlations list (|r| >= 0.5, upper triangle only)
  const strongCorrs = useMemo(() => {
    if (!correlationMatrix) return [];
    const out = [];
    for (let i = 0; i < CORR_FIELDS.length; i++)
      for (let j = i + 1; j < CORR_FIELDS.length; j++) {
        const cell = correlationMatrix[i][j];
        if (cell?.r !== null && Math.abs(cell.r) >= 0.5)
          out.push({ fi: CORR_FIELDS[i], fj: CORR_FIELDS[j], r: cell.r, n: cell.n });
      }
    return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  }, [correlationMatrix]);

  /**
   * DATA QUALITY WARNINGS
   * Detects off-diagonal r ≈ 1.00 pairs — a sign that two columns are identical
   * in the raw data (e.g. a composite NPK sensor writing the same value to N, P, K).
   * Also detects zero-variance columns (std = 0 → constant value).
   */
  const dataQualityWarnings = useMemo(() => {
    const warnings = [];
    if (!correlationMatrix) return warnings;

    // 1. Redundant feature pairs: |r| >= 0.99 off-diagonal
    const redundant = [];
    for (let i = 0; i < CORR_FIELDS.length; i++)
      for (let j = i + 1; j < CORR_FIELDS.length; j++) {
        const cell = correlationMatrix[i][j];
        if (cell?.r !== null && Math.abs(cell.r) >= 0.99)
          redundant.push(`${CORR_FIELDS[i].short} ↔ ${CORR_FIELDS[j].short}`);
      }
    if (redundant.length)
      warnings.push({
        type: 'redundant',
        title: 'Redundant / Identical Columns Detected',
        detail: `r ≈ 1.00 between: ${redundant.join(', ')}. This means these sensor columns contain the ` +
          `same (or perfectly proportional) values for every reading. ` +
          `Most likely cause: a composite NPK sensor reporting a single aggregate value ` +
          `copied into all three nutrient columns, OR test data entered with the same number for N, P, K. ` +
          `For ML: these features are fully redundant — your model is seeing the same information multiple times. ` +
          `Action: verify raw sensor_data rows and check your sensor driver code.`,
        pairs: redundant,
      });

    // 2. Zero-variance columns (constant value across all rows)
    if (distributionStats) {
      const constantCols = CORR_FIELDS.filter(f => distributionStats[f.key]?.std === 0);
      if (constantCols.length)
        warnings.push({
          type: 'constant',
          title: 'Constant-Value Columns',
          detail: `${constantCols.map(f => f.label).join(', ')} show zero variance (std = 0). ` +
            `Every reading has the same value — this column carries no information for ML.`,
          pairs: constantCols.map(f => f.label),
        });
    }

    return warnings;
  }, [correlationMatrix, distributionStats]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/experiments")}
            className="text-slate-400 hover:text-slate-200 text-sm"
          >
            ← Back to Experiments
          </button>
          <NavLink
            to="/"
            className="text-slate-500 hover:text-slate-300 text-sm"
          >
            Tubs
          </NavLink>
        </div>
      </div>

      <PageHeader
        title={experiment?.title ?? `Experiment ${experimentId}`}
        subtitle={
          experiment?.description ??
          "Tub-linked experiment telemetry with ML scores and sensor signals."
        }
        rightContent={
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900 p-1">
              <button
                onClick={() => setViewMode("combined")}
                className={`px-4 py-2 rounded-lg text-sm ${
                  viewMode === "combined"
                    ? "bg-emerald-500 text-black font-medium"
                    : "text-slate-300 hover:bg-slate-800/60"
                }`}
              >
                Combined View
              </button>
              <button
                onClick={() => setViewMode("tub")}
                className={`px-4 py-2 rounded-lg text-sm ${
                  viewMode === "tub"
                    ? "bg-emerald-500 text-black font-medium"
                    : "text-slate-300 hover:bg-slate-800/60"
                }`}
              >
                Individual Tub View
              </button>
            </div>
            <button
              onClick={() => {
                loadExperiment();
                loadSeries();
              }}
              className="px-4 py-2 rounded-lg border border-emerald-400 text-emerald-400 hover:bg-emerald-400/10"
            >
              Refresh
            </button>
          </div>
        }
      />

      {Object.values(errors).some(Boolean) && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          <div className="font-semibold">Supabase errors</div>
          <div className="mt-2 space-y-1 text-xs text-rose-100/80">
            {Object.entries(errors)
              .filter(([, v]) => Boolean(v))
              .map(([k, v]) => (
                <div key={k}>
                  <span className="font-medium">{k}</span>: {v.message}
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left rail */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              Status
            </div>
            <div className="mt-2 inline-flex items-center gap-2">
              <span
                className={`text-[11px] px-2 py-1 rounded-full capitalize ${
                  (experiment?.status ?? "").toLowerCase() === "active"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-slate-700/40 text-slate-300"
                }`}
              >
                {experiment?.status ?? "unknown"}
              </span>
              <span className="text-xs text-slate-500">
                {experiment?.started_at
                  ? `Started ${new Date(experiment.started_at).toLocaleDateString()}`
                  : ""}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-950/40 border border-slate-800 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Tubs linked
                </div>
                <div className="text-lg font-semibold mt-1">{tubs.length}</div>
              </div>
              <div className="rounded-xl bg-slate-950/40 border border-slate-800 p-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Timeframe
                </div>
                <select
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="mt-1 w-full bg-slate-950/30 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 text-sm outline-none cursor-pointer hover:bg-slate-950/50 transition-colors"
                >
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="all">All time</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">
                Sensor type
              </div>
              <select
                value={selectedMetricId}
                onChange={(e) => setSelectedMetricId(e.target.value)}
                className="mt-1 w-full bg-slate-950/30 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-sm outline-none"
              >
                {METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {viewMode === "tub" && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">
                  Tub
                </div>
                <select
                  value={activeTubId ?? ""}
                  onChange={(e) => setActiveTubId(e.target.value)}
                  className="mt-1 w-full bg-slate-950/30 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-sm outline-none"
                >
                  {tubs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label ?? `Tub ${t.id}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {activeTub && viewMode === "tub" && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Active tub
              </div>
              <div className="mt-2 text-xl font-semibold">{activeTub.label}</div>
              <div className="mt-2 text-sm text-slate-400">
                {activeTub.plant_name ?? "Plant N/A"} · {activeTub.soil_type ?? "Soil N/A"}
              </div>
            </div>
          )}
        </div>

        {/* Main chart */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">{metric.label}</h3>
              <p className="text-xs text-slate-400">
                {viewMode === "combined"
                  ? "Compare all linked tubs"
                  : "Single tub timeseries"}
              </p>
            </div>
            <div className="flex items-center gap-2">
               {seriesRows.length === 0 && !loading && (
                 <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                   SIMULATED_TRAJECTORY
                 </span>
               )}
               <div className="text-xs text-slate-500">
                 {loading ? "Loading…" : `${tubs.length} tubs`}
               </div>
            </div>
          </div>

          <div className="mt-4 h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              {viewMode === "combined" ? (
                <LineChart data={combinedSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" stroke="#64748b" tickLine={false} />
                  <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#020617",
                      borderRadius: 8,
                      border: "1px solid #1e293b",
                      fontSize: 12,
                    }}
                  />
                  {tubs.map((t, idx) => (
                    <Line
                      key={t.id}
                      type="monotone"
                      dataKey={String(t.id)}
                      name={t.label ?? `Tub ${t.id}`}
                      stroke={pickLineColor(idx)}
                      strokeWidth={3}
                      dot={false}
                    />
                  ))}
                </LineChart>
              ) : (
                <LineChart data={tubSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" stroke="#64748b" tickLine={false} />
                  <YAxis stroke="#64748b" tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#020617",
                      borderRadius: 8,
                      border: "1px solid #1e293b",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={activeTub?.label ?? "Tub"}
                    stroke="#22c55e"
                    strokeWidth={3}
                    dot={false}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>

          {!loading &&
            ((viewMode === "combined" && combinedSeries.length === 0) ||
              (viewMode === "tub" && tubSeries.length === 0)) && (
              <div className="mt-3 text-xs text-slate-500">
                No rows available for this timeframe/metric (or blocked by RLS).
              </div>
            )}
        </div>
      </div>

      {/* ── Section Tabs ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-4">
        {[{ id: 'chart', label: '\u25b3 Time Series' }, { id: 'correlations', label: '\u25a6 Correlation Matrix' }, { id: 'distributions', label: '\u2261 Distributions' }]
          .map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeSection === s.id ? 'bg-emerald-500 text-black' : 'border border-slate-700 text-slate-400 hover:bg-slate-800'
              }`}>{s.label}</button>
          ))}
        {activeSection !== 'chart' && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">Filter tub:</span>
            <select value={corrViewTub ?? ''} onChange={e => setCorrViewTub(e.target.value || null)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none">
              <option value="">All tubs combined</option>
              {tubs.map(t => <option key={t.id} value={t.id}>{t.label ?? `Tub ${t.id}`}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Correlation Heatmap ─────────────────────────────────────── */}
      {activeSection === 'correlations' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold">Sensor Correlation Matrix</h3>
            <p className="text-xs text-slate-400 mt-1">
              Pearson r between sensor fields.{' '}
              <span className="text-emerald-400">Green = positive</span>,{' '}
              <span className="text-rose-400">Red = negative</span>.
              Diagonal = 1. Stronger colour = stronger relationship.
            </p>
          </div>
          {metric.table !== 'sensor_data' ? (
            <p className="text-amber-400 text-sm">Switch to a sensor_data metric (e.g. pH, Moisture) to enable correlation analysis.</p>
          ) : !correlationMatrix ? (
            <p className="text-slate-500 text-sm py-8 text-center">
              {seriesRows.length < 3 ? `Not enough data (need ≥3 rows, have ${seriesRows.length}).` : 'No correlation data available.'}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table style={{ borderCollapse: 'separate', borderSpacing: 4 }} className="text-[11px]">
                  <thead>
                    <tr>
                      <th className="w-14 text-slate-500 font-normal"></th>
                      {CORR_FIELDS.map(f => <th key={f.key} className="w-14 text-center text-slate-400 font-semibold pb-2">{f.short}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {CORR_FIELDS.map((fi, i) => (
                      <tr key={fi.key}>
                        <td className="text-right pr-3 text-slate-400 font-semibold">{fi.short}</td>
                        {CORR_FIELDS.map((fj, j) => {
                          const cell = correlationMatrix[i][j];
                          return (
                            <td key={fj.key}
                              title={`${fi.label} \u00d7 ${fj.label}: r=${cell.r ?? 'n/a'}, n=${cell.n}`}
                              style={{ backgroundColor: corrColor(cell.r), minWidth: 52 }}
                              className="rounded-lg p-1.5 text-center font-mono cursor-default hover:opacity-75 transition-opacity">
                              <span className="text-white/90">{i === j ? '1.00' : cell.r !== null ? cell.r.toFixed(2) : '—'}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Data Quality Warnings ─────────────────────────── */}
              {dataQualityWarnings.length > 0 && (
                <div className="mt-6 space-y-3">
                  {dataQualityWarnings.map((w, wi) => (
                    <div key={wi} style={{
                      borderRadius: 14,
                      background: w.type === 'redundant'
                        ? 'rgba(245,158,11,0.06)'
                        : 'rgba(239,68,68,0.06)',
                      border: `1px solid ${w.type === 'redundant' ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
                      padding: '14px 18px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>
                          {w.type === 'redundant' ? '[!]' : '[x]'}
                        </span>
                        <div>
                          <div style={{
                            fontSize: 12, fontWeight: 800,
                            color: w.type === 'redundant' ? '#fbbf24' : '#f87171',
                            marginBottom: 6, letterSpacing: '0.01em',
                          }}>
                            {w.type === 'redundant' ? '! DATA QUALITY' : 'x CONSTANT COLUMN'} — {w.title}
                          </div>
                          <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.65, margin: 0 }}>
                            {w.detail}
                          </p>
                          {/* Affected pairs as chips */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                            {w.pairs.map(p => (
                              <span key={p} style={{
                                fontSize: 10, padding: '3px 10px', borderRadius: 99,
                                fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                                background: w.type === 'redundant' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                                color: w.type === 'redundant' ? '#fbbf24' : '#f87171',
                                border: `1px solid ${w.type === 'redundant' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}`,
                              }}>
                                {p}
                              </span>
                            ))}
                          </div>
                          {/* ML action tip for redundant */}
                          {w.type === 'redundant' && (
                            <div style={{
                              marginTop: 10, padding: '8px 12px', borderRadius: 8,
                              background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)',
                              fontSize: 11, color: '#6ee7b7',
                            }}>
                              <strong>ML Fix:</strong> Drop redundant columns before training — keep only one of the perfectly correlated fields (e.g. keep <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 4 }}>nitrogen</code>, drop <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 4 }}>phosphorus</code> &amp; <code style={{ background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 4 }}>potassium</code>) or fix your sensor driver to report real per-nutrient values.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Strong correlations summary */}
              <div className="mt-6 pt-4 border-t border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">Strong correlations (|r| ≥ 0.5)</p>
                <div className="flex flex-wrap gap-2">
                  {strongCorrs.length === 0 ? (
                    <span className="text-slate-500 text-xs">No strong correlations found in this dataset.</span>
                  ) : strongCorrs.map(({ fi, fj, r }) => (
                    <span key={`${fi.key}-${fj.key}`}
                      className={`text-[10px] px-2.5 py-1 rounded-full font-mono border ${
                        r >= 0 ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                      }`}>
                      {fi.short} ↔ {fj.short}: {r > 0 ? '+' : ''}{r.toFixed(2)}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Distributions ──────────────────────────────────────────── */}
      {activeSection === 'distributions' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="mb-5">
            <h3 className="text-lg font-semibold">Sensor Distributions</h3>
            <p className="text-xs text-slate-400 mt-1">
              Min / P25 / Median / P75 / Max for each sensor field.
              The bar shows the IQR (cyan dot = mean).
            </p>
          </div>
          {metric.table !== 'sensor_data' ? (
            <p className="text-amber-400 text-sm">Switch to a sensor_data metric to enable distribution analysis.</p>
          ) : Object.keys(distributionStats).length === 0 ? (
            <p className="text-slate-500 text-sm py-8 text-center">No data available.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {CORR_FIELDS.map(f => {
                const s = distributionStats[f.key];
                if (!s) return null;
                const range = s.max - s.min || 1;
                const p25pct = ((s.p25 - s.min) / range) * 100;
                const medPct = ((s.median - s.min) / range) * 100;
                const p75pct = ((s.p75 - s.min) / range) * 100;
                const meanPct = ((s.mean - s.min) / range) * 100;
                return (
                  <div key={f.key} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-sm font-semibold text-white">{f.label}</div>
                        <div className="text-[9px] text-slate-500 font-mono">{f.unit} &middot; n={s.n}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-emerald-400 font-mono">{s.mean}</div>
                        <div className="text-[9px] text-slate-500">mean &plusmn;{s.std}</div>
                      </div>
                    </div>
                    <div className="relative h-5 bg-slate-800 rounded-full overflow-hidden my-3">
                      <div className="absolute h-full bg-emerald-500/25 border border-emerald-500/40 rounded"
                        style={{ left: `${p25pct}%`, width: `${Math.max(p75pct - p25pct, 2)}%` }} />
                      <div className="absolute h-full w-0.5 bg-emerald-400"
                        style={{ left: `${medPct}%` }} />
                      <div className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-cyan-400 border-2 border-slate-900"
                        style={{ left: `${meanPct}%`, transform: 'translate(-50%,-50%)' }} />
                    </div>
                    <div className="grid grid-cols-3 gap-x-1 text-[9px] font-mono text-slate-500">
                      <span>min: <span className="text-slate-300">{s.min}</span></span>
                      <span className="text-center">p25: <span className="text-slate-300">{s.p25}</span></span>
                      <span className="text-right">max: <span className="text-slate-300">{s.max}</span></span>
                      <span>med: <span className="text-slate-300">{s.median}</span></span>
                      <span className="text-center">p75: <span className="text-slate-300">{s.p75}</span></span>
                      <span className="text-right">std: <span className="text-slate-300">{s.std}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ExperimentDetails;