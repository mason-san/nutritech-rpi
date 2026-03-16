import React from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  Cell,
  ReferenceLine,
  ReferenceArea,
  ComposedChart,
  Line,
} from "recharts";

/**
 * RadarAnalysis: Shows multidimensional signal comparison with optional optimal range overlay
 */
export const RadarAnalysis = ({ data, title, subtitle, targetData }) => (
  <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-3xl border border-white/5 flex flex-col transition-all hover:border-emerald-500/30">
    <div className="mb-4 flex justify-between items-start">
      <div>
        <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      {targetData && (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-[10px] text-slate-400 uppercase font-bold">Current</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500/50"></div>
            <span className="text-[10px] text-slate-400 uppercase font-bold">Optimal</span>
          </div>
        </div>
      )}
    </div>
    <div className="h-[250px] relative">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#334155" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: "#94a3b8", fontSize: 11 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          
          {targetData && (
            <Radar
              name="Optimal Range"
              dataKey="targetValue"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.1}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}

          <Radar
            name="Current Levels"
            dataKey="value"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.3}
            strokeWidth={3}
          />
          
          <Tooltip 
            contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '14px', padding: '10px' }}
            itemStyle={{ fontSize: '11px' }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

/**
 * MetricOptimizationChart: Shows current value vs optimal range for specific metrics
 */


export const MetricOptimizationChart = ({ data, title, subtitle }) => (
  <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-3xl border border-white/5 flex flex-col transition-all hover:border-cyan-500/30">
    <div className="mb-6">
      <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
      <p className="text-xs text-slate-400">{subtitle}</p>
    </div>
    <div className="h-[180px] relative">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
          <XAxis type="number" hide domain={[0, 100]} />
          <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={11} axisLine={false} tickLine={false} />
          <Tooltip 
            cursor={{ fill: 'transparent' }}
            contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '14px' }}
          />
          {/* Optimal zones would usually be marked here, but showing as a bar for simplicity or target line */}
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.value >= entry.min && entry.value <= entry.max ? "#10b981" : "#f59e0b"} 
              />
            ))}
          </Bar>
          {/* Target marker dots or range indicators can be added with customized shapes */}
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

/**
 * NPKHeatmap: Custom Grid-based nutrient density
 * For simplicity in Recharts, we can use a ScatterChart with large square cells
 */
export const NPKHeatmap = ({ data, title, subtitle }) => (
  <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-3xl border border-white/5 flex flex-col transition-all hover:border-blue-500/30">
    <div className="mb-4">
      <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
      <p className="text-xs text-slate-400">{subtitle}</p>
    </div>
    <div className="h-[250px] relative">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
          <XAxis type="category" dataKey="x" name="Metric" stroke="#64748b" fontSize={11} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="y" name="Tub" stroke="#64748b" fontSize={11} axisLine={false} tickLine={false} />
          <ZAxis type="number" dataKey="value" range={[600, 600]} />
          <Tooltip 
            cursor={{ strokeDasharray: "3 3" }} 
            contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '14px' }}
          />
          <Scatter data={data} shape="square">
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.value > 80 ? "#10b981" : entry.value > 50 ? "#3b82f6" : "#ef4444"} 
                strokeWidth={0}
                radius={8}
                opacity={0.4 + (entry.value / 200)}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  </div>
);

/**
 * RiskMatrix: Maps Health (Productivity) vs Stress (Risk)
 * Uses a ScatterChart to plot tubs in a 2D space where:
 * - X-Axis = Risk (Potential for system failure)
 * - Y-Axis = Productivity (Growth performance)
 */
export const RiskMatrix = ({ data, title, subtitle }) => (
  <div className="bg-slate-900/50 backdrop-blur-sm p-6 rounded-3xl border border-white/5 flex flex-col transition-all hover:border-rose-500/30">
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      <span className="text-[10px] px-3 py-1 rounded-full bg-rose-500/10 text-rose-300 uppercase tracking-widest font-black border border-rose-500/20">
        Risk Analysis
      </span>
    </div>
    <div className="h-[250px] relative">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
          <XAxis 
            type="number" 
            dataKey="x" 
            name="Risk Score" 
            unit="%" 
            stroke="#64748b" 
            fontSize={11}
            domain={[0, 100]}
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            type="number" 
            dataKey="y" 
            name="Productivity" 
            unit="%" 
            stroke="#64748b" 
            fontSize={11}
            domain={[0, 100]}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip 
            cursor={{ strokeDasharray: "3 3" }} 
            contentStyle={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '14px' }}
          />
          <Scatter name="Tubs" data={data} fill="#8884d8">
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                // COLOR LOGIC: Green if high health, Red if high risk, Amber for mid-range
                fill={entry.y > 70 ? "#10b981" : entry.x > 70 ? "#ef4444" : "#f59e0b"} 
                strokeWidth={2}
                stroke="#081028"
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  </div>
);

/**
 * Interactive3DGraph: A true Plotly 3D Scatter plot
 * This component dynamically loads the Plotly library from a CDN on mount.
 * It maps Nutrient, Climate, and Yield quality signals into a 3D coordinate system.
 */
export const Interactive3DGraph = ({ data, title }) => {
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    const scriptId = "plotly-cdn-script";
    
    // Check if script already exists to prevent duplicate loading
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://cdn.plot.ly/plotly-2.27.0.min.js";
      script.async = true;
      script.onload = () => initPlot();
      document.body.appendChild(script);
    } else {
      initPlot();
    }

    /**
     * INIT PLOT: Configures the 3D scene, axis labels, and color scales.
     */
    function initPlot() {
      if (!window.Plotly || !containerRef.current) return;

      const plotlyData = [
        {
          x: data.map(d => d.x),
          y: data.map(d => d.y),
          z: data.map(d => d.z),
          text: data.map(d => d.name),
          mode: 'markers+text',
          type: 'scatter3d',
          marker: {
            size: 12,
            color: data.map(d => d.z), // Color derived from the Z-axis (Yield)
            colorscale: 'Viridis',
            opacity: 0.8,
            line: { color: '#10b981', width: 1 }
          },
          textposition: 'top center',
          textfont: { color: '#94a3b8', size: 10 }
        }
      ];

      const layout = {
        title: { text: title, font: { color: '#ffffff', family: 'Inter, sans-serif', size: 16 } },
        paper_bgcolor: 'rgba(0,0,0,0)', // Transparent background to match theme
        plot_bgcolor: 'rgba(0,0,0,0)',
        margin: { l: 0, r: 0, b: 0, t: 40 },
        scene: {
          xaxis: { title: 'Nutrient', gridcolor: '#1e293b', zerolinecolor: '#1e293b', color: '#64748b' },
          yaxis: { title: 'Climate', gridcolor: '#1e293b', zerolinecolor: '#1e293b', color: '#64748b' },
          zaxis: { title: 'Yield', gridcolor: '#1e293b', zerolinecolor: '#1e293b', color: '#64748b' },
          bgcolor: 'rgba(0,0,0,0)',
          camera: { eye: { x: 1.5, y: 1.5, z: 1.5 } } // Initial camera angle
        },
        showlegend: false,
        font: { color: '#64748b' }
      };

      const config = {
        responsive: true,
        displayModeBar: false
      };

      window.Plotly.newPlot(containerRef.current, plotlyData, layout, config);
    }

    // PURGE Plotly instance on unmount to free up memory
    return () => {
      if (window.Plotly && containerRef.current) {
        window.Plotly.purge(containerRef.current);
      }
    };
  }, [data, title]);

  return (
    <div className="bg-slate-900 shadow-2xl p-8 rounded-[40px] border border-white/5 flex flex-col transition-all hover:border-emerald-500/30 overflow-hidden relative group">
      <div className="absolute top-4 right-8 px-3 py-1 bg-cyan-500/10 text-cyan-400 text-[9px] font-black rounded-full border border-cyan-500/20 animate-pulse">
        INTERACTIVE_3D
      </div>
      <div className="mb-2">
        <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">{title}</h3>
        <p className="text-[10px] text-slate-500 font-mono">Use mouse to rotate and move the space</p>
      </div>
      <div ref={containerRef} className="w-full h-[400px]"></div>
    </div>
  );
};


