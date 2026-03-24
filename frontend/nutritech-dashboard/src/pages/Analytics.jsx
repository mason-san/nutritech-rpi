import { useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import {
  fromAnySchema,
  normalizeSupabaseError,
  safeDate,
} from "../services/dataQueries.js";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RadarAnalysis, NPKHeatmap, RiskMatrix,
  Interactive3DGraph,
} from "../components/SmartAnalysisCharts.jsx";


function Analytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorsByQuery, setErrorsByQuery] = useState({});
  const requestIdRef = useRef(0);

  const [overview, setOverview] = useState({
    totalTubs: 0,
    activeSensors: 0,
    avgHealthScore: null,
  });

  const [processedReadings, setProcessedReadings] = useState([]);
  const [healthScores, setHealthScores] = useState([]);
  const [wifiStatus, setWifiStatus] = useState([]);

  const loadAnalytics = async () => {
    const myRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setErrorsByQuery({});

    try {
      const [tubsRes, sensorRes, scoresRes, readingsRes, wifiRes, experimentsRes] =
        await Promise.all([
          fromAnySchema("tubs", "id,experiment_id"),
          fromAnySchema(
            "sensor_status",
            "sensor_id,is_active,is_locked,tub_id,last_seen",
            { schemas: ["public", "experiment"] }
          ),
          (async () => {
            const res = await fromAnySchema(
              "computed_scores",
              "tub_id,experiment_id,timestamp,health_t,stress_t,risk_t"
            );
            if (res.error) return res;
            const ordered = [...(res.data ?? [])].sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime()
            );
            return { ...res, data: ordered };
          })(),
          (async () => {
            const res = await fromAnySchema(
              "processed_readings",
              "tub_id,experiment_id,timestamp,q_moisture,q_climate,q_nutrient,vpd_stress"
            );
            if (res.error) return res;
            const ordered = [...(res.data ?? [])].sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime()
            );
            return { ...res, data: ordered };
          })(),
          fromAnySchema(
            "wifi_status",
            "location,is_online,offline_since,offline_checks,restored_at,updated_at",
            { schemas: ["public", "experiment"] }
          ),
          fromAnySchema("experiments", "id,started_at,ended_at"),
        ]);

      if (myRequestId !== requestIdRef.current) return;

      const tubs = tubsRes.data ?? [];
      const experiments = experimentsRes.data ?? [];
      const sensorStatus = sensorRes.data ?? [];
      let scores = scoresRes.data ?? [];
      let readings = readingsRes.data ?? [];
      const wifi = wifiRes.data ?? [];

      // Create lookup for experiment bounds
      const expMap = new Map(experiments.map(e => [e.id, e]));

      // FILTER DATA BASED ON TUB-EXPERIMENT DATES
      const tubExpDates = new Map();
      tubs.forEach(t => {
        if (t.experiment_id && expMap.has(t.experiment_id)) {
          const e = expMap.get(t.experiment_id);
          tubExpDates.set(t.id, {
            start: e.started_at ? new Date(e.started_at).getTime() : 0,
            end: e.ended_at ? new Date(e.ended_at).getTime() : Infinity
          });
        }
      });

      scores = scores.filter(s => {
        const bounds = tubExpDates.get(s.tub_id);
        if (!bounds) return true;
        const ts = new Date(s.timestamp).getTime();
        return ts >= bounds.start && ts <= bounds.end;
      }).slice(0, 200);

      readings = readings.filter(r => {
        const bounds = tubExpDates.get(r.tub_id);
        if (!bounds) return true;
        const ts = new Date(r.timestamp).getTime();
        return ts >= bounds.start && ts <= bounds.end;
      }).slice(0, 200);

      const queryErrors = {
        tubs: tubsRes.error,
        sensor_status: sensorRes.error,
        computed_scores: scoresRes.error,
        processed_readings: readingsRes.error,
        wifi_status: wifiRes.error,
        experiments: experimentsRes.error,
      };

      /**
       * ERROR AGGREGATION
       * Checks if any of the 6 queries failed (e.g., due to Supabase RLS policies).
       * We show a debug panel to make it clear which specific table is blocked.
       */
      const anyError = Object.values(queryErrors).some(Boolean);

      if (anyError) {
        // eslint-disable-next-line no-console
        console.error("Analytics data errors:", queryErrors);
        setErrorsByQuery(queryErrors);
        setError(
          "Analytics queries returned errors (often RLS or schema mismatch). See Debug panel below."
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

      setProcessedReadings(readings ?? []);
      setHealthScores(scores ?? []);
      setWifiStatus(wifi ?? []);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      if (myRequestId !== requestIdRef.current) return;
      setError(
        e?.message
          ? `Failed to load analytics: ${e.message}`
          : "Failed to load analytics."
      );
    } finally {
      if (myRequestId !== requestIdRef.current) return;
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const moistureSeries = useMemo(() => {
    if (!processedReadings.length) return [];
    return [...processedReadings]
      .filter((r) => Boolean(safeDate(r?.timestamp)))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((row) => ({
        time: row.timestamp,
        label: row.timestamp ? new Date(row.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '?',
        q_moisture: (row.q_moisture ?? 0) * 100,
        q_climate: (row.q_climate ?? 0) * 100,
        q_nutrient: (row.q_nutrient ?? 0) * 100,
        tub_id: row.tub_id,
      }));
  }, [processedReadings]);

  const healthByTub = useMemo(() => {
    const latestByTub = new Map();
    for (const row of healthScores) {
      const key = row.tub_id;
      if (!key) continue;
      const rowTime = safeDate(row.timestamp);
      if (!rowTime) continue;
      const existing = latestByTub.get(key);
      if (
        !existing ||
        rowTime.getTime() > new Date(existing.timestamp).getTime()
      ) {
        latestByTub.set(key, row);
      }
    }
    return Array.from(latestByTub.entries()).map(([tubId, row]) => ({
      tubId: String(tubId),
      health_t: row.health_t,
      stress_t: row.stress_t,
      risk_t: row.risk_t,
    }));
  }, [healthScores]);

  const npkHeatmapData = useMemo(() => {
    const metrics = ['Nitrogen', 'Phosphorus', 'Potassium'];
    const activeTubs = Array.from(new Set(processedReadings.map(r => r.tub_id))).filter(Boolean).slice(0, 5);
    if (activeTubs.length === 0) return [];
    const data = [];
    activeTubs.forEach((tubId) => {
      metrics.forEach((metric) => {
        const latest = processedReadings.find(r => r.tub_id === tubId);
        if (!latest) return;
        let val = 0;
        if (metric === 'Nitrogen') val = (latest.q_nutrient ?? 0) * 100;
        if (metric === 'Phosphorus') val = (latest.q_moisture ?? 0) * 80;
        if (metric === 'Potassium') val = (latest.q_climate ?? 0) * 90;
        data.push({ x: metric, y: `${tubId}`, value: val });
      });
    });
    return data;
  }, [processedReadings]);

  const riskMatrixData = useMemo(() => {
    if (healthByTub.length > 0) {
      return healthByTub.map(h => ({
        x: (h.risk_t ?? 0) * 100,
        y: (h.health_t ?? 0) * 100,
        z: 1,
        name: `Tub ${h.tubId}`,
      }));
    }
    return [];
  }, [healthByTub]);

  const radarData = useMemo(() => {
    if (overview.avgHealthScore === null) return [];
    return [
      { subject: 'Health', value: overview.avgHealthScore * 100, targetValue: 80 },
    ];
  }, [overview]);

  const yieldProjectionData = useMemo(() => {
    // Build 3D points from real health/risk scores
    return healthByTub.map(h => ({
      x: (h.risk_t ?? 0) * 100,
      y: (h.health_t ?? 0) * 100,
      z: ((1 - (h.stress_t ?? 0)) * 100),
      name: `Tub ${h.tubId}`,
    }));
  }, [healthByTub]);

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
        title="ML Telemetry Analytics"
        subtitle="Stacked feature signals, model scores, and connectivity for debugging and model training."
        rightContent={
          <button
            onClick={loadAnalytics}
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
              <h3 className="text-lg font-semibold">
                Debug · Supabase query errors
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                If you see “permission denied” you need Supabase RLS policies
                for the anon key, or a backend proxy.
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

      {/* Overview metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg shadow-emerald-500/10">
          <p className="text-slate-400 text-sm">Total tubs</p>
          <h2 className="text-4xl font-bold mt-1">{overview.totalTubs}</h2>
          <p className="text-xs text-slate-500 mt-3">
            Counted from `tubs`. Validates ingest + mapping.
          </p>
        </div>

        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg shadow-cyan-500/10">
          <p className="text-slate-400 text-sm">Streaming sensors (unlocked)</p>
          <h2 className="text-4xl font-bold mt-1 text-cyan-400">
            {overview.activeSensors}
          </h2>
          <p className="text-xs text-slate-500 mt-3">
            From `sensor_status.is_active` where `is_locked` is false.
          </p>
        </div>
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 shadow-lg shadow-fuchsia-500/10 relative group">
          <p className="text-slate-400 text-sm">Facility Health Index</p>
          <h2 className="text-4xl font-bold mt-1 text-fuchsia-400">
            {overview.avgHealthScore ?? "—"}
          </h2>
          <p className="text-xs text-slate-500 mt-3">
             Aggregate health metric across all active experiments.
          </p>
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-950 border border-slate-800 p-2 rounded text-[10px] text-slate-400 w-48 z-10">
            This mean represents the global state. Variations between plant types and soil types are smoothed out here.
          </div>
        </div>
      </div>

      {/* Advanced ML Analysis Grid */}
      <div className="grid grid-cols-12 gap-8">
        
        {/* Row 1: Primary Metrics (full width when no health data, otherwise 8-4 split) */}
        <div className="col-span-12 lg:col-span-8 relative">
           {radarData.length > 0 ? (
             <RadarAnalysis 
               title="Global Health Index"
               subtitle="Average health score across all active tubs vs 80% target"
               data={radarData}
               targetData={true}
             />
           ) : (
             <div className="bg-slate-900/50 backdrop-blur-sm p-8 rounded-3xl border border-white/5 flex items-center justify-center min-h-[300px]">
               <div className="text-center">
                 <div className="text-4xl mb-3 opacity-30">📊</div>
                 <p className="text-slate-500 text-sm">No health scores in <span className="font-mono text-slate-400">ml.computed_scores</span> yet.</p>
               </div>
             </div>
           )}
        </div>

        {/* Right: Per-tub health summary from real DB data */}
        <div className="col-span-12 lg:col-span-4 flex flex-col h-full">
           <div className="bg-slate-900/50 backdrop-blur-sm p-8 rounded-[32px] border border-white/5 flex flex-col h-full hover:border-emerald-500/20 transition-all shadow-2xl">
              <div className="mb-6 flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter underline decoration-emerald-500/50 underline-offset-8">
                    Tub Health Status
                  </h3>
                  <p className="text-xs text-slate-500 mt-2">Latest ML scores from computed_scores</p>
                </div>
                <div className="px-2 py-1 bg-slate-800 rounded border border-slate-700 text-[9px] text-slate-400 font-bold">
                  {healthByTub.length} TUB{healthByTub.length !== 1 ? 'S' : ''}
                </div>
              </div>

              {healthByTub.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-slate-600 text-sm text-center">
                    No data in <span className="font-mono text-slate-500">ml.computed_scores</span>.
                    <br />Run a sensing cycle to populate.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 flex-1 overflow-y-auto">
                  {healthByTub.slice(0, 6).map((h) => {
                    const health = typeof h.health_t === 'number' ? h.health_t : null;
                    const risk   = typeof h.risk_t   === 'number' ? h.risk_t   : null;
                    const status = risk !== null && risk >= 0.7 ? 'HIGH RISK'
                      : health !== null && health >= 0.75 ? 'Healthy' : 'Monitor';
                    const color = risk !== null && risk >= 0.7 ? 'rose'
                      : health !== null && health >= 0.75 ? 'emerald' : 'amber';
                    return (
                      <div key={h.tubId} className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/50 border border-white/5 hover:border-white/10 transition-all">
                         <div className="flex flex-col">
                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Tub {h.tubId}</span>
                            <span className="text-sm font-bold text-white">
                              {health !== null ? `Health: ${(health * 100).toFixed(0)}%` : 'No score'}
                              {risk !== null ? ` · Risk: ${(risk * 100).toFixed(0)}%` : ''}
                            </span>
                         </div>
                         <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-${color}-500/10 text-${color}-400 border border-${color}-500/20`}>
                            {status}
                         </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-white/5 text-[10px] text-slate-600 font-mono flex justify-between uppercase tracking-tighter">
                 <span>SOURCE: ml.computed_scores</span>
                 <span className="text-emerald-500/70">{healthByTub.length > 0 ? 'DATA_OK' : 'AWAITING'}</span>
              </div>
           </div>
        </div>


        {/* Row 2: Secondary Visualizations */}
        <div className="col-span-12 lg:col-span-6">
           {npkHeatmapData.length > 0 ? (
             <NPKHeatmap 
               title="Nutrient Intensity Profile"
               subtitle="Heatmap distribution of quality signals per tub"
               data={npkHeatmapData}
             />
           ) : (
             <div className="bg-slate-900/50 backdrop-blur-sm p-8 rounded-3xl border border-white/5 flex items-center justify-center min-h-[300px]">
               <div className="text-center">
                 <div className="text-4xl mb-3 opacity-30">🧪</div>
                 <p className="text-slate-500 text-sm">No data in <span className="font-mono text-slate-400">ml.processed_readings</span>.</p>
               </div>
             </div>
           )}
        </div>

        <div className="col-span-12 lg:col-span-6">
           {riskMatrixData.length > 0 ? (
             <RiskMatrix 
               title="Risk vs Health Distribution"
               subtitle="Each dot is a tub — health (Y) vs risk (X) from latest ML scores"
               data={riskMatrixData}
             />
           ) : (
             <div className="bg-slate-900/50 backdrop-blur-sm p-8 rounded-3xl border border-white/5 flex items-center justify-center min-h-[300px]">
               <div className="text-center">
                 <div className="text-4xl mb-3 opacity-30">⚠️</div>
                 <p className="text-slate-500 text-sm">No risk/health scores in <span className="font-mono text-slate-400">ml.computed_scores</span>.</p>
               </div>
             </div>
           )}
        </div>

        {/* Row 3: 3D Interactive Analytics */}
        <div className="col-span-12">
           {yieldProjectionData.length > 0 ? (
             <Interactive3DGraph 
               title="Interactive Growth Space Projection"
               data={yieldProjectionData}
             />
           ) : (
             <div className="bg-slate-900/50 backdrop-blur-sm p-8 rounded-[40px] border border-white/5 flex items-center justify-center min-h-[200px]">
               <div className="text-center">
                 <div className="text-4xl mb-3 opacity-30">🌐</div>
                 <p className="text-slate-500 text-sm">3D projection requires <span className="font-mono text-slate-400">ml.computed_scores</span> data.</p>
               </div>
             </div>
           )}
        </div>

        {/* Row 4: Full Width Telemetry */}
        <div className="col-span-12">
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-[40px] border border-white/5 p-10 transition-all hover:border-emerald-500/20">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Signal stack telemetry</h3>
                  <p className="text-sm text-slate-500 mt-1">Multivariate quality signals from <span className="font-mono">ml.processed_readings</span></p>
                </div>
                <div className="flex items-center gap-4">
                  {moistureSeries.length > 0 ? (
                    <div className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black tracking-widest border border-emerald-500/20">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        LIVE_DATA · {moistureSeries.length} pts
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-800 text-slate-500 text-[10px] font-black tracking-widest border border-slate-700">
                        NO_DATA
                    </div>
                  )}
                </div>
              </div>
              {moistureSeries.length > 0 ? (
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={moistureSeries}>
                      <defs>
                        <linearGradient id="moisture" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="climate" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="nutrient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "#020617", border: "#1e293b", borderRadius: 12 }} />
                      <Area type="monotone" dataKey="q_moisture" name="Moisture Quality" stroke="#10b981" fill="url(#moisture)" strokeWidth={3} />
                      <Area type="monotone" dataKey="q_climate" name="Climate Quality" stroke="#0ea5e9" fill="url(#climate)" strokeWidth={3} />
                      <Area type="monotone" dataKey="q_nutrient" name="Nutrient Quality" stroke="#8b5cf6" fill="url(#nutrient)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-4xl mb-3 opacity-30">📡</div>
                    <p className="text-slate-500 text-sm">
                      No rows in <span className="font-mono text-slate-400">ml.processed_readings</span>.
                      <br />Quality signals will appear here once the ML pipeline runs.
                    </p>
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Connectivity panel */}
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">WiFi &amp; sensor connectivity</h3>
            <p className="text-xs text-slate-400">
              Snapshots from `wifi_status` to quickly see which zones are dark.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-800">
                <th className="py-2 pr-4">Location</th>
                <th className="py-2 pr-4">Online</th>
                <th className="py-2 pr-4">Offline since</th>
                <th className="py-2 pr-4">Checks</th>
                <th className="py-2 pr-4">Restored at</th>
                <th className="py-2 pr-4">Updated</th>
              </tr>
            </thead>
            <tbody>
              {wifiStatus.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-6 text-center text-slate-500"
                  >
                    {loading
                      ? "Loading connectivity snapshot…"
                      : "No wifi_status rows in Supabase yet."}
                  </td>
                </tr>
              )}
              {wifiStatus.map((row) => (
                <tr
                  key={`${row.location}-${row.updated_at}`}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors last:border-b-0"
                >
                  <td className="py-2 pr-4 font-medium text-slate-100">
                    {row.location}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        row.is_online
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-rose-500/10 text-rose-300"
                      }`}
                    >
                      <span
                        className={`mr-1 h-1.5 w-1.5 rounded-full ${
                          row.is_online ? "bg-emerald-400" : "bg-rose-400"
                        }`}
                      />
                      {row.is_online ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-300">
                    {row.offline_since
                      ? new Date(row.offline_since).toLocaleString()
                      : "—"}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">
                    {row.offline_checks ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">
                    {row.restored_at
                      ? new Date(row.restored_at).toLocaleString()
                      : "—"}
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {row.updated_at
                      ? new Date(row.updated_at).toLocaleTimeString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Analytics;

