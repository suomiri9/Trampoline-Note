import { useState } from "react";
import {
  Plus, Wrench, MoreHorizontal, Star,
  LayoutGrid, BarChart2, Target, Layers,
  MoreHorizontal as More, ArrowUpRight, Flame,
} from "lucide-react";

// ─── Mock data (identical content to TrainingLogRefined) ─────────────────────

const STATS = [
  { label: "Sessions", value: "47" },
  { label: "Streak", value: "6d" },
  { label: "Best DD", value: "68.4" },
  { label: "This wk", value: "3" },
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
};

const SESSIONS: Session[] = [
  {
    id: 1,
    date: "Sat, 9 Aug",
    time: "11:22 – 12:42",
    label: "NZ NHG Championships 2026, 1st",
    turns: 9,
    dd: 47.0,
    rating: 4,
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-px">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-2 h-2 ${
            i <= value
              ? "fill-amber-400 text-amber-400"
              : "fill-transparent text-white/15"
          }`}
        />
      ))}
    </span>
  );
}

function SkillPill({ skill }: { skill: Skill }) {
  const base =
    "inline-flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded-md border tracking-wide whitespace-nowrap";
  if (skill.type === "routine")
    return (
      <span className={`${base} bg-blue-500/15 border-blue-400/25 text-blue-300`}>
        <span className="font-bold text-blue-200">{skill.name}</span>
      </span>
    );
  if (skill.type === "part")
    return (
      <span className={`${base} bg-white/[0.04] border-white/10 text-white/55`}>
        {skill.name}
      </span>
    );
  if (skill.type === "conn")
    return (
      <span className={`${base} bg-rose-500/12 border-rose-400/25 text-rose-300`}>
        <span className="font-bold">{skill.name}</span>
      </span>
    );
  return (
    <span className={`${base} bg-white/[0.04] border-white/10 text-white/55`}>
      {skill.code}
    </span>
  );
}

/* Featured card — the latest session carries the most visual weight, DD as hero */
function FeaturedCard({ session }: { session: Session }) {
  return (
    <div
      className="relative rounded-2xl border border-blue-400/20 overflow-hidden p-4"
      style={{
        background:
          "linear-gradient(150deg, rgba(59,130,246,0.14) 0%, rgba(99,102,241,0.05) 55%, rgba(255,255,255,0.02) 100%)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-500/20 border border-blue-400/25 text-[8px] font-mono uppercase tracking-[0.15em] text-blue-300 mb-2">
            Latest
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-mono text-white/45 tracking-wide">
              {session.date}
            </span>
            <Stars value={session.rating} />
          </div>
          <p className="text-[14px] font-semibold text-white/90 leading-snug pr-2">
            {session.label}
          </p>
        </div>
        {/* Hero DD number — dominant visual weight */}
        <div className="text-right shrink-0">
          <div className="text-[46px] font-black tabular-nums leading-[0.85] text-blue-400">
            {session.dd.toFixed(1)}
          </div>
          <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-blue-400/50 mt-1">
            total dd
          </div>
        </div>
      </div>

      {/* Inline meta row */}
      <div className="flex items-center gap-4 mt-3 text-[10px] font-mono text-white/40">
        <span className="tabular-nums">{session.turns} turns</span>
        <span className="text-white/15">·</span>
        <span className="tabular-nums">{session.time}</span>
      </div>

      {/* Skill pills wrap horizontally */}
      {session.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {session.skills.map((skill, i) => (
            <SkillPill key={i} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}

/* Compact grid card — denser, 2-up layout */
function GridCard({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((o) => !o)}
      className="group text-left rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 hover:border-white/15 hover:bg-white/[0.04] transition-colors flex flex-col"
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-[9px] font-mono text-white/40 tracking-wide">
          {session.date}
        </span>
        <Stars value={session.rating} />
      </div>

      <p className="text-[11px] font-semibold text-white/80 leading-snug mt-1.5 line-clamp-2 min-h-[28px]">
        {session.label}
      </p>

      {/* DD as the card's weighted focal point */}
      <div className="flex items-end justify-between mt-2 pt-2 border-t border-white/[0.05]">
        <div>
          <div className="text-[22px] font-bold tabular-nums leading-none text-blue-400">
            {session.dd.toFixed(1)}
          </div>
          <div className="text-[7px] font-mono uppercase tracking-[0.15em] text-blue-400/40 mt-0.5">
            dd
          </div>
        </div>
        <div className="text-right">
          <div className="text-[13px] font-semibold tabular-nums leading-none text-white/50">
            {session.turns}
          </div>
          <div className="text-[7px] font-mono uppercase tracking-[0.15em] text-white/25 mt-0.5">
            turns
          </div>
        </div>
      </div>

      {open && session.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {session.skills.map((skill, i) => (
            <SkillPill key={i} skill={skill} />
          ))}
        </div>
      )}
    </button>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function TrainingLogGrid() {
  const [featured, ...rest] = SESSIONS;
  return (
    <div
      className="w-[390px] h-[844px] bg-black text-white overflow-hidden flex flex-col relative"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── Glow backdrop ── */}
      <div
        className="absolute top-0 left-0 w-[420px] h-[320px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 12% 0%, rgba(59,130,246,0.16) 0%, rgba(59,130,246,0.03) 48%, transparent 76%)",
        }}
      />

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-6 pt-3 pb-1 shrink-0 relative z-10">
        <span className="text-[12px] font-semibold text-white/85 tabular-nums">9:41</span>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5 items-end h-3">
            {[2, 3, 4, 4].map((h, i) => (
              <div
                key={i}
                className="w-1 rounded-sm bg-white/70"
                style={{ height: `${h * 3}px` }}
              />
            ))}
          </div>
          <svg className="w-4 h-3" viewBox="0 0 16 12" fill="none">
            <rect x="0.5" y="0.5" width="13" height="11" rx="3.5" stroke="white" strokeOpacity="0.7" />
            <rect x="2" y="2" width="8" height="8" rx="2" fill="white" fillOpacity="0.7" />
            <path d="M14.5 4.5v3a1.5 1.5 0 0 0 0-3Z" fill="white" fillOpacity="0.4" />
          </svg>
        </div>
      </div>

      {/* ── Scroll region ── */}
      <div className="flex-1 overflow-y-auto relative z-10 min-h-0 px-4 pt-2">
        {/* Left-anchored header: title left, action buttons right on one horizontal bar */}
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[8px] font-mono text-white/40 tracking-[0.18em] uppercase mb-2">
              <span className="w-1 h-1 rounded-full bg-emerald-400" />
              Training Log
            </div>
            <h1 className="leading-[0.95] font-black tracking-tight" style={{ fontSize: "30px" }}>
              <span
                style={{
                  background: "linear-gradient(135deg, #ffffff 30%, rgba(255,255,255,0.55) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Every{" "}
              </span>
              <span
                style={{
                  background: "linear-gradient(135deg, #60a5fa 0%, #6366f1 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                jump.
              </span>
            </h1>
          </div>

          <button
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold text-white active:scale-[0.98] transition-transform shrink-0"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
              boxShadow: "0 0 20px rgba(59,130,246,0.3)",
            }}
          >
            <Plus className="w-4 h-4" />
            Start
          </button>
        </div>

        {/* Stats as a horizontal chip rail (re-grouped from divided strip) */}
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2 shrink-0 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2"
            >
              {s.label === "Streak" && <Flame className="w-3 h-3 text-amber-400/70" />}
              <span
                className="text-[15px] font-bold tabular-nums leading-none"
                style={{
                  background: "linear-gradient(135deg,#60a5fa,#a78bfa)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {s.value}
              </span>
              <span className="text-[8px] font-mono uppercase tracking-[0.12em] text-white/30">
                {s.label}
              </span>
            </div>
          ))}
        </div>

        {/* Featured latest session — top of hierarchy */}
        <FeaturedCard session={featured} />

        {/* Secondary: two-column card grid */}
        <div className="flex items-center justify-between mt-5 mb-2.5">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">
            Earlier Sessions
          </span>
          <button className="inline-flex items-center gap-1 text-[9px] font-mono text-white/25 hover:text-white/50 transition-colors">
            View all
            <ArrowUpRight className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {rest.map((s) => (
            <GridCard key={s.id} session={s} />
          ))}
        </div>

        {/* Points to Fix moved to a footer utility row */}
        <button className="w-full mt-3 mb-3 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/[0.06] text-[10px] font-medium text-white/40 hover:text-white/65 hover:border-white/12 transition-colors">
          <Wrench className="w-3.5 h-3.5" />
          Points to Fix
        </button>

        <button className="w-full mb-2 py-2.5 rounded-xl border border-white/[0.06] text-[10px] font-mono text-white/25 hover:text-white/40 hover:border-white/12 transition-colors">
          Load 30 more · showing 5 of 47
        </button>
      </div>

      {/* ── Bottom nav ── */}
      <div
        className="shrink-0 border-t border-white/[0.06] px-2 pt-2 pb-6 flex items-center justify-around relative z-20"
        style={{ background: "rgba(0,0,0,0.9)", backdropFilter: "blur(20px)" }}
      >
        {NAV.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            className="flex flex-col items-center gap-1 px-2 py-1 rounded-xl transition-colors"
          >
            <div
              className={`w-9 h-7 rounded-lg flex items-center justify-center transition-colors ${
                active ? "bg-blue-500/15" : "bg-transparent"
              }`}
            >
              <Icon
                className={`w-[18px] h-[18px] ${active ? "text-blue-400" : "text-white/30"}`}
              />
            </div>
            <span
              className={`text-[9px] font-medium tracking-tight ${
                active ? "text-blue-400" : "text-white/30"
              }`}
            >
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
