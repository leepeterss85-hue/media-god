import React, { useEffect, useState } from "react";
import { BarChart3, Film, Tv, Clock, TrendingUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const TYPE_COLORS = { movie: "#22c55e", tv: "#06b6d4" };
const GENRE_COLOR = "#22c55e";

const fmtTime = (s) => {
  if (!s) return "0m";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export default function StatsView() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.functions
      .invoke("getWatchingStats", {})
      .then((res) => {
        if (res.data?.error) setError(res.data.error);
        else setStats(res.data || {});
      })
      .catch((e) => setError(e.message || "Could not load stats"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-xl font-bold text-white mb-6">Watching Insights</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-mg-card rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-mg-card rounded-lg animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-xl font-bold text-white mb-4">Watching Insights</h1>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  const totalTitles = stats?.total_titles || 0;
  const totalSeconds = stats?.total_watch_seconds || 0;
  const contentTypes = stats?.content_types || [];
  const genres = stats?.genres || [];

  if (totalTitles === 0) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-xl font-bold text-white mb-4">Watching Insights</h1>
        <div className="text-center py-20">
          <BarChart3 className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">No watching history yet.</p>
          <p className="text-white/30 text-xs mt-1">
            Play something and your genre stats will appear here.
          </p>
        </div>
      </div>
    );
  }

  const pieData = contentTypes.map((c) => ({
    name: c.type === "tv" ? "TV Shows" : "Movies",
    value: c.titles,
    seconds: c.seconds,
  }));

  return (
    <div className="p-4 md:p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <BarChart3 className="w-5 h-5 text-mg-green" />
        <h1 className="text-xl font-bold text-white">Watching Insights</h1>
      </div>
      <p className="text-sm text-white/50 mb-6">
        Based on your Continue Watching history
      </p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-mg-card border border-white/10 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-bold uppercase tracking-wider">
            <TrendingUp className="w-3 h-3" /> Titles
          </div>
          <p className="text-2xl font-bold text-white mt-1">{totalTitles}</p>
        </div>
        <div className="bg-mg-card border border-white/10 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-bold uppercase tracking-wider">
            <Clock className="w-3 h-3" /> Watched
          </div>
          <p className="text-2xl font-bold text-white mt-1">{fmtTime(totalSeconds)}</p>
        </div>
        {contentTypes.map((c) => (
          <div key={c.type} className="bg-mg-card border border-white/10 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-white/40 text-[10px] font-bold uppercase tracking-wider">
              {c.type === "tv" ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
              {c.type === "tv" ? "TV Shows" : "Movies"}
            </div>
            <p className="text-2xl font-bold text-white mt-1">{c.titles}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Content type split */}
        <div className="bg-mg-card border border-white/10 rounded-lg p-4">
          <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider mb-3">
            Content Types
          </h3>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={38}
                    outerRadius={64}
                    paddingAngle={2}
                  >
                    {pieData.map((d) => (
                      <Cell
                        key={d.name}
                        fill={d.name === "TV Shows" ? TYPE_COLORS.tv : TYPE_COLORS.movie}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2">
                {pieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-sm"
                      style={{ background: d.name === "TV Shows" ? TYPE_COLORS.tv : TYPE_COLORS.movie }}
                    />
                    <span className="text-white text-sm">{d.name}</span>
                    <span className="text-white/40 text-xs">
                      {d.value} · {fmtTime(d.seconds)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-white/40 text-xs">No data.</p>
          )}
        </div>

        {/* Most-watched genres */}
        <div className="bg-mg-card border border-white/10 rounded-lg p-4">
          <h3 className="text-white/80 text-xs font-bold uppercase tracking-wider mb-3">
            Most-Watched Genres
          </h3>
          {genres.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(160, genres.length * 28)}>
              <BarChart data={genres} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={88}
                  tick={{ fill: "rgba(255,255,255,0.7)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  contentStyle={{
                    background: "hsl(var(--mg-surface))",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "#fff" }}
                />
                <Bar dataKey="weight" fill={GENRE_COLOR} radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-white/40 text-xs">No genre data resolved.</p>
          )}
        </div>
      </div>
    </div>
  );
}