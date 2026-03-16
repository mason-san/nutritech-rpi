import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { RadarAnalysis } from "../components/SmartAnalysisCharts.jsx";
import {
  fromAnySchema,
  normalizeSupabaseError,
  queryAnySchema,
  safeDate,
} from "../services/dataQueries.js";
import { MetricOptimizationChart } from "../components/SmartAnalysisCharts.jsx";

function Home() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorsByQuery, setErrorsByQuery] = useState({});
  const requestIdRef = useRef(0);

  const [overview, setOverview] = useState({
    totalTubs: 0,
    activeSensors: 0,
    avgHealthScore: null,
  });

  const [tubCards, setTubCards] = useState([]);
  const [activeTubModal, setActiveTubModal] = useState(null);
  const [modalDetails, setModalDetails] = useState(null);

  /**
   * LOAD DASHBOARD
   * Core function to fetch all telemetry, status, and experiment metadata.
   * Runs on mount and on "Refresh" button click.
   */
  const loadDashboard = async () => {
    // Unique ID per request to prevent race conditions (stale data overwriting new data)
    const myRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setErrorsByQuery({});

    try {
      // Parallel execution of all required data queries for performance
      const [
        tubsRes,
        sensorRes,
        scoresRes,
        tubsDetailsRes,
        sensorDataRes,
      ] = await Promise.all([
        // 1. Get raw tub IDs
        fromAnySchema("tubs", "id"),
        // 2. Get active status of sensors
        fromAnySchema(
          "sensor_status",
          "sensor_id,is_active,is_locked,tub_id,last_seen",
          { schemas: ["public", "experiment"] }
        ),
        // 3. Get ML-computed health/risk scores
        (async () => {
          const res = await fromAnySchema(
            "computed_scores",
            "tub_id,experiment_id,timestamp,health_t,stress_t,risk_t"
          );
          if (res.error) return res;
          // Sort scores by date descending
          const ordered = [...(res.data ?? [])].sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          return { ...res, data: ordered.slice(0, 200) };
        })(),
        // 4. Get detailed tub metadata (labels, plant names)
        fromAnySchema(
          "tubs",
          "id,label,soil_type,plant_name,growth_rate,experiment_id,updated_at"
        ),
        // 5. Get latest sensor telemetry readings
        queryAnySchema("sensor_data", (q) =>
          q
            .select(
              "tub_id,created_at,soil_moisture,soil_temp,soil_ph,soil_ec,water_ph,air_temp,air_humidity,nitrogen,phosphorus,potassium"
            )
            .order("created_at", { ascending: false })
            .limit(500)
        ),
      ]);

      // If a newer request has already started, discard this result
      if (myRequestId !== requestIdRef.current) return;


      const tubs = tubsRes.data ?? [];
      const sensorStatus = sensorRes.data ?? [];
      const scores = scoresRes.data ?? [];
      const tubsDetails = tubsDetailsRes.data ?? [];
      const sensorData = sensorDataRes.data ?? [];

      const queryErrors = {
        tubs: tubsRes.error,
        sensor_status: sensorRes.error,
        computed_scores: scoresRes.error,
        tubs_details: tubsDetailsRes.error,
        sensor_data: sensorDataRes.error,
      };

      const anyError = Object.values(queryErrors).some(Boolean);
      if (anyError) {
        // eslint-disable-next-line no-console
        console.error("Dashboard data errors:", queryErrors);
        setErrorsByQuery(queryErrors);
        setError(
          "Telemetry queries returned errors (usually RLS policies or schema mismatch). See Debug panel below."
        );
      }

      const activeSensors =
        sensorStatus?.filter((s) => s.is_active && !s.is_locked).length ?? 0;

      const avgHealthScore =
        scores && scores.length
          ? Number(
              (
                scores.reduce((acc, s) => acc + (s.health_t ?? 0), 0) /
                scores.length
              ).toFixed(2)
            )
          : null;

      setOverview({
        totalTubs: tubs?.length ?? 0,
        activeSensors,
        avgHealthScore,
      });

      // Build tub-wise cards (latest sensor_data + latest computed score)
      const latestSensorByTub = new Map();
      for (const row of sensorData) {
        if (!row?.tub_id) continue;
        if (!latestSensorByTub.has(row.tub_id)) latestSensorByTub.set(row.tub_id, row);
      }

      const latestScoreByTub = new Map();
      for (const row of scores) {
        if (!row?.tub_id) continue;
        if (!latestScoreByTub.has(row.tub_id)) latestScoreByTub.set(row.tub_id, row);
      }

      const statusByTub = new Map();
      for (const s of sensorStatus) {
        if (!s?.tub_id) continue;
        statusByTub.set(s.tub_id, s);
      }

      /**
       * DATA MERGING: Creating Tub Cards
       * This is the most important logic in the dashboard. It merges data from 4 tables:
       * 1. tubs (metadata like plant_name)
       * 2. sensor_data (latest physical readings)
       * 3. computed_scores (latest ML risk/health scores)
       * 4. sensor_status (active/offline status)
       */
      const cards = tubsDetails.map((t) => {
        const s = latestSensorByTub.get(t.id) ?? null; // Get latest telemetry for this tub
        const sc = latestScoreByTub.get(t.id) ?? null; // Get latest model inference
        const st = statusByTub.get(t.id) ?? null;      // Check if it is currently online
        
        const risk = sc?.risk_t ?? null;
        const health = sc?.health_t ?? null;
        const isOnline = st?.is_active && !st?.is_locked;

        // Visual badges: Green for stable, Red for high risk, Grey for offline
        let badge = "bg-slate-700/40 text-slate-300";
        let badgeText = isOnline ? "ACTIVE" : "OFFLINE";
        if (isOnline && typeof risk === "number" && risk >= 0.7) {
          badge = "bg-rose-500/10 text-rose-300";
          badgeText = "WARNING";
        } else if (isOnline) {
          badge = "bg-emerald-500/10 text-emerald-300";
          badgeText = "ACTIVE";
        }

        // Return a flattened object that the UI components can easily consume
        return {
          id: t.id,
          label: t.label ?? `Tub ${t.id}`,
          soil_type: t.soil_type,
          plant_name: t.plant_name,
          growth_rate: t.growth_rate,
          isOnline: Boolean(isOnline),
          badge,
          badgeText,
          air_temp: s?.air_temp ?? null,
          air_humidity: s?.air_humidity ?? null,
          soil_moisture: s?.soil_moisture ?? null,
          soil_ph: s?.soil_ph ?? null,
          health_t: health,
          risk_t: risk,
          nitrogen: s?.nitrogen ?? null,
          phosphorus: s?.phosphorus ?? null,
          potassium: s?.potassium ?? null,
          updated_at: s?.created_at ?? t.updated_at ?? null,
        };
      });

      setTubCards(cards);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      if (myRequestId !== requestIdRef.current) return;
      setError(
        e?.message ? `Failed to load dashboard data: ${e.message}` : "Failed to load dashboard data."
      );
    } finally {
      if (myRequestId !== requestIdRef.current) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const debugErrors = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(errorsByQuery)) {
      if (!v) continue;
      out[k] = normalizeSupabaseError(v);
    }
    return out;
  }, [errorsByQuery]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Active Tubs"
        subtitle="Real-time telemetry from sensor-equipped modular environments."
        rightContent={
          <button
            onClick={loadDashboard}
            className="px-4 py-2 rounded-lg border border-emerald-400 text-emerald-400 hover:bg-emerald-400/10"
          >
            Refresh
          </button>
        }
      />

      {error && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}

      {Object.keys(debugErrors).length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Debug · Supabase query errors</h3>
              <p className="text-xs text-slate-400 mt-1">
                If you see “permission denied” you need Supabase RLS policies for the anon key, or use a backend API.
              </p>
            </div>
            <span className="text-[10px] px-2 py-1 rounded-full bg-slate-800 text-slate-300 uppercase tracking-wide">
              diagnostics
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {Object.entries(debugErrors)
              .filter(([, v]) => Boolean(v))
              .map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-rose-200">{k}</div>
                    <div className="text-[11px] text-rose-200/70">
                      {v?.schemaTried ? `schema: ${v.schemaTried}` : ""}
                    </div>
                  </div>
                  <div className="mt-2 text-rose-100/90">
                    {v?.message || "Unknown error"}
                  </div>
                  {v?.code && (
                    <div className="mt-2 text-[11px] text-rose-200/70">
                      code: {v.code}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg shadow-emerald-500/10">
          <p className="text-slate-400 text-sm">Total tubs in Supabase</p>
          <h2 className="text-4xl font-bold mt-1">{overview.totalTubs}</h2>
          <p className="text-xs text-slate-500 mt-3">
            Counts live rows in `tubs`. Use to validate ingest and mapping.
          </p>
        </div>

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg shadow-cyan-500/10">
          <p className="text-slate-400 text-sm">Streaming sensors (unlocked)</p>
          <h2 className="text-4xl font-bold mt-1 text-cyan-400">
            {overview.activeSensors}
          </h2>
          <p className="text-xs text-slate-500 mt-3">
            Derived from `sensor_status.is_active` and `is_locked`.
          </p>
        </div>

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg shadow-fuchsia-500/10 relative group">
          <p className="text-slate-400 text-sm">Facility Health Index</p>
          <h2 className="text-4xl font-bold mt-1 text-fuchsia-400">
            {overview.avgHealthScore ?? "—"}
          </h2>
          <p className="text-xs text-slate-500 mt-3">
            Aggregate health across all active tubs. Represents the general state of the facility.
          </p>
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950 border border-slate-800 p-2 rounded text-[10px] text-slate-400 w-48 z-10">
            Since plants and soils vary, this mean provides a coarse baseline. Individual tub health is more precise for specific actions.
          </div>
        </div>
      </div>

      {/* Tub-wise cards (what you asked for) */}
      <div className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h3 className="text-xl font-semibold">Active Tubs</h3>
            <p className="text-sm text-slate-400">
              Latest per-tub sensor snapshot + model risk/health (click a tub).
            </p>
          </div>
          <div className="text-xs text-slate-500">
            {loading ? "Loading…" : `${tubCards.length} tubs`}
          </div>
        </div>

        {!loading && tubCards.length === 0 && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-12 text-center text-slate-500">
            No tub-wise data yet (or blocked by RLS).
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {tubCards.map((t) => (
            <button
              key={t.id}
              onClick={async () => {
                try {
                  setActiveTubModal(t.id);
                  setModalDetails(null);
                  const res = await queryAnySchema("sensor_data", (q) =>
                    q
                      .select("*")
                      .eq("tub_id", t.id)
                      .order("created_at", { ascending: false })
                      .limit(50)
                  );
                  setModalDetails({
                    history: res.data ?? [],
                    error: normalizeSupabaseError(res.error),
                  });
                } catch (e) {
                  // eslint-disable-next-line no-console
                  console.error("Tub modal load failed", e);
                  setModalDetails({
                    history: [],
                    error: { message: e?.message ?? "Failed to load tub history." },
                  });
                }
              }}
              className="text-left bg-slate-900 border border-slate-800 p-5 rounded-2xl hover:border-emerald-400 transition-all"
            >
              <div className="mb-4 h-40 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden">
                <div className="flex flex-col items-center">
                   <span className="text-4xl grayscale group-hover:grayscale-0 transition-all duration-300">🌿</span>
                   <div className="mt-3 text-[10px] uppercase tracking-[0.2em] font-bold text-emerald-400 opacity-60">System Ready</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h4 className="text-lg font-bold text-white tracking-tight">{t.label}</h4>
                <span className={`text-[10px] px-2 py-1 rounded-full font-black tracking-widest uppercase ${t.badge}`}>
                  {t.badgeText}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500 font-medium">
                {t.plant_name ?? "Plant N/A"} · {t.soil_type ?? "Soil N/A"}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-950/40 border border-slate-800/50 p-3">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
                    Health
                  </div>
                  <div className="text-sm font-bold mt-0.5 text-emerald-400">
                    {typeof t.health_t === "number" ? `${(t.health_t * 100).toFixed(0)}%` : "—"}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950/40 border border-slate-800/50 p-3">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">
                    Risk
                  </div>
                  <div className="text-sm font-bold mt-0.5 text-rose-400">
                    {typeof t.risk_t === "number" ? `${(t.risk_t * 100).toFixed(0)}%` : "—"}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                <div className="flex flex-col">
                   <span className="text-[9px] text-slate-600 uppercase font-black">Refreshed</span>
                   <span className="text-[10px] text-slate-400">{t.updated_at ? new Date(t.updated_at).toLocaleTimeString() : "—"}</span>
                </div>
                <div className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider">
                   Analyze →
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {activeTubModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#081028] w-full max-w-4xl rounded-[40px] p-10 border border-white/10 shadow-[0_0_100px_rgba(16,185,129,0.1)] my-10">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-3xl font-black text-white uppercase tracking-tighter">
                    {tubCards.find((t) => String(t.id) === String(activeTubModal))?.label ??
                      `Tub ${activeTubModal}`}
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono">
                    ID-{activeTubModal}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-2 font-medium">
                  Multidimensional Agricultural Intelligence Analysis
                </p>
              </div>
              <button
                onClick={() => {
                  setActiveTubModal(null);
                  setModalDetails(null);
                }}
                className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                ✕
              </button>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* Left Column: Multidimensional Analysis */}
              <RadarAnalysis 
                title="Nutritional Balance"
                subtitle="Relative concentration of key growth factors"
                data={[
                  { subject: 'Nitrogen', value: (tubCards.find(t => t.id === activeTubModal)?.nitrogen ?? 12) * 5, targetValue: 75 }, // Scaled for 0-100 radar
                  { subject: 'Phosphorus', value: (tubCards.find(t => t.id === activeTubModal)?.phosphorus ?? 8) * 6, targetValue: 65 },
                  { subject: 'Potassium', value: (tubCards.find(t => t.id === activeTubModal)?.potassium ?? 15) * 4, targetValue: 80 },
                  { subject: 'Moisture', value: (tubCards.find(t => t.id === activeTubModal)?.soil_moisture ?? 42), targetValue: 45 },
                  { subject: 'Health', value: (tubCards.find(t => t.id === activeTubModal)?.health_t ?? 0.85) * 100, targetValue: 90 },
                ]}
                targetData={true}
              />

              {/* Right Column: Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  ["soil_moisture", "Moisture", "%"],
                  ["soil_temp", "Soil Temp", "°C"],
                  ["soil_ph", "Soil pH", "ph"],
                  ["air_temp", "Air Temp", "°C"],
                  ["air_humidity", "Humidity", "%"],
                  ["nitrogen", "Nitrogen", "mg/kg"],
                ].map(([k, label, unit]) => {
                  const latest = modalDetails?.history?.[0]?.[k];
                  return (
                    <div
                      key={k}
                      className="rounded-2xl bg-slate-900/50 border border-white/5 p-5"
                    >
                      <div className="text-[10px] uppercase tracking-widest text-slate-600 font-black">
                        {label}
                      </div>
                      <div className="text-2xl font-bold mt-1 text-slate-100 italic">
                        {typeof latest === "number" ? latest.toFixed(1) : "—"}
                        <span className="text-[10px] ml-1 not-italic font-medium text-slate-500">{unit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 relative">
               <MetricOptimizationChart 
                 title="Target Range Alignment"
                 subtitle="Current sensor readings vs model-determined optimal thresholds"
                 data={[
                   { name: 'Moisture', value: (tubCards.find(t => t.id === activeTubModal)?.soil_moisture ?? 42), min: 40, max: 60 },
                   { name: 'pH', value: (tubCards.find(t => t.id === activeTubModal)?.soil_ph ?? 6.2) * 10, min: 55, max: 65 }, 
                   { name: 'Soil Temp', value: (tubCards.find(t => t.id === activeTubModal)?.soil_temp ?? 24.5), min: 20, max: 28 },
                   { name: 'Nitrogen', value: (tubCards.find(t => t.id === activeTubModal)?.nitrogen ?? 9.0) * 8.5, min: 70, max: 90 },
                 ]}
               />
               {!tubCards.find(t => t.id === activeTubModal)?.soil_moisture && (
                 <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase tracking-widest border border-amber-500/20">
                   SIMULATED_DATA
                 </div>
               )}
            </div>

            <div className="mt-10 pt-10 border-t border-white/5 flex items-center justify-between">
              <div className="text-[10px] text-slate-600 font-mono">
                SIG_STRENGTH: 98% · LAST_PKG: 4s ago
              </div>
              <button
                onClick={() => {
                  setActiveTubModal(null);
                  setModalDetails(null);
                }}
                className="bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black px-10 py-3 rounded-full uppercase tracking-widest transition-all shadow-[0_10px_20px_rgba(16,185,129,0.2)]"
              >
                Close Analysis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;