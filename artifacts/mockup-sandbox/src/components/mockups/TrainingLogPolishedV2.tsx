import { useState } from "react";
import {
  Plus, Wrench, MoreHorizontal, Star,
  ChevronRight, LayoutGrid, BarChart2,
  Target, Layers, MoreHorizontal as More,
  Flame, TrendingUp,
} from "lucide-react";

// ─── Mock data ────────────────────────────────────────────────────────────────

const STATS = [
  { label: "Sessions", value: "47", sub: "" },
  { label: "Streak", value: "6", sub: "d" },
  { label: "Best DD", value: "68.4", sub: "" },
  { label: "This wk", value: "3", sub: "" },
];

type Skill =
  | { type: "routine"; name: string; dd: number }
  | { type: "part"; name: string; dd: number }
  | { type: "conn"; name: string; dd: number }
  | { type: "skill"; code: string; dd: number };

type Session = {
  id: number;
  date: string;
  time: string;
  label: string;
  turns: number;
  dd: number;
  rating: number;
  skills: Skill[];
  trend?: "up" | "down" | "flat";
};

const SESSIONS: Session[] = [
  {
    id: 1,
    date: "Sat, 9 Aug",
    time: "11:22 – 12:42",
    label: "NZ NHG Championships 2026",
    turns: 9,
    dd: 47.0,
    rating: 4,
    trend: "down",
    skills: [
      { type: "routine", name: "Set", dd: 6.3 },
      { type: "skill", code: "803o", dd: 1.3 },
      { type: "part", name: "Middle 4 of 6 Doubles", dd: 2.4 },
      { type: "skill", code: "71o", dd: 0.8 },
      { type: "part", name: "Last 4 of 6 Doubles", dd: 3.0 },
    ],
  },
  {
    id: 2,
    date: "Thu, 7 Aug",
    time: "16:00 – 17:45",
    label: "Afternoon drills",
    turns: 14,
    dd: 62.4,
    rating: 5,
    trend: "up",
    skills: [
      { type: "routine", name: "Full Set", dd: 6.3 },
      { type: "skill", code: "821<", dd: 2.1 },
      { type: "skill", code: "803o", dd: 1.3 },
    ],
  },
  {
    id: 3,
    date: "Tue, 5 Aug",
    time: "15:30 – 17:00",
    label: "Tech work — back somis",
    turns: 8,
    dd: 31.2,
    rating: 3,
    trend: "flat",
    skills: [
      { type: "skill", code: "801o", dd: 0.6 },
      { type: "skill", code: "803o", dd: 1.3 },
      { type: "conn", name: "Back somi combo", dd: 2.8 },
    ],
  },
  {
    id: 4,
    date: "Sun, 3 Aug",
    time: "10:00 – 11:30",
    label: "Competition prep",
    turns: 12,
    dd: 55.6,
    rating: 4,
    trend: "up",
    skills: [
      { type: "routine", name: "Set", dd: 6.3 },
      { type: "routine", name: "Full Set", dd: 6.3 },
    ],
  },
  {
    id: 5,
    date: "Fri, 1 Aug",
    time: "16:15 – 18:00",
    label: "Light fitness session",
    turns: 6,
    dd: 19.8,
    rating: 2,
    trend: "down",
    skills: [],
  },
];

const NAV = [
  { icon: LayoutGrid, label: "Log", active: true },
  { icon: BarChart2, label: "Stats", active: false },
  { icon: Target, label: "Execution", active: false },
  { icon: Layers, label: "Skills", active: false },
  { icon: More, label: "More", active: false },
];

// ─── DD sparkline bar (mini visual for DD score) ─────────────────────────────

function DDBar({ value, max = 70 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-full h-[2px] rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct}%`,
          background: "linear-gradient(90deg,#3b82f6,#6366f1)",
        }}
      />
    </div>
  );
}

// ─── Star rating ─────────────────────────────────────────────────────────────

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-[3px] items-center">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-[9px] h-[9px] ${
            i <= value
              ? "fill-amber-400 text-amber-400"
              : "fill-transparent text-white/12"
          }`}
        />
      ))}
    </span>
  );
}

// ─── Skill pill ──────────────────────────────────────────────────────────────

function SkillPill({ skill }: { skill: Skill }) {
  const base =
    "inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-[3px] rounded-md border tracking-wide leading-none";
  if (skill.type === "routine")
    return (
      <span className={`${base} bg-blue-500/10 border-blue-500/20 text-blue-200`}>
        <span className="text-blue-400/50 text-[8px]">RTE</span>
        <span className="font-semibold">{skill.name}</span>
      </span>
    );
  if (skill.type === "part")
    return (
      <span className={`${base} bg-white/[0.03] border-white/[0.08] text-white/40`}>
        <span className="text-white/25 text-[8px]">PRT</span>
        <span className="text-white/55 truncate max-w-[140px]">{skill.name}</span>
      </span>
    );
  if (skill.type === "conn")
    return (
      <span className={`${base} bg-rose-500/10 border-rose-400/20 text-rose-200`}>
        <span className="text-rose-400/50 text-[8px]">CON</span>
        <span className="font-semibold">{skill.name}</span>
      </span>
    );
  return (
    <span className={`${base} bg-white/[0.04] border-white/[0.09] text-white/50 font-medium`}>
      {skill.code}
    </span>
  );
}

// ─── Trend indicator ─────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up")
    return <TrendingUp className="w-3 h-3 text-emerald-400/60" />;
  if (trend === "down")
    return (
      <TrendingUp className="w-3 h-3 text-white/20" style={{ transform: "scaleY(-1)" }} />
    );
  return null;
}

// ─── Session row ─────────────────────────────────────────────────────────────

function SessionRow({
  session,
  defaultOpen = false,
}: {
  session: Session;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="select-none">
      {/* Row */}
      <div
        className={`group flex items-stretch gap-0 cursor-pointer transition-colors rounded-xl -mx-1 ${
          open ? "bg-white/[0.03]" : "hover:bg-white/[0.015]"
        }`}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Left accent bar */}
        <div
          className={`w-[2px] my-2 ml-1 rounded-full shrink-0 transition-all duration-300 ${
            open ? "bg-blue-500 opacity-100" : "bg-white/[0.08] group-hover:bg-white/15"
          }`}
        />

        {/* Content */}
        <div className="flex-1 min-w-0 px-3 py-2.5">
          {/* Top row: date + stars */}
          <div className="flex items-center gap-1.5 mb-[5px]">
            <span className="text-[10px] font-mono text-white/35 tracking-wide">
              {session.date}
            </span>
            <span className="text-white/12">·</span>
            <span className="text-[9px] font-mono text-white/20">{session.time}</span>
            <div className="ml-auto">
              <Stars value={session.rating} />
            </div>
          </div>

          {/* Label */}
          <p className="text-[13px] font-semibold text-white/82 leading-snug truncate">
            {session.label}
          </p>

          {/* DD bar */}
          <div className="mt-2">
            <DDBar value={session.dd} />
          </div>
        </div>

        {/* Right column: stats */}
        <div className="flex flex-col items-end justify-center gap-0.5 pr-3 pl-1 shrink-0">
          {/* DD */}
          <div className="flex items-baseline gap-0.5">
            <span
              className="text-[20px] font-bold tabular-nums leading-none"
              style={{
                background: "linear-gradient(135deg,#60a5fa 0%,#818cf8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {session.dd.toFixed(1)}
            </span>
            <span className="text-[8px] font-mono text-blue-400/40 mb-0.5">DD</span>
          </div>

          {/* Turns + trend */}
          <div className="flex items-center gap-1">
            {session.trend && <TrendBadge trend={session.trend} />}
            <span className="text-[10px] font-mono text-white/25 tabular-nums">
              {session.turns}t
            </span>
          </div>
        </div>

        {/* Chevron */}
        <div className="flex items-center pr-2 shrink-0">
          <ChevronRight
            className={`w-3 h-3 text-white/20 transition-transform duration-200 ${
              open ? "rotate-90 text-white/40" : ""
            }`}
          />
        </div>
      </div>

      {/* Expanded skills */}
      {open && (
        <div className="ml-4 mr-2 mb-1">
          {session.skills.length > 0 ? (
            <div className="border-l border-white/[0.06] ml-1 pl-3 py-1.5 flex flex-col gap-[7px]">
              {session.skills.map((skill, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <SkillPill skill={skill} />
                  <span className="text-[10px] font-mono text-white/25 tabular-nums shrink-0">
                    +{skill.dd.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] font-mono text-white/20 pl-4 py-1.5 italic">
              No skills logged
            </p>
          )}

          {/* Actions row */}
          <div className="flex items-center gap-2 pl-4 pt-1 pb-1.5">
            <button
              className="text-[9px] font-mono text-blue-400/60 hover:text-blue-400 transition-colors tracking-wide"
              onClick={(e) => e.stopPropagation()}
            >
              EDIT
            </button>
            <span className="text-white/12">·</span>
            <button
              className="text-[9px] font-mono text-white/25 hover:text-white/50 transition-colors tracking-wide"
              onClick={(e) => e.stopPropagation()}
            >
              DUPLICATE
            </button>
            <span className="text-white/12">·</span>
            <button
              className="text-[9px] font-mono text-rose-400/40 hover:text-rose-400/80 transition-colors tracking-wide"
              onClick={(e) => e.stopPropagation()}
            >
              DELETE
            </button>
            <div className="ml-auto">
              <button
                className="w-6 h-6 rounded-lg flex items-center justify-center text-white/15 hover:text-white/40 hover:bg-white/5 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function TrainingLogPolishedV2() {
  return (
    <div
      className="w-[390px] h-[844px] bg-black text-white overflow-hidden flex flex-col relative"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── Layered glow backdrop ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: [
            "radial-gradient(ellipse 380px 280px at 50% -20px, rgba(59,130,246,0.13) 0%, transparent 70%)",
            "radial-gradient(ellipse 200px 160px at 80% 120px, rgba(99,102,241,0.06) 0%, transparent 70%)",
          ].join(","),
        }}
      />

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-6 pt-[14px] pb-1 shrink-0 relative z-10">
        <span className="text-[12px] font-semibold text-white/80 tabular-nums">9:41</span>
        <div className="flex items-center gap-1.5">
          {/* Signal bars */}
          <div className="flex gap-[3px] items-end h-3">
            {[3, 4, 5, 5].map((h, i) => (
              <div
                key={i}
                className={`w-[3px] rounded-sm ${i < 3 ? "bg-white/70" : "bg-white/20"}`}
                style={{ height: `${h * 2.2}px` }}
              />
            ))}
          </div>
          {/* Wifi */}
          <svg className="w-4 h-3 text-white/70" viewBox="0 0 16 12" fill="none">
            <path d="M8 9.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z" fill="currentColor" />
            <path d="M5.2 7.2a4 4 0 0 1 5.6 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M2.8 4.8a7 7 0 0 1 10.4 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5" />
          </svg>
          {/* Battery */}
          <div className="flex items-center gap-[2px]">
            <div className="w-[22px] h-[11px] rounded-[3px] border border-white/40 relative flex items-center px-[2px]">
              <div className="w-[14px] h-[7px] rounded-[1.5px] bg-white/75" />
            </div>
            <div className="w-[2px] h-[5px] rounded-r-sm bg-white/30" />
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="flex items-start justify-between px-5 pt-4 pb-0 shrink-0 relative z-10">
        <div>
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/[0.07] bg-white/[0.025] mb-3">
            <Flame className="w-2.5 h-2.5 text-emerald-400/80" />
            <span className="text-[8.5px] font-mono text-white/35 tracking-[0.16em] uppercase">
              Training Log
            </span>
          </div>
          {/* Headline */}
          <h1 className="leading-[0.96] font-black tracking-[-0.02em]" style={{ fontSize: "36px" }}>
            <span
              style={{
                background: "linear-gradient(160deg, #ffffff 40%, rgba(255,255,255,0.45) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Track every
            </span>
            <br />
            <span
              style={{
                background: "linear-gradient(130deg, #60a5fa 0%, #3b82f6 45%, #818cf8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              jump.
            </span>
          </h1>
        </div>

        {/* CTA buttons — vertical stack on right */}
        <div className="flex flex-col gap-2 mt-1">
          <button
            className="flex items-center gap-1.5 px-3.5 py-[9px] rounded-xl text-[11px] font-semibold text-white whitespace-nowrap"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
              boxShadow: "0 2px 20px rgba(59,130,246,0.3), 0 0 0 1px rgba(99,102,241,0.2)",
            }}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            Start Training
          </button>
          <button className="flex items-center gap-1.5 px-3.5 py-[9px] rounded-xl border border-white/[0.08] bg-white/[0.03] text-[11px] font-medium text-white/45 hover:bg-white/[0.06] whitespace-nowrap transition-colors">
            <Wrench className="w-3 h-3 shrink-0" />
            Points to Fix
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="mx-4 mt-4 mb-3 shrink-0 relative z-10">
        <div
          className="flex rounded-2xl overflow-hidden border border-white/[0.065]"
          style={{ background: "rgba(255,255,255,0.018)" }}
        >
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={`flex-1 flex flex-col items-center py-3 gap-[5px] ${
                i < STATS.length - 1 ? "border-r border-white/[0.05]" : ""
              }`}
            >
              <div className="flex items-baseline gap-[1px]">
                <span
                  className="text-[17px] font-bold tabular-nums leading-none"
                  style={{
                    background: "linear-gradient(135deg,#60a5fa,#a78bfa)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {s.value}
                </span>
                {s.sub && (
                  <span
                    className="text-[10px] font-bold"
                    style={{
                      background: "linear-gradient(135deg,#60a5fa,#a78bfa)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    {s.sub}
                  </span>
                )}
              </div>
              <span className="text-[7.5px] font-mono uppercase tracking-[0.14em] text-white/28">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Session list ── */}
      <div className="flex-1 overflow-y-auto px-4 relative z-10 min-h-0">
        {/* Section header */}
        <div className="flex items-center justify-between sticky top-0 z-10 py-2" style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(12px)" }}>
          <div className="flex items-center gap-2">
            <span className="text-[8.5px] font-mono uppercase tracking-[0.18em] text-white/28">
              Recent Sessions
            </span>
            <div className="h-[1px] w-8 bg-white/[0.06]" />
          </div>
          <span className="text-[8.5px] font-mono text-white/18 tabular-nums">
            5 of 47
          </span>
        </div>

        {/* Rows */}
        <div className="flex flex-col gap-[2px]">
          {SESSIONS.map((s, i) => (
            <SessionRow key={s.id} session={s} defaultOpen={i === 0} />
          ))}
        </div>

        {/* Load more */}
        <button className="w-full mt-3 mb-3 py-2.5 rounded-xl border border-white/[0.05] text-[9.5px] font-mono text-white/22 hover:text-white/38 hover:border-white/10 tracking-wide transition-colors">
          LOAD 30 MORE
        </button>
      </div>

      {/* ── Bottom nav ── */}
      <div
        className="shrink-0 border-t border-white/[0.05] px-1 pt-2 pb-7 flex items-center justify-around relative z-20"
        style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(24px)" }}
      >
        {NAV.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            className="flex flex-col items-center gap-[3px] px-3 py-1"
          >
            <div className="relative flex items-center justify-center">
              {active && (
                <span
                  className="absolute inset-0 rounded-full blur-md"
                  style={{ background: "rgba(59,130,246,0.35)" }}
                />
              )}
              <Icon
                className={`w-[19px] h-[19px] relative z-10 transition-colors ${
                  active ? "text-blue-400" : "text-white/25"
                }`}
              />
            </div>
            <span
              className={`text-[9px] font-medium tracking-tight transition-colors ${
                active ? "text-blue-400" : "text-white/25"
              }`}
            >
              {label}
            </span>
            {active && (
              <div
                className="w-4 h-[2px] rounded-full"
                style={{ background: "linear-gradient(90deg,#3b82f6,#6366f1)" }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
