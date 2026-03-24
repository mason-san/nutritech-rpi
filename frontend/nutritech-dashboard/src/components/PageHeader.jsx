/**
 * REUSABLE COMPONENT: PageHeader
 * Premium gradient page header with animated accent line.
 */
function PageHeader({ title, subtitle, rightContent, accent }) {
  return (
    <div className="flex justify-between items-start mb-10 fade-in">
      <div>
        {/* Accent label above title */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 10, fontWeight: 800, letterSpacing: "0.15em",
          textTransform: "uppercase", color: "#10b981", marginBottom: 8,
        }}>
          <span style={{ width: 24, height: 1, background: "linear-gradient(90deg, #10b981, transparent)", display: "inline-block" }} />
          {accent ?? "NutriTech Dashboard"}
          <span style={{ width: 24, height: 1, background: "linear-gradient(90deg, transparent, #10b981)", display: "inline-block" }} />
        </div>

        {/* Main title */}
        <h1 style={{
          fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
          fontWeight: 900,
          letterSpacing: "-0.03em",
          lineHeight: 1.1,
          margin: 0,
          background: "linear-gradient(135deg, #ffffff 30%, #94a3b8 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}>
          {title}
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 14,
          color: "#475569",
          marginTop: 8,
          maxWidth: 560,
          lineHeight: 1.6,
        }}>
          {subtitle}
        </p>
      </div>

      {rightContent && (
        <div style={{ flexShrink: 0, marginLeft: 24 }}>
          {rightContent}
        </div>
      )}
    </div>
  );
}

export default PageHeader;