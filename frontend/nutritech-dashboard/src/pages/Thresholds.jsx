import { useState, useEffect, useCallback } from "react";
import PageHeader from "../components/PageHeader.jsx";
import { queryAnySchema, normalizeSupabaseError } from "../services/dataQueries.js";

/**
 * THRESHOLD DEFINITIONS
 * Central list of all configurable sensor thresholds.
 * Each entry defines the metric key (matching sensor_data column), label, unit,
 * and sensible default min/max values that serve as a starting point.
 */
export const THRESHOLD_METRICS = [
  { key: "soil_ph",      label: "Soil pH",        unit: "pH",    defaultMin: 5.5,  defaultMax: 7.0,  step: 0.1, desc: "Optimal pH for most crops" },
  { key: "soil_moisture",label: "Soil Moisture",  unit: "%",     defaultMin: 35,   defaultMax: 65,   step: 1,   desc: "Volumetric water content" },
  { key: "soil_temp",    label: "Soil Temp",      unit: "°C",    defaultMin: 18,   defaultMax: 28,   step: 0.5, desc: "Root zone temperature" },
  { key: "air_temp",     label: "Air Temp",       unit: "°C",    defaultMin: 20,   defaultMax: 32,   step: 0.5, desc: "Canopy-level air temperature" },
  { key: "air_humidity", label: "Air Humidity",   unit: "%",     defaultMin: 50,   defaultMax: 80,   step: 1,   desc: "Relative humidity" },
  { key: "nitrogen",     label: "Nitrogen (N)",   unit: "mg/kg", defaultMin: 60,   defaultMax: 120,  step: 1,   desc: "Available nitrogen in soil" },
  { key: "phosphorus",   label: "Phosphorus (P)", unit: "mg/kg", defaultMin: 20,   defaultMax: 60,   step: 1,   desc: "Available phosphorus in soil" },
  { key: "potassium",    label: "Potassium (K)",  unit: "mg/kg", defaultMin: 80,   defaultMax: 160,  step: 1,   desc: "Available potassium in soil" },
];

const LS_KEY = "nutritech_thresholds_v1";

/**
 * Load persisted thresholds from localStorage, falling back to defaults.
 */
export function loadThresholds() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with defaults so any new metrics added later get defaults
      const merged = {};
      for (const m of THRESHOLD_METRICS) {
        merged[m.key] = {
          min: parsed[m.key]?.min ?? m.defaultMin,
          max: parsed[m.key]?.max ?? m.defaultMax,
        };
      }
      return merged;
    }
  } catch {
    // ignore parse errors
  }
  // Return defaults
  const defaults = {};
  for (const m of THRESHOLD_METRICS) {
    defaults[m.key] = { min: m.defaultMin, max: m.defaultMax };
  }
  return defaults;
}

function saveThresholds(thresholds) {
  localStorage.setItem(LS_KEY, JSON.stringify(thresholds));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricRow({ metric, values, onChange }) {
  const { key, label, unit, step, desc } = metric;
  const min = values.min;
  const max = values.max;
  const isInverted = min > max;

  return (
    <div className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-5 hover:border-emerald-500/30 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">{label}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">{unit}</span>
            {isInverted && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                ⚠ Min &gt; Max
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Min input */}
          <div className="flex flex-col items-center gap-1">
            <label className="text-[9px] uppercase tracking-widest text-emerald-500 font-black">Min</label>
            <input
              type="number"
              step={step}
              value={min}
              onChange={(e) => onChange(key, "min", parseFloat(e.target.value))}
              className="w-24 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-center text-sm text-slate-100 outline-none focus:border-emerald-500 transition-colors font-mono"
            />
          </div>

          <div className="text-slate-600 text-xs font-bold mt-4">→</div>

          {/* Max input */}
          <div className="flex flex-col items-center gap-1">
            <label className="text-[9px] uppercase tracking-widest text-rose-400 font-black">Max</label>
            <input
              type="number"
              step={step}
              value={max}
              onChange={(e) => onChange(key, "max", parseFloat(e.target.value))}
              className="w-24 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-center text-sm text-slate-100 outline-none focus:border-rose-500 transition-colors font-mono"
            />
          </div>
        </div>
      </div>

      {/* Visual range bar */}
      <div className="mt-4 relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="absolute h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
          style={{
            left: `${Math.max(0, Math.min((min / (metric.defaultMax * 1.5)) * 100, 100))}%`,
            width: `${Math.max(0, Math.min(((max - min) / (metric.defaultMax * 1.5)) * 100, 100))}%`,
          }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-slate-600 mt-1 font-mono">
        <span>0 {unit}</span>
        <span>{metric.defaultMax * 1.5} {unit}</span>
      </div>
    </div>
  );
}

// ─── Suggestion row for "Auto-Suggest" tab ────────────────────────────────────

function SuggestionRow({ metric, suggestion, onApply }) {
  if (!suggestion) return null;
  const { mean, std, count } = suggestion;
  const suggestedMin = +(mean - std * 0.8).toFixed(2);
  const suggestedMax = +(mean + std * 0.8).toFixed(2);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex items-center justify-between gap-4 hover:border-cyan-500/20 transition-all">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{metric.label}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">{metric.unit}</span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Based on <span className="text-cyan-400 font-mono">{count}</span> readings — Mean:{" "}
          <span className="text-white font-mono">{mean.toFixed(2)}</span>, Std:{" "}
          <span className="text-white font-mono">{std.toFixed(2)}</span>
        </p>
        <p className="text-[11px] text-emerald-400 mt-1 font-mono">
          Suggested range: [{suggestedMin} → {suggestedMax}]
        </p>
      </div>
      <button
        onClick={() => onApply(metric.key, suggestedMin, suggestedMax)}
        className="shrink-0 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold hover:bg-cyan-500/20 transition-all"
      >
        Apply
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function Thresholds() {
  const [activeTab, setActiveTab] = useState("manual"); // "manual" | "suggest"
  const [thresholds, setThresholds] = useState(loadThresholds);
  const [saved, setSaved] = useState(false);

  // Auto-suggest state
  const [suggestions, setSuggestions] = useState({});
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState(null);

  /**
   * Update a single threshold field (min or max) for a given metric key
   */
  const handleChange = useCallback((key, field, value) => {
    setThresholds((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: isNaN(value) ? 0 : value },
    }));
    setSaved(false);
  }, []);

  /**
   * Persist the current thresholds to localStorage
   */
  const handleSave = () => {
    saveThresholds(thresholds);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  /**
   * Reset all thresholds back to their built-in defaults
   */
  const handleReset = () => {
    const defaults = {};
    for (const m of THRESHOLD_METRICS) {
      defaults[m.key] = { min: m.defaultMin, max: m.defaultMax };
    }
    setThresholds(defaults);
    setSaved(false);
  };

  /**
   * AUTO-SUGGEST: Fetch the last 500 sensor_data rows,
   * compute mean ± std for each metric, and display as a suggested range.
   */
  const loadSuggestions = async () => {
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const res = await queryAnySchema("sensor_data", (q) =>
        q
          .select(
            "soil_ph,soil_moisture,soil_temp,air_temp,air_humidity,nitrogen,phosphorus,potassium"
          )
          .order("created_at", { ascending: false })
          .limit(500)
      );

      const err = normalizeSupabaseError(res.error);
      if (err) {
        setSuggestError(err.message);
        return;
      }

      const rows = res.data ?? [];
      if (rows.length === 0) {
        setSuggestError("No sensor_data rows found in the database.");
        return;
      }

      // Compute mean and standard deviation per metric
      const computed = {};
      for (const m of THRESHOLD_METRICS) {
        const values = rows
          .map((r) => r[m.key])
          .filter((v) => typeof v === "number" && !isNaN(v));
        if (values.length === 0) continue;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance =
          values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
        const std = Math.sqrt(variance);
        computed[m.key] = { mean: +mean.toFixed(3), std: +std.toFixed(3), count: values.length };
      }
      setSuggestions(computed);
    } catch (e) {
      setSuggestError(e?.message ?? "Failed to fetch sensor data.");
    } finally {
      setSuggestLoading(false);
    }
  };

  // Load suggestions when switching to that tab
  useEffect(() => {
    if (activeTab === "suggest" && Object.keys(suggestions).length === 0) {
      loadSuggestions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  /**
   * Apply a db-suggested range to the local thresholds state (not saved yet)
   */
  const handleApplySuggestion = (key, min, max) => {
    setThresholds((prev) => ({ ...prev, [key]: { min, max } }));
    setSaved(false);
  };

  const handleApplyAll = () => {
    const updated = { ...thresholds };
    for (const m of THRESHOLD_METRICS) {
      const s = suggestions[m.key];
      if (!s) continue;
      updated[m.key] = {
        min: +(s.mean - s.std * 0.8).toFixed(2),
        max: +(s.mean + s.std * 0.8).toFixed(2),
      };
    }
    setThresholds(updated);
    setSaved(false);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sensor Thresholds"
        subtitle="Define optimal min/max ranges for each sensor metric. These thresholds drive the Target Range Alignment chart on the Tubs page."
        rightContent={
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-800 text-sm transition-all"
            >
              Reset Defaults
            </button>
            <button
              onClick={handleSave}
              className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${
                saved
                  ? "bg-emerald-400 text-black"
                  : "bg-emerald-500 hover:bg-emerald-400 text-black"
              }`}
            >
              {saved ? "✓ Saved!" : "Save Thresholds"}
            </button>
          </div>
        }
      />

      {/* Info banner */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-5 py-4 text-sm text-cyan-200">
        <span className="font-bold text-cyan-400">How it works: </span>
        These thresholds are saved in your browser (localStorage). They power the{" "}
        <span className="font-mono text-cyan-300">Target Range Alignment</span> chart when you click a tub on the
        Home page. Use <span className="font-bold">Manual</span> to set exact values, or{" "}
        <span className="font-bold">Auto-Suggest</span> to get DB-derived recommendations based on actual sensor
        readings.
      </div>

      {/* Tab switcher */}
      <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900 p-1 gap-1">
        {[
          { id: "manual", label: "✏ Manual Entry" },
          { id: "suggest", label: "🔬 Auto-Suggest from DB" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? "bg-emerald-500 text-black font-bold"
                : "text-slate-400 hover:text-white hover:bg-slate-800/60"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Manual Entry ─────────────────────────────────────────────────── */}
      {activeTab === "manual" && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Set the optimal min/max for each sensor metric. Values outside this range will be flagged as
            out-of-optimal in the Tubs analysis modal.
          </p>
          <div className="grid grid-cols-1 gap-4">
            {THRESHOLD_METRICS.map((m) => (
              <MetricRow
                key={m.key}
                metric={m}
                values={thresholds[m.key] ?? { min: m.defaultMin, max: m.defaultMax }}
                onChange={handleChange}
              />
            ))}
          </div>

          <div className="pt-4 flex justify-end">
            <button
              onClick={handleSave}
              className={`px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-lg ${
                saved
                  ? "bg-emerald-400 text-black shadow-emerald-400/20"
                  : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20"
              }`}
            >
              {saved ? "✓ Thresholds Saved!" : "Save Thresholds"}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab: Auto-Suggest ─────────────────────────────────────────────────── */}
      {activeTab === "suggest" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 max-w-xl">
              Analyzes the last 500 sensor readings from the database and suggests optimal ranges as{" "}
              <span className="font-mono text-slate-300">mean ± 0.8×std</span>. Apply individual
              suggestions or apply all at once, then hit{" "}
              <span className="text-emerald-400 font-semibold">Save Thresholds</span>.
            </p>
            <div className="flex items-center gap-3 shrink-0">
              {Object.keys(suggestions).length > 0 && (
                <button
                  onClick={handleApplyAll}
                  className="px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold hover:bg-cyan-500/20 transition-all"
                >
                  Apply All
                </button>
              )}
              <button
                onClick={loadSuggestions}
                disabled={suggestLoading}
                className="px-4 py-2 rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-800 text-xs transition-all disabled:opacity-50"
              >
                {suggestLoading ? "Analyzing…" : "↻ Re-analyze"}
              </button>
            </div>
          </div>

          {suggestError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {suggestError}
            </div>
          )}

          {suggestLoading && (
            <div className="flex items-center gap-3 text-slate-400 text-sm py-12 justify-center">
              <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              Fetching sensor data from database…
            </div>
          )}

          {!suggestLoading && Object.keys(suggestions).length === 0 && !suggestError && (
            <div className="text-center py-12 text-slate-500 text-sm">
              No sensor data returned from the database.
            </div>
          )}

          {!suggestLoading && Object.keys(suggestions).length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-3">
                {THRESHOLD_METRICS.map((m) => (
                  <SuggestionRow
                    key={m.key}
                    metric={m}
                    suggestion={suggestions[m.key] ?? null}
                    onApply={handleApplySuggestion}
                  />
                ))}
              </div>

              {/* Pending changes notice */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200 flex items-center justify-between">
                <span>
                  <span className="font-bold text-amber-400">Applied suggestions are unsaved.</span> Click{" "}
                  "Save Thresholds" to persist them.
                </span>
                <button
                  onClick={handleSave}
                  className={`ml-4 shrink-0 px-5 py-2 rounded-lg font-bold text-sm transition-all ${
                    saved
                      ? "bg-emerald-400 text-black"
                      : "bg-emerald-500 hover:bg-emerald-400 text-black"
                  }`}
                >
                  {saved ? "✓ Saved!" : "Save Thresholds"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default Thresholds;
