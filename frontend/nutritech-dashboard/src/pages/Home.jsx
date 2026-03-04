import { useEffect, useState } from "react" ; 
import API from "../services/api.js"; 
import PageHeader from "../components/PageHeader.jsx";

function Home(){
    const [tubs, setTubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const  [selectedTub, setSelectedTub] = useState(null); 
    const [tubDetails, setTubDetails] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);
    

    const fetchTubs = async () => {
        try{
            setLoading(true);
            const res = await API.get("/tubs/"); 
            setTubs(res.data.data);
        } catch(err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchTubDetails = async (id) => {
        try{
            setModalLoading(true);
            setSelectedTub(id);

            const res = await API.get(`/tubs/${id}`);
            setTubDetails(res.data);
        } catch(err){
            console.error(err);
        } finally {
            setModalLoading(false);
        }
    };

    useEffect(() => {
        fetchTubs();
    }, []);

    return (
        <div className="space-y-10">
            {/* Header Section
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight">
                        Active Tubs
                    </h1>
                    <p className="text-slate-400">
                        Real-time telemetry from sensor-equipped modular environments
                    </p>
                </div>

                <button
                    onClick={fetchTubs}
                    className="px-4 py-2 rounded-lg border border-emerald-400 text-emerald-400 hover:bg-emerald-400/10"
                >
                    Sync
                </button>
            </div> */}

            <PageHeader
                title="Active Tubs" 
                subtitle="Real-time telemetry from sensor-equipped modular environments."
                rightContent={ 
                    <button
                        onClick={fetchTubs}
                        className="px-4 py-2  rounded-lg border border-emerald-400 text-emerald-400 hover:bg-emerald-400/10"
                    >
                        Sync
                    </button>
                }
            />

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                    <p className="text-slate-400 text-sm">Total Tubs</p>
                    <h2 className="text-3xl font-bold">{tubs.length}</h2>
                </div>

                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                    <p className="text-slate-400 text-sm">System Status</p>
                    <h2 className="text-3xl font-bold text-emerald-400">
                        Online
                    </h2>
                </div>

                <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
                    <p className="text-slate-400 text-sm">Dashboard</p>
                    <h2 className="text-3xl font-bold">
                        Raspberry Pi
                    </h2>
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <p className="text-slate-400">Loading tubs...</p>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {tubs.map((tub) => (
                    <div
                        key={tub.id}
                        onClick={() => fetchTubDetails(tub.id)}
                        className="bg-slate-900 border border-slate-800 p-5 rounded-xl hover:border-emerald-400 transition-all cursor-pointer"
                    >
                        <div className="mb-4 h-32 bg-slate-800 rounded-lg flex items-center justify-center">
                            <span className="text-slate-500">
                                {tub.label}
                            </span>
                        </div>

                        <h3 className="text-lg font-semibold">
                            {tub.label}
                        </h3>

                        <p className="text-sm text-slate-400">
                            Soil: {tub.soil_type || "N/A"}
                        </p>

                        <p className="text-sm text-slate-400">
                            Plant: {tub.plant_name || "N/A"}
                        </p>

                        <div className="mt-3">
                            <span className="text-xs px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-400 uppercase">
                                {tub.growth_rate || "none"} 
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            )}

            {selectedTub && (
                <div className="fixed inset-0 bg-black/60 backdrop-blue-sm flex items-center justify-center z-50">
                    <div className="bg-slate-900 w-full max-w-md rounded-xl p-6 border border-slate-800">
                        {modalLoading ? (
                            <p className="text-slate-400">Loading tub details...</p>
                        ) : (
                            <>
                                <h2 className="text-2xl font-bold mb-4">
                                    {tubDetails?.tub?.label}
                                </h2>

                                <div className="space-y-2 text-sm text-slate-300">
                                    <p><strong>Soil:</strong> {tubDetails?.tub?.soil_type || "N/A"}</p>
                                    <p><strong>Plant:</strong> {tubDetails?.tub?.plant_name || "N/A"}</p>
                                    <p><strong>Growth Rate:</strong> {tubDetails?.tub?.growth_rate || "none"}</p>

                                    <hr className="my-3 border-slate-700" />

                                    <p><strong>Field Capacity:</strong> {tubDetails?.config?.field_capacity || "N/A"}</p>
                                    <p><strong>Wilting Point:</strong> {tubDetails?.config?.wilting_point || "N/A"}</p>
                                    <p><strong>Bulk Density:</strong> {tubDetails?.config?.bulk_density_gcm3 || "N/A"}</p>
                                </div>

                                <button
                                    onClick={() => {
                                        setSelectedTub(null);
                                        setTubDetails(null);
                                    }}
                                    className="mt-6 w-full bg-emerald-500 hover:bg-emerald-600 py-2 rounded-lg"
                                >
                                    Close
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default Home; 