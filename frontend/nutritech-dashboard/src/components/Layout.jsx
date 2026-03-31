import { NavLink } from "react-router-dom";

const HOME_URL = "https://nutritech-dashboard-ef8h.onrender.com/";

const NAV_LINKS = [
  { to: "/",            label: "Tubs",        icon: "◈" },
  { to: "/experiments", label: "Experiments", icon: "◉" },
  { to: "/analytics",  label: "Analytics",   icon: "▦" },
  { to: "/thresholds", label: "Thresholds",  icon: "◎" },
  { to: "/compare",    label: "Compare",     icon: "⇌" },
];

function Layout({ children }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>

      {/* ── Top Nav ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50"
        style={{
          background: "rgba(2,11,24,0.75)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(16,185,129,0.12)",
          boxShadow: "0 1px 0 rgba(16,185,129,0.06), 0 4px 24px rgba(0,0,0,0.4)",
        }}
      >
        {/* Subtle top glow line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "1px",
          background: "linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.5) 50%, transparent 100%)",
        }} />

        <div className="max-w-screen-xl mx-auto px-8 py-0 flex items-center justify-between" style={{ height: 60 }}>

          {/* Logo */}
          <div className="flex items-center gap-3">
            <div style={{
              width: 38, height: 38,
              background: "linear-gradient(135deg, rgba(16,185,129,0.25), rgba(6,182,212,0.15))",
              border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16,
              boxShadow: "0 0 12px rgba(16,185,129,0.2)",
            }}>
              <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.1em" }}>NT</span>
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-white">NutriTech</span>
              <span className="gradient-text text-lg font-black tracking-tight"> Dashboard</span>
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  isActive
                    ? "nav-pill-active flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm"
                    : "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white transition-all duration-200 hover:bg-white/5"
                }
              >
                <span className="text-[13px]">{icon}</span>
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right: status + user */}
          <div className="flex items-center gap-4">
            {/* Home button — external link to main landing page */}
            <a
              href={HOME_URL}
              target="_self"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all duration-200 hover:bg-white/5 border border-white/5 hover:border-white/10"
              style={{ textDecoration: "none" }}
            >
              <span className="text-[13px]">⌂</span>
              Home
            </a>

            {/* Live pill */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 12px",
              borderRadius: 99,
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
              fontSize: 11, fontWeight: 700, color: "#34d399",
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              <span style={{ position: "relative", display: "inline-flex", width: 7, height: 7 }}>
                <span style={{
                  position: "absolute", inset: 0, borderRadius: "50%",
                  background: "#10b981", animation: "ping 1.5s cubic-bezier(0,0,0.2,1) infinite", opacity: 0.75,
                }} />
                <span style={{ position: "relative", width: 7, height: 7, borderRadius: "50%", background: "#10b981" }} />
              </span>
              Live
            </div>

            {/* User badge */}
            <div style={{
              padding: "4px 14px",
              borderRadius: 99,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontSize: 11, color: "#94a3b8",
              fontWeight: 600, letterSpacing: "0.06em",
            }}>
              ADMIN
            </div>
          </div>

        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────── */}
      <main className="max-w-screen-xl mx-auto px-8 py-10 fade-in">
        {children}
      </main>
    </div>
  );
}

export default Layout;