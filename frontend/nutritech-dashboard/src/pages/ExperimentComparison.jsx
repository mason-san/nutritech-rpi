import { useEffect, useState, useMemo, useCallback } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { fromAnySchema, queryAnySchema, safeDate } from "../services/dataQueries.js";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const EXP_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#a855f7"];

const METRICS = [
  { key: "soil_ph",       label: "Soil pH",     unit: "pH",    scale: 14  },
  { key: "soil_moisture", label: "Moisture",    unit: "%",     scale: 100 },
  { key: "soil_temp",     label: "Soil Temp",   unit: "°C",    scale: 45  },
  { key: "air_temp",      label: "Air Temp",    unit: "°C",    scale: 45  },
  { key: "air_humidity",  label: "Humidity",    unit: "%",     scale: 100 },
  { key: "nitrogen",      label: "Nitrogen",    unit: "mg/kg", scale: 200 },
  { key: "phosphorus",    label: "Phosphorus",  unit: "mg/kg", scale: 100 },
  { key: "potassium",     label: "Potassium",   unit: "mg/kg", scale: 200 },
];

function stats(rows, key) {
  const v = rows.map(r => r[key]).filter(x => typeof x === "number" && !isNaN(x));
  if (!v.length) return null;
  const n = v.length;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / n);
  return { n, mean: +mean.toFixed(3), std: +std.toFixed(3) };
}

function dayLabel(iso) {
  const d = safeDate(iso);
  return d ? d.toLocaleDateString(undefined, { month: "short", day: "2-digit" }) : "";
}

export default function ExperimentComparison() {
  const [experiments, setExperiments] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [expData, setExpData] = useState({});   // { [id]: { title, color, rows } }
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [view, setView] = useState("delta");    // delta | timeline | radar
  const [tlMetric, setTlMetric] = useState("soil_ph");

  // Load experiments list once
  useEffect(() => {
    fromAnySchema("experiments", "id,title,status").then(r => {
      setExperiments(r.data ?? []);
      setLoadingList(false);
    });
  }, []);

  // Fetch sensor rows for selected experiments
  const loadData = useCallback(async (ids) => {
    if (!ids.length) { setExpData({}); return; }
    setLoading(true);
    try {
      const results = await Promise.all(ids.map(async (expId, i) => {
        const exp = experiments.find(e => e.id === expId);
        const tubsRes = await queryAnySchema("tubs", q => q.select("id").eq("experiment_id", expId));
        const tubIds = (tubsRes.data ?? []).map(t => t.id).filter(Boolean);
        if (!tubIds.length) return { expId, title: exp?.title ?? `Exp ${expId}`, color: EXP_COLORS[i], rows: [] };
        const sRes = await queryAnySchema("sensor_data", q =>
          q.select("tub_id,created_at,soil_ph,soil_moisture,soil_temp,air_temp,air_humidity,nitrogen,phosphorus,potassium")
           .in("tub_id", tubIds).order("created_at", { ascending: true }).limit(800)
        );
        return { expId, title: exp?.title ?? `Exp ${expId}`, color: EXP_COLORS[i], rows: sRes.data ?? [] };
      }));
      const next = {};
      results.forEach(r => { next[r.expId] = r; });
      setExpData(next);
    } finally { setLoading(false); }
  }, [experiments]);

  useEffect(() => { loadData(selectedIds); }, [selectedIds, loadData]);

  const toggle = id =>
    setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : p.length < 3 ? [...p, id] : p);

  const getColor = id => expData[id]?.color ?? "#64748b";
  const getTitle = id => expData[id]?.title ?? `Exp ${id}`;
  const getRows  = id => expData[id]?.rows ?? [];

  // ── Parameter delta (Exp B − Exp A)
  const deltaRows = useMemo(() => {
    if (selectedIds.length < 2) return [];
    const [a, b] = selectedIds;
    return METRICS.map(m => {
      const sA = stats(getRows(a), m.key);
      const sB = stats(getRows(b), m.key);
      if (!sA || !sB) return null;
      const delta = +(sB.mean - sA.mean).toFixed(3);
      const pct = sA.mean !== 0 ? +((delta / sA.mean) * 100).toFixed(1) : null;
      return { ...m, meanA: sA.mean, meanB: sB.mean, delta, pct };
    }).filter(Boolean);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expData, selectedIds]);

  // ── Bar chart data (avg per metric per exp)
  const barData = useMemo(() =>
    METRICS.map(m => {
      const row = { metric: m.label };
      selectedIds.forEach(id => { row[id] = stats(getRows(id), m.key)?.mean ?? null; });
      return row;
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [expData, selectedIds]);

  // ── Timeline data (daily avg per exp)
  const tlData = useMemo(() => {
    const buckets = new Map();
    selectedIds.forEach(id => {
      const byDay = new Map();
      getRows(id).forEach(r => {
        const lbl = dayLabel(r.created_at);
        if (!lbl) return;
        if (!byDay.has(lbl)) byDay.set(lbl, []);
        if (typeof r[tlMetric] === "number") byDay.get(lbl).push(r[tlMetric]);
      });
      byDay.forEach((vals, lbl) => {
        if (!buckets.has(lbl)) buckets.set(lbl, { label: lbl });
        buckets.get(lbl)[id] = +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3);
      });
    });
    return Array.from(buckets.values()).sort((a, b) => new Date(a.label) - new Date(b.label));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expData, selectedIds, tlMetric]);

  // ── Radar data (normalized 0-100)
  const radarData = useMemo(() =>
    METRICS.map(m => {
      const row = { subject: m.label, fullMark: 100 };
      selectedIds.forEach(id => {
        const s = stats(getRows(id), m.key);
        row[id] = s ? Math.min(100, +((s.mean / m.scale) * 100).toFixed(1)) : 0;
      });
      return row;
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [expData, selectedIds]);

  const hasData = selectedIds.length >= 2;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Experiment Comparison"
        subtitle="Compare sensor parameters, timeline trends, and multi-metric profiles across experiments."
        rightContent={
          <button onClick={() => loadData(selectedIds)} disabled={loading}
            className="px-4 py-2 rounded-lg border border-emerald-400 text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-40">
            {loading ? "Loading…" : "Refresh"}
          </button>
        }
      />

      {/* ── Experiment Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Select Experiments</h3>
            <p className="text-xs text-slate-500 mt-0.5">Pick 2 or 3 to compare (colour-coded)</p>
          </div>
          {selectedIds.length > 0 && (
            <button onClick={() => setSelectedIds([])}
              className="text-xs text-slate-400 hover:text-white border border-slate-700 px-3 py-1 rounded-lg">
              Clear
            </button>
          )}
        </div>
        {loadingList ? <p className="text-slate-500 text-sm">Loading…</p> : (
          <div className="flex flex-wrap gap-3">
            {experiments.map((exp, i) => {
              const sel = selectedIds.includes(exp.id);
              const ci = selectedIds.indexOf(exp.id);
              const col = sel ? EXP_COLORS[ci] : null;
              return (
                <button key={exp.id} onClick={() => toggle(exp.id)}
                  disabled={!sel && selectedIds.length >= 3}
                  style={col ? { borderColor: col, color: col } : {}}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                    sel ? "bg-white/5" : "border-slate-700 text-slate-400 hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  }`}>
                  {sel && <span className="mr-1">●</span>}
                  {exp.title ?? `Exp ${exp.id}`}
                  <span className={`ml-2 text-[9px] uppercase px-1.5 py-0.5 rounded ${
                    exp.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-700 text-slate-500"
                  }`}>{exp.status ?? "—"}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="text-center py-16 text-slate-500">
          <div className="text-5xl mb-4 opacity-20">🔬</div>
          <p>{selectedIds.length < 1 ? "Select at least 2 experiments to compare." : "Select one more experiment."}</p>
        </div>
      ) : (
        <>
          {/* ── Tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-4">
            {[
              { id: "delta",    label: "\u03b4 Parameter Delta"   },
              { id: "timeline", label: "\u25b3 Timeline Overlay"  },
              { id: "radar",    label: "\u25ce Radar Profile"      },
            ].map(t => (
              <button key={t.id} onClick={() => setView(t.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  view === t.id ? "bg-emerald-500 text-black" : "border border-slate-700 text-slate-400 hover:bg-slate-800"
                }`}>{t.label}</button>
            ))}
            {loading && <span className="ml-auto text-xs text-slate-500 flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"/>Fetching…
            </span>}
          </div>

          {/* ── Legend */}
          <div className="flex flex-wrap gap-5">
            {selectedIds.map(id => (
              <div key={id} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: getColor(id) }}/>
                <span className="text-xs text-slate-200 font-medium">{getTitle(id)}</span>
                <span className="text-[10px] text-slate-500 font-mono">{getRows(id).length} rows</span>
              </div>
            ))}
          </div>

          {/* ══════════════════ PARAMETER DELTA ══════════════════ */}
          {view === "delta" && (
            <div className="space-y-6">
              {/* Grouped bar: raw averages */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-base font-semibold mb-1">Average Values by Experiment</h3>
                <p className="text-xs text-slate-500 mb-4">Grouped bars — one bar per experiment for each sensor metric.</p>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 5, right: 20, left: 0, bottom: 28 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false}/>
                      <XAxis dataKey="metric" tick={{ fill: "#64748b", fontSize: 10 }} angle={-30} textAnchor="end" axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 10, fontSize: 12 }}/>
                      <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 20 }}/>
                      {selectedIds.map(id => (
                        <Bar key={id} dataKey={id} name={getTitle(id)} fill={getColor(id)} radius={[4,4,0,0]} maxBarSize={36}/>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Delta table: B − A */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-base font-semibold mb-1">Parameter Delta</h3>
                <p className="text-xs text-slate-500 mb-4">
                  <span style={{ color: getColor(selectedIds[1]) }}>{getTitle(selectedIds[1])}</span>
                  {" minus "}
                  <span style={{ color: getColor(selectedIds[0]) }}>{getTitle(selectedIds[0])}</span>.
                  {" "}Red badge = &gt;20% difference, amber = &gt;10%.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
                        <th className="py-2 pr-4">Metric</th>
                        <th className="py-2 pr-4" style={{ color: getColor(selectedIds[0]) }}>{getTitle(selectedIds[0])}</th>
                        <th className="py-2 pr-4" style={{ color: getColor(selectedIds[1]) }}>{getTitle(selectedIds[1])}</th>
                        <th className="py-2 pr-4">Δ (B−A)</th>
                        <th className="py-2">Δ%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deltaRows.length === 0 ? (
                        <tr><td colSpan={5} className="py-8 text-center text-slate-500">No overlapping data.</td></tr>
                      ) : deltaRows.map(d => (
                        <tr key={d.key} className="border-b border-slate-800/40 hover:bg-white/[0.02]">
                          <td className="py-2.5 pr-4 font-medium text-white">{d.label}
                            <span className="ml-1.5 text-[10px] text-slate-500">{d.unit}</span>
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-slate-300">{d.meanA}</td>
                          <td className="py-2.5 pr-4 font-mono text-slate-300">{d.meanB}</td>
                          <td className="py-2.5 pr-4">
                            <span className={`font-mono font-bold ${d.delta > 0 ? "text-emerald-400" : d.delta < 0 ? "text-rose-400" : "text-slate-400"}`}>
                              {d.delta > 0 ? "+" : ""}{d.delta}
                            </span>
                          </td>
                          <td className="py-2.5">
                            {d.pct === null ? <span className="text-slate-500">—</span> : (
                              <span className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-bold ${
                                Math.abs(d.pct) > 20 ? "bg-rose-500/10 text-rose-300" :
                                Math.abs(d.pct) > 10 ? "bg-amber-500/10 text-amber-300" :
                                "bg-emerald-500/10 text-emerald-400"
                              }`}>{d.pct > 0 ? "+" : ""}{d.pct}%</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════ TIMELINE OVERLAY ══════════════════ */}
          {view === "timeline" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-base font-semibold">Timeline Overlay</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Daily average per experiment on one chart. Switch metric below.</p>
                </div>
                <select value={tlMetric} onChange={e => setTlMetric(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none">
                  {METRICS.map(m => <option key={m.key} value={m.key}>{m.label} ({m.unit})</option>)}
                </select>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                {tlData.length === 0 ? (
                  <div className="py-16 text-center text-slate-500 text-sm">No timeline data for this metric in the selected experiments.</div>
                ) : (
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={tlData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                        <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false}/>
                        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false}/>
                        <Tooltip contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 10, fontSize: 12 }}/>
                        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}/>
                        {selectedIds.map(id => (
                          <Line key={id} type="monotone" dataKey={id} name={getTitle(id)}
                            stroke={getColor(id)} strokeWidth={3} dot={false} connectNulls/>
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {/* Per-experiment stats strip */}
                <div className="mt-6 pt-5 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {selectedIds.map(id => {
                    const s = stats(getRows(id), tlMetric);
                    return (
                      <div key={id} className="rounded-xl bg-slate-950/50 border border-slate-800 p-4">
                        <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: getColor(id) }}>{getTitle(id)}</div>
                        {!s ? <div className="text-slate-500 text-xs">No data</div> : (
                          <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                            <div><div className="text-slate-500 text-[9px]">Mean</div><div className="text-white font-bold">{s.mean}</div></div>
                            <div><div className="text-slate-500 text-[9px]">Std</div><div className="text-white">{s.std}</div></div>
                            <div><div className="text-slate-500 text-[9px]">n</div><div className="text-white">{s.n}</div></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════ RADAR PROFILE ══════════════════ */}
          {view === "radar" && (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-base font-semibold mb-1">Multi-Parameter Radar</h3>
                <p className="text-xs text-slate-500 mb-4">Each metric normalized to 0–100 relative to biological maximum. Reveals overall experiment profiles at a glance.</p>
                <div className="h-[440px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                      <PolarGrid stroke="#334155"/>
                      <PolarAngleAxis dataKey="subject" tick={{ fill: "#94a3b8", fontSize: 11 }}/>
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false}/>
                      <Tooltip contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 10, fontSize: 12 }}/>
                      <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}/>
                      {selectedIds.map(id => (
                        <Radar key={id} name={getTitle(id)} dataKey={id}
                          stroke={getColor(id)} fill={getColor(id)} fillOpacity={0.18} strokeWidth={2.5}/>
                      ))}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Full comparison table with "best" highlight */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-base font-semibold mb-4">All-Metric Comparison Table</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
                        <th className="py-2 pr-6">Metric</th>
                        {selectedIds.map(id => (
                          <th key={id} className="py-2 pr-4" style={{ color: getColor(id) }}>{getTitle(id)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {METRICS.map(m => {
                        const means = selectedIds.map(id => stats(getRows(id), m.key)?.mean ?? null);
                        const valid = means.filter(v => v !== null);
                        const best = valid.length ? Math.max(...valid) : null;
                        return (
                          <tr key={m.key} className="border-b border-slate-800/40 hover:bg-white/[0.02]">
                            <td className="py-2.5 pr-6 font-medium text-white">
                              {m.label}<span className="ml-1.5 text-[10px] text-slate-500">{m.unit}</span>
                            </td>
                            {means.map((mean, i) => (
                              <td key={i} className="py-2.5 pr-4">
                                <span className={`font-mono ${mean === best && valid.length > 1 ? "text-emerald-400 font-bold" : "text-slate-300"}`}>
                                  {mean ?? "—"}
                                </span>
                                {mean === best && valid.length > 1 && (
                                  <span className="ml-1 text-[9px] text-emerald-500">▲</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
