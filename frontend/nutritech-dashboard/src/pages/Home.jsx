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
import { loadThresholds } from "./Thresholds.jsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

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
  const [experiments, setExperiments] = useState([]);
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
        experimentsRes,
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
        // 6. Experiment titles for cross-experiment comparison
        fromAnySchema("experiments", "id,title,status"),
      ]);

      // If a newer request has already started, discard this result
      if (myRequestId !== requestIdRef.current) return;

      const tubs = tubsRes.data ?? [];
      const sensorStatus = sensorRes.data ?? [];
      const scores = scoresRes.data ?? [];
      const tubsDetails = tubsDetailsRes.data ?? [];
      const sensorData = sensorDataRes.data ?? [];
      const experimentsData = experimentsRes.data ?? [];
      setExperiments(experimentsData);

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
          experiment_id: t.experiment_id ?? null,
          soil_type: t.soil_type,
          plant_name: t.plant_name,
          growth_rate: t.growth_rate,
          isOnline: Boolean(isOnline),
          badge,
          badgeText,
          air_temp: s?.air_temp ?? null,
          air_humidity: s?.air_humidity ?? null,
          soil_moisture: s?.soil_moisture ?? null,
          soil_temp: s?.soil_temp ?? null,
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

  /**
   * CROSS-EXPERIMENT COMPARISON
   * Groups tub cards by experiment_id and computes average sensor metrics per experiment.
   * Powers the grouped bar chart for the ML Dashboard comparison panel.
   */
  const experimentComparisonData = useMemo(() => {
    const expMap = new Map(experiments.map(e => [e.id, e.title ?? `Exp ${e.id}`]));
    const grouped = new Map();
    for (const card of tubCards) {
      const expId = card.experiment_id;
      if (!expId) continue;
      if (!grouped.has(expId)) grouped.set(expId, []);
      grouped.get(expId).push(card);
    }
    return Array.from(grouped.entries()).map(([expId, cards]) => {
      const avg = (key) => {
        const vals = cards.map(c => c[key]).filter(v => typeof v === 'number');
        return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
      };
      return {
        name: expMap.get(expId) ?? `Exp ${expId}`,
        tubCount: cards.length,
        soil_ph: avg('soil_ph'),
        soil_moisture: avg('soil_moisture'),
        soil_temp: avg('soil_temp'),
        nitrogen: avg('nitrogen'),
        health_t: avg('health_t') !== null ? +(avg('health_t') * 100).toFixed(1) : null,
        risk_t: avg('risk_t') !== null ? +(avg('risk_t') * 100).toFixed(1) : null,
      };
    });
  }, [tubCards, experiments]);

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 fade-in">
        {[
          { label: "Total Tubs",     value: overview.totalTubs,      color: "#10b981", icon: "\u25a6", sub: "Live rows in tubs table" },
          { label: "Active Sensors", value: overview.activeSensors,  color: "#06b6d4", icon: "\u25ce", sub: "Unlocked & streaming" },
          { label: "Facility Health",
            value: overview.avgHealthScore !== null ? `${(overview.avgHealthScore * 100).toFixed(0)}%` : "—",
            color: "#8b5cf6", icon: "\u25c8", sub: "Avg across all active tubs" },
        ].map(({ label, value, color, icon, sub }, i) => (
          <div key={label}
            className={`glass stat-card rounded-2xl p-6 fade-in fade-in-delay-${i}`}
            style={{ borderColor: `${color}18` }}>
            <div className="flex items-center justify-between mb-4">
              <span style={{ fontSize: 22, color, fontWeight: 900 }}>{icon}</span>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
            </div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800, color }}>{label}</div>
            <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1, color, marginTop: 4 }}>{value}</div>
            <p style={{ fontSize: 11, color: "#475569", marginTop: 10, lineHeight: 1.5 }}>{sub}</p>
          </div>
        ))}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {tubCards.map((t, i) => {
            const riskHigh = typeof t.risk_t === "number" && t.risk_t >= 0.7;
            const accentColor = riskHigh ? "#f43f5e" : t.isOnline ? "#10b981" : "#475569";
            return (
              <button
                key={t.id}
                onClick={async () => {
                  try {
                    setActiveTubModal(t.id);
                    setModalDetails(null);
                    const res = await queryAnySchema("sensor_data", (q) =>
                      q.select("*").eq("tub_id", t.id).order("created_at", { ascending: false }).limit(50)
                    );
                    setModalDetails({ history: res.data ?? [], error: normalizeSupabaseError(res.error) });
                  } catch (e) {
                    setModalDetails({ history: [], error: { message: e?.message ?? "Failed to load tub history." } });
                  }
                }}
                className={`tub-card text-left rounded-2xl p-0 overflow-hidden fade-in fade-in-delay-${Math.min(i, 3)}`}
                style={{
                  background: "rgba(10,22,40,0.7)",
                  border: `1px solid ${accentColor}22`,
                  backdropFilter: "blur(12px)",
                  padding: 0,
                }}
              >
                {/* Accent top bar */}
                <div style={{ height: 3, background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />

                {/* Plant preview */}
                <div style={{
                  margin: "16px 16px 0",
                  height: 140,
                  borderRadius: 14,
                  background: `linear-gradient(135deg, rgba(2,11,24,0.9) 0%, ${accentColor}10 100%)`,
                  border: `1px solid ${accentColor}18`,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 8,
                  position: "relative", overflow: "hidden",
                }}>
                  {/* Glow blob */}
                  <div style={{
                    position: "absolute", width: 80, height: 80,
                    borderRadius: "50%", background: accentColor,
                    opacity: 0.08, filter: "blur(24px)",
                  }} />
                  <span style={{ fontSize: 36, filter: "drop-shadow(0 0 12px rgba(16,185,129,0.4))" }}>🌿</span>
                  <div style={{
                    fontSize: 9, letterSpacing: "0.2em", fontWeight: 900,
                    color: accentColor, textTransform: "uppercase", opacity: 0.8,
                  }}>System Ready</div>
                  {/* Live pulse dot for online tubs */}
                  {t.isOnline && (
                    <div style={{
                      position: "absolute", top: 10, right: 10,
                      width: 8, height: 8, borderRadius: "50%",
                      background: "#10b981",
                      boxShadow: "0 0 0 0 rgba(16,185,129,0.4)",
                      animation: "ping 1.8s cubic-bezier(0,0,0.2,1) infinite",
                    }} />
                  )}
                </div>

                {/* Content */}
                <div style={{ padding: "14px 16px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <h4 style={{ fontSize: 15, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", margin: 0 }}>{t.label}</h4>
                    <span style={{
                      fontSize: 9, padding: "3px 8px", borderRadius: 99, fontWeight: 900,
                      letterSpacing: "0.1em", textTransform: "uppercase",
                      background: `${accentColor}15`, color: accentColor, border: `1px solid ${accentColor}30`,
                    }}>{t.badgeText}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>
                    {t.plant_name ?? "Plant N/A"} · {t.soil_type ?? "Soil N/A"}
                  </div>

                  {/* Metrics row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {[
                      { label: "Health", val: typeof t.health_t === "number" ? `${(t.health_t * 100).toFixed(0)}%` : "—", color: "#10b981" },
                      { label: "Risk", val: typeof t.risk_t === "number" ? `${(t.risk_t * 100).toFixed(0)}%` : "—", color: riskHigh ? "#f43f5e" : "#f59e0b" },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{
                        borderRadius: 10, padding: "8px 10px",
                        background: `${color}0a`, border: `1px solid ${color}18`,
                      }}>
                        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "#475569", fontWeight: 700 }}>{label}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 1, fontFamily: "JetBrains Mono, monospace" }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#334155", textTransform: "uppercase", fontWeight: 900 }}>Refreshed</div>
                      <div style={{ fontSize: 10, color: "#64748b" }}>{t.updated_at ? new Date(t.updated_at).toLocaleTimeString() : "—"}</div>
                    </div>
                    <div style={{
                      padding: "5px 12px", borderRadius: 8, fontSize: 10, fontWeight: 800,
                      background: `${accentColor}15`, color: accentColor,
                      border: `1px solid ${accentColor}25`, letterSpacing: "0.05em",
                    }}>Analyze →</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Cross-Experiment Comparison ─────────────────────────────── */}
      {experimentComparisonData.length >= 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold">Cross-Experiment Comparison</h3>
            <p className="text-sm text-slate-400 mt-1">
              Average sensor readings &amp; ML scores per experiment — spot which conditions produce better outcomes.
            </p>
          </div>

          {/* KPI cards per experiment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {experimentComparisonData.map((exp) => (
              <div key={exp.name} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 hover:border-emerald-500/30 transition-all">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1">{exp.tubCount} Tub{exp.tubCount !== 1 ? 's' : ''}</div>
                <div className="text-base font-bold text-white truncate">{exp.name}</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { label: 'Health', val: exp.health_t !== null ? `${exp.health_t}%` : '—', color: 'text-emerald-400' },
                    { label: 'Risk', val: exp.risk_t !== null ? `${exp.risk_t}%` : '—', color: 'text-rose-400' },
                    { label: 'pH', val: exp.soil_ph ?? '—', color: 'text-cyan-400' },
                    { label: 'Moisture', val: exp.soil_moisture !== null ? `${exp.soil_moisture}%` : '—', color: 'text-blue-400' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="rounded-lg bg-slate-950/50 p-2">
                      <div className="text-[9px] text-slate-500 uppercase">{label}</div>
                      <div className={`text-sm font-bold font-mono ${color}`}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Grouped bar chart */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
            <h4 className="text-sm font-semibold text-slate-300 mb-4">Avg Metrics by Experiment</h4>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={experimentComparisonData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                  <Bar dataKey="soil_ph" name="Soil pH" fill="#06b6d4" radius={[4,4,0,0]} />
                  <Bar dataKey="soil_moisture" name="Moisture %" fill="#3b82f6" radius={[4,4,0,0]} />
                  <Bar dataKey="nitrogen" name="Nitrogen" fill="#8b5cf6" radius={[4,4,0,0]} />
                  <Bar dataKey="health_t" name="Health %" fill="#10b981" radius={[4,4,0,0]} />
                  <Bar dataKey="risk_t" name="Risk %" fill="#ef4444" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-slate-600 mt-3 font-mono">
              SOURCE: experiment.tubs → public.sensor_data + ml.computed_scores · Averaged per linked tub
            </p>
          </div>
        </div>
      )}

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
               {(() => {
                 const tub = tubCards.find(t => t.id === activeTubModal);
                 const th = loadThresholds();
                 const chartData = [
                   { name: 'Moisture', value: tub?.soil_moisture ?? null, min: th.soil_moisture?.min, max: th.soil_moisture?.max },
                   { name: 'Soil pH', value: tub?.soil_ph ?? null, min: th.soil_ph?.min, max: th.soil_ph?.max },
                   { name: 'Soil Temp', value: tub?.soil_temp ?? null, min: th.soil_temp?.min, max: th.soil_temp?.max },
                   { name: 'Nitrogen', value: tub?.nitrogen ?? null, min: th.nitrogen?.min, max: th.nitrogen?.max },
                   { name: 'Air Humidity', value: tub?.air_humidity ?? null, min: th.air_humidity?.min, max: th.air_humidity?.max },
                 ].filter(d => d.value !== null);
                 return (
                   <MetricOptimizationChart 
                     title="Target Range Alignment"
                     subtitle="Current sensor readings vs your configured optimal thresholds"
                     data={chartData}
                   />
                 );
               })()}
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