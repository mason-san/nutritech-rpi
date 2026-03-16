import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { fromAnySchema, normalizeSupabaseError } from "../services/dataQueries";

function Experiments() {
  // --- STATE MANAGEMENT ---
  // Stores the list of all experiment records from Supabase
  const [experiments, setExperiments] = useState([]);
  
  // Stores the mapping table data (links experiment_id to tub_id)
  const [mapping, setMapping] = useState([]);
  
  // Loading state to show placeholders during data fetch
  const [loading, setLoading] = useState(true);
  
  // Specifically tracks errors for each table to help with debugging RLS or schema issues
  const [errors, setErrors] = useState({});

  // React Router hook for programmatic navigation
  const navigate = useNavigate();

  /**
   * DATA FETCHING LOGIC
   * Retrieves experiments and their tub mappings in parallel.
   */
  const fetchExperiments = async () => {
    setLoading(true);
    setErrors({});
    try {
      // Promise.all runs both queries concurrently for efficiency
      const [expRes, mapRes] = await Promise.all([
        // Fetches core metadata for all experiment protocols
        fromAnySchema(
          "experiments",
          "id,title,description,started_at,ended_at,status,created_at,updated_at"
        ),
        // Fetches the linker table that tells us which tub belongs to which experiment
        fromAnySchema("mapping", "id,experiment_id,tub_id"),
      ]);

      // Normalize errors for display in the Debug panel
      const nextErrors = {
        experiments: normalizeSupabaseError(expRes.error),
        mapping: normalizeSupabaseError(mapRes.error),
      };

      if (nextErrors.experiments || nextErrors.mapping) setErrors(nextErrors);
      setExperiments(expRes.data ?? []);
      setMapping(mapRes.data ?? []);
    } finally {
      // Ensure loading state is turned off regardless of success or failure
      setLoading(false);
    }
  };

  // Initial load on component mount
  useEffect(() => {
    fetchExperiments();
  }, []);

  /**
   * DERIVED DATA: Tub Count per Experiment
   * We iterate through the mapping table to count how many tubs are assigned to each experiment ID.
   * useMemo ensures this isn't recalculated on every re-render unless 'mapping' changes.
   */
  const tubsCountByExperiment = useMemo(() => {
    const m = new Map();
    for (const row of mapping) {
      const k = row.experiment_id;
      if (!k) continue;
      // Increment count for this experiment_id
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [mapping]);


  const activeCount = useMemo(
    () => experiments.filter((e) => (e.status ?? "").toLowerCase() === "active").length,
    [experiments]
  );

  return (
    <div className="space-y-10">
      <PageHeader
        title="Active Experiments"
        subtitle="Managed research protocols and nutrient cycling tracking."
        rightContent={
          <button
            onClick={fetchExperiments}
            className="px-4 py-2 rounded-lg border border-emerald-400 text-emerald-400 hover:bg-emerald-400/10"
          >
            Refresh
          </button>
        }
      />

      {(errors.experiments || errors.mapping) && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          <div className="font-semibold">Supabase errors</div>
          <div className="mt-2 space-y-1 text-xs text-rose-100/80">
            {errors.experiments && (
              <div>
                <span className="font-medium">experiments</span>: {errors.experiments.message}
              </div>
            )}
            {errors.mapping && (
              <div>
                <span className="font-medium">mapping</span>: {errors.mapping.message}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <p className="text-slate-400 text-xs uppercase tracking-wide">
            Total active
          </p>
          <h2 className="text-4xl font-bold mt-2">{activeCount}</h2>
          <p className="text-xs text-slate-500 mt-3">Status = active</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <p className="text-slate-400 text-xs uppercase tracking-wide">
            Total experiments
          </p>
          <h2 className="text-4xl font-bold mt-2">{experiments.length}</h2>
          <p className="text-xs text-slate-500 mt-3">From `experiments`</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
          <p className="text-slate-400 text-xs uppercase tracking-wide">
            Data mode
          </p>
          <h2 className="text-2xl font-semibold mt-3 text-emerald-300">
            Supabase Direct
          </h2>
          <p className="text-xs text-slate-500 mt-3">
            If this is blank, it’s usually RLS.
          </p>
        </div>
      </div>

            {/* Header
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-bold">Experiments</h1>
                    <p className="text-slate-400">
                        Manage and monitor active plant experiments.
                    </p>
                </div>
            </div> */}

      {loading && <div className="text-slate-400">Loading experiments...</div>}

      {!loading && experiments.length === 0 && (
        <div className="text-slate-500">No experiments found.</div>
      )}

      {!loading && experiments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {experiments.map((exp) => {
            const status = (exp.status ?? "unknown").toLowerCase();
            const badge =
              status === "active"
                ? "bg-emerald-500/10 text-emerald-300"
                : status === "paused"
                  ? "bg-amber-500/10 text-amber-300"
                  : "bg-slate-700/40 text-slate-300";

            const tubCount = tubsCountByExperiment.get(exp.id) ?? 0;

            return (
              <div
                key={exp.id}
                onClick={() => navigate(`/experiments/${exp.id}`)}
                className="group bg-slate-900 border border-slate-800 p-6 rounded-2xl hover:border-emerald-400 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      Experiment
                    </div>
                    <h3 className="text-xl font-semibold mt-1">{exp.title}</h3>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-1 rounded-full capitalize ${badge}`}
                  >
                    {status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-950/40 border border-slate-800 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Linked tubs
                    </div>
                    <div className="text-lg font-semibold mt-1">
                      {tubCount || "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-950/40 border border-slate-800 p-3">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      Started
                    </div>
                    <div className="text-sm text-slate-200 mt-1">
                      {exp.started_at
                        ? new Date(exp.started_at).toLocaleDateString()
                        : "—"}
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-xs text-slate-500 group-hover:text-slate-400 transition-colors">
                  Open analysis →
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Experiments; 