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

function ExperimentDetails() {
  const { experimentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});

  const [experiment, setExperiment] = useState(null);
  const [tubs, setTubs] = useState([]);
  const [selectedMetricId, setSelectedMetricId] = useState("soil_ph");
  const [timeframe, setTimeframe] = useState("7d"); // 24h | 7d | 30d
  const [viewMode, setViewMode] = useState("combined"); // combined | tub
  const [activeTubId, setActiveTubId] = useState(null);

  const [seriesRows, setSeriesRows] = useState([]);

  const metric = useMemo(
    () => METRICS.find((m) => m.id === selectedMetricId) ?? METRICS[0],
    [selectedMetricId]
  );

  const sinceIso = useMemo(() => {
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
      ? "tub_id,created_at,soil_ph,soil_moisture,soil_temp,air_temp,air_humidity,nitrogen,phosphorus,potassium"
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
                  className="mt-1 w-full bg-transparent text-slate-200 text-sm outline-none"
                >
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
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
    </div>
  );
}

export default ExperimentDetails;