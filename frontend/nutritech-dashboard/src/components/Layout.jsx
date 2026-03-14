import {NavLink} from "react-router-dom";
function Layout({children}){

    return (
        <div className="min-h-screen bg-[#081028] text-slate-100">
            {/* Top Navbar */}
            <header className="sticky top-0 z-50 border-b border-slate-800 bg-[#081028]/80 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-8 py-3 flex items-center justify-between">

                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                            📊  
                        </div>
                        <h1 className="text-xl font-semibold">
                            NutriTech <span className="text-emerald-400">Dashboard</span>
                        </h1>
                    </div>

                    {/* Navigation Tabs */}
                    <nav className="flex items-center gap-6">
                        <NavLink
                            to="/"
                            className={({ isActive }) =>
                                isActive
                                    ? "px-4 py-2  rounded-lg bg-emerald-500 text-black font-medium"
                                    : "text-slate-400 hover:text-white"
                            }
                        >
                            Tubs
                        </NavLink>

                        <NavLink
                            to="/experiments"
                            className={({ isActive }) =>
                                isActive
                                    ? "px-4 py-2  rounded-lg bg-emerald-500 text-black font-medium"
                                    : "text-slate-400 hover:text-white"
                            }
                        >
                            Experiments
                        </NavLink>

                        <NavLink
                            to="/analytics"
                            className={({ isActive }) =>
                                isActive
                                    ? "px-4 py-2  rounded-lg bg-emerald-500 text-black font-medium"
                                    : "text-slate-400 hover:text-white"
                            }
                        >
                            ML Analytics
                        </NavLink>
                    </nav>

                    {/* Right Size */}
                    <div className="flex items-center gap-6">
                        <div className="px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700 text-xs text-emerald-400 flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            System Online
                        </div>

                        <div className="text-right">
                            <p className="text-sm font-medium">Admin User</p>
                            <p className="text-xs text-slate-400">KIOSK MODE</p>
                        </div>
                    </div>
                </div>
            </header>

            {/* Page Content */}
            <main className="max-w-7xl mx-auto px-8 py-10">
                {children}
            </main>
        </div>
    ); 
}

export default Layout;