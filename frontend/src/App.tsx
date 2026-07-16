import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Thermometer, Volume2, Sun, BookOpen, Users, Coffee, Sparkles,
  Clock, Plus, Pencil, Trash2, X, MapPin, BrainCircuit,
} from "lucide-react";
import { api } from "./api";
import MascotAssistant from "./MascotAssistant";
import type {
  CurrentConditions, TrendPoint, DailySummary, SensorReading,
  UserReport, ReportCategory, CommunityMood,
} from "./types";

const REPORT_CATEGORIES: ReportCategory[] = ["Too Hot", "Too Noisy", "Too Bright", "Too Dark", "Comfortable", "Other"];

function statusTone(status: string) {
  if (status === "Excellent for Study") return "#4ADE80";
  if (status === "Good for Meetings") return "#38BDF8";
  if (status === "Comfortable") return "#C9A227";
  if (status === "Too Noisy") return "#FBBF24";
  return "#F87171";
}

export default function App() {
  const [tab, setTab] = useState<"overview" | "analytics" | "history" | "reports">("overview");
  const [current, setCurrent] = useState<CurrentConditions | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [locations, setLocations] = useState<string[]>(["Main Atrium"]);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const [c, t, s, loc] = await Promise.all([
        api.getCurrent(), api.getTrend(24), api.getSummary(), api.getLocations(),
      ]);
      setCurrent(c);
      setTrend(t);
      setSummary(s);
      setLocations(loc.locations);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    const iv = setInterval(loadOverview, 15000);
    return () => clearInterval(iv);
  }, [loadOverview]);

  const barsikScore = current?.scores.overall ?? 50;
  const barsikRecommendation = current?.advisories?.[0] ?? "📚 Great for studying right now!";
  const barsikStatus = current?.scores.status ?? "Loading comfort data";

  return (
    <div className="min-h-screen font-body">
      <header className="flex items-center justify-between flex-wrap gap-3 px-8 py-5">
        <div className="flex items-center gap-3">
          <img
            src="/logo-atriumiq.png"
            alt="AtriumIQ logo"
            className="h-10 w-28 rounded-xl border border-white/10 bg-white/5 object-contain px-2 py-1"
          />
          <div>
            <div className="font-display font-semibold text-white text-lg -tracking-wide">AtriumIQ</div>
            <div className="text-[11px] text-white/45 tracking-wide">NAZARBAYEV UNIVERSITY · SMART COMFORT ANALYTICS</div>
          </div>
        </div>
        <nav className="flex gap-1 bg-white/5 border border-white/10 rounded-2xl p-1">
          {(["overview", "analytics", "history", "reports"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition ${
                tab === t ? "bg-cyan text-navy" : "text-white/65 hover:bg-white/10"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-8 pb-16">
        {error && (
          <div className="glass p-4 mb-6 border-red-400/40 text-red-300 text-sm">
            Couldn't reach the AtriumIQ API ({error}). Make sure the FastAPI backend is running on port 8000.
          </div>
        )}

        {tab === "overview" && <Overview current={current} summary={summary} />}
        {tab === "analytics" && <Analytics trend={trend} summary={summary} />}
        {tab === "history" && <History locations={locations} />}
        {tab === "reports" && <Reports />}
      </main>

      <MascotAssistant
        comfortScore={barsikScore}
        recommendation={barsikRecommendation}
        status={barsikStatus}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Overview({ current, summary }: { current: CurrentConditions | null; summary: DailySummary | null }) {
  const [mood, setMood] = useState<CommunityMood | null>(null);
  useEffect(() => { api.getCommunityMood().then(setMood).catch(() => {}); }, []);

  if (!current) return <SkeletonHero />;
  const tone = statusTone(current.scores.status);
  const r = current.reading;

  return (
    <div className="flex flex-col gap-6 pt-4">
      <div className="glass p-8 flex gap-9 items-center flex-wrap">
        <CircularGauge value={current.scores.overall} tone={tone} />
        <div className="flex-1 min-w-[260px]">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-3 text-sm font-medium" style={{ background: `${tone}22`, color: tone, border: `1px solid ${tone}55` }}>
            {current.scores.status}
          </span>
          <h1 className="font-display text-3xl font-semibold text-white mb-2 -tracking-wide">
            {r.location} comfort report
          </h1>
          <p className="text-white/55 text-sm max-w-md leading-relaxed">
            Not just displaying sensor data — AtriumIQ helps you decide where and when to study, meet, and relax.
          </p>
          <div className="flex items-center gap-2 mt-4 text-xs text-white/40 font-mono">
            <Clock size={13} /> Updated {new Date(r.timestamp).toLocaleTimeString()}
          </div>
        </div>
        <div className="min-w-[210px] flex flex-col gap-3">
          <ScoreBar label="Study" icon={BookOpen} value={current.scores.study} tone="#38BDF8" />
          <ScoreBar label="Meeting" icon={Users} value={current.scores.meeting} tone="#C9A227" />
          <ScoreBar label="Relax" icon={Coffee} value={current.scores.relax} tone="#4ADE80" />
          <ScoreBar label="Overall" icon={Sparkles} value={current.scores.overall} tone={tone} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <ConditionCard icon={Thermometer} label="Atrium temperature" value={`${r.atrium_temp}°C`} tone="#38BDF8" />
        <ConditionCard icon={Sun} label="Outdoor temperature" value={`${r.outdoor_temp}°C`} tone="#C9A227" />
        <ConditionCard icon={Thermometer} label="Temperature difference" value={`${current.temperature_diff}°C`} tone="#4ADE80" />
        <ConditionCard icon={Volume2} label="Noise level" value={`${r.noise_db} dB`} tone="#FBBF24" />
        <ConditionCard icon={Sun} label="Lighting level" value={`${r.brightness_lux} lux`} tone="#E4C866" />
        {summary && <ConditionCard icon={Thermometer} label="Today's average" value={`${summary.avg_temp}°C`} tone="#38BDF8" />}
      </div>

      <div className="glass p-6">
        <SectionHeader icon={BrainCircuit} title="AI Comfort Advisor" subtitle="Recommendations generated from live sensor patterns" />
        <div className="flex flex-col gap-2.5">
          {current.advisories.map((a, i) => (
            <div key={i} className="px-3.5 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white/85">
              {a}
            </div>
          ))}
        </div>
      </div>

      {mood && (
        <div className="glass p-6">
          <SectionHeader icon={Sparkles} title="Community mood" subtitle={`${mood.total_reports} reports this period`} />
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-center">
              <div className="font-display text-4xl font-bold text-green-400">{mood.satisfaction_rate}%</div>
              <div className="text-xs text-white/50 mt-1">Satisfaction rate</div>
            </div>
            <div className="text-sm text-white/70">
              Most common complaint: <span className="text-white font-medium">{mood.top_complaint}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonHero() {
  return (
    <div className="glass p-8 mt-4 animate-pulse">
      <div className="h-52 bg-white/5 rounded-2xl" />
    </div>
  );
}

function CircularGauge({ value, tone }: { value: number; tone: string }) {
  const r = 88, c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, value)) / 100) * c;
  return (
    <div className="relative w-52 h-52 shrink-0">
      <svg width="208" height="208" viewBox="0 0 208 208">
        <circle cx="104" cy="104" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="13" />
        <circle
          cx="104" cy="104" r={r} fill="none" stroke={tone} strokeWidth="13" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 104 104)"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-5xl font-bold text-white">{value}</span>
        <span className="text-[11px] text-white/55 uppercase tracking-wider mt-1">Comfort score</span>
      </div>
    </div>
  );
}

function ScoreBar({ label, icon: Icon, value, tone }: { label: string; icon: any; value: number; tone: string }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="flex items-center gap-2 text-sm text-white/75"><Icon size={13} color={tone} />{label}</span>
        <span className="font-mono text-sm text-white">{value}</span>
      </div>
      <div className="h-1.5 rounded bg-white/10 overflow-hidden">
        <div className="h-full rounded transition-all duration-700" style={{ width: `${value}%`, background: tone }} />
      </div>
    </div>
  );
}

function ConditionCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: string }) {
  return (
    <div className="glass p-5">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: `${tone}22`, border: `1px solid ${tone}44` }}>
        <Icon size={15} color={tone} />
      </div>
      <div className="font-display text-2xl font-semibold text-white">{value}</div>
      <div className="text-xs text-white/50 mt-1">{label}</div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-lg bg-cyan/10 border border-cyan/25 flex items-center justify-center">
        <Icon size={16} color="#38BDF8" />
      </div>
      <div>
        <h2 className="font-display text-base font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs text-white/45">{subtitle}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Analytics({ trend, summary }: { trend: TrendPoint[]; summary: DailySummary | null }) {
  const fmt = (t: string) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const data = trend.map((t) => ({ ...t, time: fmt(t.timestamp) }));

  return (
    <div className="flex flex-col gap-6 pt-4">
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <ConditionCard icon={Thermometer} label="Daily min" value={`${summary.min_temp}°C`} tone="#38BDF8" />
          <ConditionCard icon={Thermometer} label="Daily max" value={`${summary.max_temp}°C`} tone="#F87171" />
          <ConditionCard icon={Thermometer} label="Daily average" value={`${summary.avg_temp}°C`} tone="#C9A227" />
        </div>
      )}
      <div className="glass p-6">
        <SectionHeader icon={Thermometer} title="Temperature trend" subtitle="Atrium vs outdoor, last 24 hours" />
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" fontSize={11} />
            <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} width={30} />
            <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.14)" }} />
            <Line type="monotone" dataKey="atrium" stroke="#38BDF8" strokeWidth={2} dot={false} name="Atrium" />
            <Line type="monotone" dataKey="outdoor" stroke="#C9A227" strokeWidth={2} dot={false} name="Outdoor" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="glass p-6">
          <SectionHeader icon={Volume2} title="Noise trend" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" fontSize={11} />
              <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} width={30} />
              <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.14)" }} />
              <Bar dataKey="noise" fill="#C9A227" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass p-6">
          <SectionHeader icon={Sun} title="Lighting trend" />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" fontSize={11} />
              <YAxis stroke="rgba(255,255,255,0.35)" fontSize={11} width={34} />
              <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid rgba(255,255,255,0.14)" }} />
              <Area type="monotone" dataKey="light" stroke="#E4C866" fill="#E4C86633" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function History({ locations }: { locations: string[] }) {
  const [rows, setRows] = useState<SensorReading[]>([]);
  const [location, setLocation] = useState("All");
  const [date, setDate] = useState("");
  const [maxTemp, setMaxTemp] = useState(32);
  const [maxNoise, setMaxNoise] = useState(80);
  const [maxBrightness, setMaxBrightness] = useState(700);
  const [sortBy, setSortBy] = useState<"timestamp" | "atrium_temp" | "noise_db" | "brightness_lux">("timestamp");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    api.getHistory({
      location: location === "All" ? undefined : location,
      date: date || undefined,
      max_temp: maxTemp, max_noise: maxNoise, max_brightness: maxBrightness,
      sort_by: sortBy, order, limit: 60,
    }).then(setRows).catch(() => setRows([]));
  }, [location, date, maxTemp, maxNoise, maxBrightness, sortBy, order]);

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="glass p-5 flex flex-wrap gap-5 items-end">
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Location</label>
          <select value={location} onChange={(e) => setLocation(e.target.value)} className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white">
            <option>All</option>
            {locations.map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
        <RangeField label={`Max temp: ${maxTemp}°C`} min={18} max={32} value={maxTemp} onChange={setMaxTemp} />
        <RangeField label={`Max noise: ${maxNoise} dB`} min={25} max={80} value={maxNoise} onChange={setMaxNoise} />
        <RangeField label={`Max brightness: ${maxBrightness} lux`} min={100} max={700} value={maxBrightness} onChange={setMaxBrightness} />
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Sort by</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white">
            <option value="timestamp">Time</option>
            <option value="atrium_temp">Temperature</option>
            <option value="noise_db">Noise</option>
            <option value="brightness_lux">Brightness</option>
          </select>
        </div>
        <button onClick={() => setOrder(order === "asc" ? "desc" : "asc")} className="px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-sm text-white">
          {order === "asc" ? "Ascending" : "Descending"}
        </button>
      </div>

      <div className="glass overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/55">
              {["Time", "Location", "Temp (°C)", "Noise (dB)", "Brightness (lux)"].map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-mono text-white/80">{new Date(r.timestamp).toLocaleString()}</td>
                <td className="px-4 py-3 text-white/80"><MapPin size={11} className="inline mr-1 -mt-0.5" />{r.location}</td>
                <td className="px-4 py-3 font-mono text-white">{r.atrium_temp}</td>
                <td className="px-4 py-3 font-mono text-white">{r.noise_db}</td>
                <td className="px-4 py-3 font-mono text-white">{r.brightness_lux}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="py-14 text-center text-white/40 text-sm">No records match your filters.</div>}
      </div>
    </div>
  );
}

function RangeField({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="min-w-[180px]">
      <label className="block text-xs text-white/50 mb-1.5">{label}</label>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-cyan" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Reports() {
  const [reports, setReports] = useState<UserReport[]>([]);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; data: Partial<UserReport> } | null>(null);
  const [filter, setFilter] = useState("All");

  const load = useCallback(() => {
    api.listReports(filter).then(setReports).catch(() => setReports([]));
  }, [filter]);
  useEffect(load, [load]);

  async function save() {
    if (!modal) return;
    const draft = {
      category: (modal.data.category ?? "Comfortable") as ReportCategory,
      location: modal.data.location ?? "Main Atrium",
      description: modal.data.description ?? "",
      author: modal.data.author ?? "Anonymous",
    };
    if (modal.mode === "create") await api.createReport(draft);
    else if (modal.data.id) await api.updateReport(modal.data.id, draft);
    setModal(null);
    load();
  }

  async function remove(id: number) {
    await api.deleteReport(id);
    load();
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <SectionHeader icon={Sparkles} title="User reports" subtitle="Community-submitted comfort feedback" />
        <div className="flex gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white">
            <option>All</option>
            {REPORT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button
            onClick={() => setModal({ mode: "create", data: { category: "Comfortable", location: "Main Atrium" } })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan text-navy text-sm font-semibold"
          >
            <Plus size={15} /> New report
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((r) => (
          <div key={r.id} className="glass p-4">
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gold/15 text-gold border border-gold/30">{r.category}</span>
              <div className="flex gap-1">
                <button onClick={() => setModal({ mode: "edit", data: r })} className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center"><Pencil size={12} /></button>
                <button onClick={() => remove(r.id)} className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center"><Trash2 size={12} /></button>
              </div>
            </div>
            <p className="text-sm text-white/85 my-3">{r.description}</p>
            <div className="flex justify-between text-xs text-white/40">
              <span><MapPin size={11} className="inline mr-1" />{r.location}</span>
              <span>{r.author} · {new Date(r.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
        {reports.length === 0 && <div className="col-span-full text-center text-white/40 text-sm py-10">No reports yet — be the first to share how this space feels.</div>}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-5" onClick={() => setModal(null)}>
          <div className="glass p-6 w-full max-w-md bg-navy/90" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-lg text-white">{modal.mode === "create" ? "New report" : "Edit report"}</h3>
              <button onClick={() => setModal(null)}><X size={16} className="text-white/60" /></button>
            </div>
            <label className="block text-xs text-white/50 mb-1.5">Category</label>
            <select
              value={modal.data.category}
              onChange={(e) => setModal({ ...modal, data: { ...modal.data, category: e.target.value as ReportCategory } })}
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white mb-3"
            >
              {REPORT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <label className="block text-xs text-white/50 mb-1.5">Description</label>
            <textarea
              rows={3}
              value={modal.data.description ?? ""}
              onChange={(e) => setModal({ ...modal, data: { ...modal.data, description: e.target.value } })}
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white mb-3"
              placeholder="Describe what you're experiencing…"
            />
            <label className="block text-xs text-white/50 mb-1.5">Name (optional)</label>
            <input
              value={modal.data.author ?? ""}
              onChange={(e) => setModal({ ...modal, data: { ...modal.data, author: e.target.value } })}
              className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white mb-4"
              placeholder="Anonymous"
            />
            <button onClick={save} className="w-full py-3 rounded-lg bg-cyan text-navy font-semibold text-sm">
              {modal.mode === "create" ? "Submit report" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
