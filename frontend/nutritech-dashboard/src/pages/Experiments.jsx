import {useEffect, useState} from "react"; 
import {useNavigate} from "react-router-dom";
import API from "../services/api"; 
import PageHeader from "../components/PageHeader";

function Experiments() {
    const [experiments, setExperiments] = useState([]);
    const [loading, setLoading] = useState(true);

    const navigate = useNavigate();

    const fetchExperiments = async () => {
        try{
            setLoading(true);
            const res = await API.get("/experiments/");
            setExperiments(res.data.data);
        } catch(err){
            console.error("Error fetching experiments:", err);
        } finally {
            setLoading(false);
        }
    }; 

    useEffect(() => {
        fetchExperiments();
    }, []);

    return (
        <div className="space-y-10">
            <PageHeader
                title="Active Experiments"
                subtitle="Managed research protocols and nutrient cycling tracking."
            />

            {/* Header
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-bold">Experiments</h1>
                    <p className="text-slate-400">
                        Manage and monitor active plant experiments.
                    </p>
                </div>
            </div> */}

            {/* Loading */}
            {loading && (
                <div className="text-slate-400">Loading experiments...</div>
            )}

            {/* Grid */}
            {!loading && experiments.length === 0 && (
                <div className="text-slate-500">No Experiments found.</div>
            )}

            {!loading && experiments.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {experiments.map((exp) => (
                        <div
                            key={exp.id}
                            onClick={() => navigate(`/experiments/${exp.id}`)}
                            className="bg-slate-900 border border-slate-800 p-6 rounded-xl hover:border-emerald-400 transition-all cursor-pointer"
                        >
                            <h3 className="text-xl font-semibold mb-2">
                                {exp.title}
                            </h3>

                            <div className="space-y-1 text-sm text-slate-400">
                                <p>
                                    Status: {" "}
                                    <span className="capitalize text-emerald-400">
                                        {exp.status}
                                    </span>
                                </p>


                                <p>
                                    Started: {" "}
                                    {exp.started_at
                                        ? new Date(exp.started_at).toLocaleDateString()
                                        : "N/A"}
                                </p>

                                <p>
                                    Ended: {" "}
                                    {exp.ended_at
                                        ? new Date(exp.ended_at).toLocaleDateString()
                                        : "Ongoing"}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Experiments; 