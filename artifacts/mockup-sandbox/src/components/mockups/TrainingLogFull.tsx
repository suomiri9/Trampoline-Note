import { useState } from "react";
import {
  Plus, Wrench, MoreHorizontal, Star,
  ChevronDown, LayoutGrid, Trophy, BarChart2,
  Target, Layers, MoreHorizontal as More, Bot,
} from "lucide-react";

// ─── Mock data ──────────────────────────────────────────────────────────────

const STATS = [
  { label: "Sessions", value: "47" },
  { label: "Streak", value: "6d" },
  { label: "Best DD", value: "68.4" },
  { label: "This week", value: "3" },
];

const SESSIONS = [
  {
    id: 1,
    date: "Sat, 9 Aug",
    time: "11:22 – 12:42 am",
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
    time: "4:00 – 5:45 pm",
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
    time: "3:30 – 5:00 pm",
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
    time: "10:00 – 11:30 am",
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
    time: "4:15 – 6:00 pm",
    label: "Light fitness session",
    turns: 6,
    dd: 19.8,
    rating: 2,
    skills: [],
  },
];

const NAV = [
  { icon: LayoutGrid, label: "Log",       active: true  },
  { icon: Trophy,     label: "Debuts",    active: false },
  { icon: BarChart2,  label: "Stats",     active: false },
  { icon: Target,     label: "Execution", active: false },
  { icon: Layers,     label: "Skills",    active: false },
  { icon: More,       label: "More",      active: false },
  { icon: Bot,        label: "Coach",     active: false },
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
              ? "fill-yellow-400 text-yellow-400"
              : "fill-transparent text-white/10"
          }`}
        />
      ))}
    </span>
  );
}

function SkillPill({ skill }: { skill: (typeof SESSIONS)[0]["skills"][0] }) {
  const base =
    "inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full border";
  if (skill.type === "routine")
    return (
      <span className={`${base} bg-blue-600/20 border-blue-500/25 text-blue-300`}>
        ROUTINE <span className="font-bold text-blue-200">{skill.name}</span>
      </span>
    );
  if (skill.type === "part")
    return (
      <span className={`${base} bg-white/5 border-white/8 text-white/40`}>
        PART <span className="text-white/60">{skill.name}</span>
      </span>
    );
  if (skill.type === "conn")
    return (
      <span className={`${base} bg-red-500/10 border-red-500/20 text-red-300`}>
        CONN <span className="font-bold">{skill.name}</span>
      </span>
    );
  return (
    <span className={`${base} bg-white/5 border-white/10 text-white/50`}>
      {skill.code}
    </span>
  );
}

function SessionRow({
  session,
  defaultOpen = false,
}: {
  session: (typeof SESSIONS)[0];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="cursor-pointer select-none" onClick={() => setOpen((o) => !o)}>
      <div className="flex items-center gap-2.5 py-3.5 border-t border-white/[0.05] hover:bg-white/[0.02] px-1 -mx-1 rounded-lg transition-colors">
        {/* Accent bar */}
        <div className="w-0.5 h-9 rounded-full bg-gradient-to-b from-blue-400 to-blue-600/40 shrink-0" />

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-mono text-white/30 tracking-wide">{session.date}</span>
            <span className="text-white/15 text-[9px]">·</span>
            <span className="text-[10px] font-mono text-white/20">{session.time}</span>
            <Stars value={session.rating} />
          </div>
          <p className="text-[12px] font-semibold text-white/75 leading-snug truncate pr-2">
            {session.label}
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-[17px] font-bold tabular-nums leading-none text-white/35">
              {session.turns}
            </div>
            <div className="text-[7px] font-mono uppercase tracking-widest text-white/15 mt-0.5">turns</div>
          </div>
          <div className="text-right">
            <div className="text-[17px] font-bold tabular-nums leading-none text-blue-400">
              {session.dd.toFixed(1)}
            </div>
            <div className="text-[7px] font-mono uppercase tracking-widest text-white/15 mt-0.5">dd</div>
          </div>
          <div className="flex items-center gap-0.5">
            <ChevronDown
              className={`w-3 h-3 text-white/15 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
            <button
              className="w-5 h-5 rounded-full flex items-center justify-center text-white/15 hover:text-white/40 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded skills */}
      {open && session.skills.length > 0 && (
        <div className="pb-1 px-1 -mx-1">
          <div className="ml-4 pl-3 border-l border-white/[0.05] flex flex-col gap-1.5 pb-2">
            {session.skills.map((skill, i) => (
              <div key={i} className="flex items-center justify-between">
                <SkillPill skill={skill} />
                <span className="text-[10px] font-mono text-white/25 tabular-nums">
                  {skill.dd.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function TrainingLogFull() {
  return (
    <div
      className="w-[390px] h-[844px] bg-black text-white overflow-hidden flex flex-col relative"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── Glow backdrop ── */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[400px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(37,99,235,0.18) 0%, rgba(37,99,235,0.04) 55%, transparent 80%)",
        }}
      />

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-6 pt-3 pb-1 shrink-0 relative z-10">
        <span className="text-[12px] font-semibold text-white/80">9:41</span>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5 items-end h-3">
            {[2,3,4,4].map((h,i) => (
              <div key={i} className="w-1 rounded-sm bg-white/70" style={{ height: `${h * 3}px` }} />
            ))}
          </div>
          <svg className="w-4 h-3" viewBox="0 0 16 12" fill="none">
            <rect x="0.5" y="0.5" width="13" height="11" rx="3.5" stroke="white" strokeOpacity="0.7"/>
            <rect x="2" y="2" width="8" height="8" rx="2" fill="white" fillOpacity="0.7"/>
            <path d="M14.5 4.5v3a1.5 1.5 0 0 0 0-3Z" fill="white" fillOpacity="0.4"/>
          </svg>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="flex flex-col items-center text-center px-6 pt-4 pb-5 shrink-0 relative z-10">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[9px] font-mono text-white/35 tracking-widest uppercase mb-4">
          <span className="w-1 h-1 rounded-full bg-green-400" />
          Training Log
        </div>

        {/* Big headline */}
        <h1
          className="leading-[1.0] font-black tracking-tight mb-2"
          style={{
            fontSize: "38px",
            background: "linear-gradient(160deg, #ffffff 30%, rgba(255,255,255,0.55) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Track every
          <br />
          <span
            style={{
              background: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 50%, #6366f1 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            jump.
          </span>
        </h1>

        <p className="text-[11px] text-white/30 leading-relaxed mb-5 max-w-[220px]">
          Every session, skill, and difficulty point — in one place.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[11px] font-medium text-white/40 hover:bg-white/[0.06] transition-colors">
            <Wrench className="w-3 h-3" />
            Points to Fix
          </button>
          <button
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[11px] font-semibold text-white transition-colors"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
              boxShadow: "0 0 20px rgba(59,130,246,0.35)",
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Start Training
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="mx-4 mb-3 shrink-0 relative z-10">
        <div
          className="flex divide-x divide-white/[0.05] rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          {STATS.map((s) => (
            <div key={s.label} className="flex-1 flex flex-col items-center py-2.5 gap-0.5">
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
              <span className="text-[8px] font-mono uppercase tracking-widest text-white/20">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Session list ── */}
      <div className="flex-1 overflow-y-auto px-4 relative z-10 min-h-0">
        {/* Section header */}
        <div className="flex items-center justify-between mb-0.5 sticky top-0 bg-black/90 backdrop-blur-sm py-1.5">
          <span className="text-[9px] font-mono uppercase tracking-widest text-white/20">
            Recent Sessions
          </span>
          <span className="text-[9px] font-mono text-white/15">5 of 47</span>
        </div>

        {SESSIONS.map((s, i) => (
          <SessionRow key={s.id} session={s} defaultOpen={i === 0} />
        ))}

        <button className="w-full mt-3 mb-2 py-2.5 rounded-xl border border-white/[0.05] text-[10px] font-mono text-white/20 hover:text-white/35 hover:border-white/10 transition-colors">
          Load 30 more
        </button>
      </div>

      {/* ── Bottom nav ── */}
      <div
        className="shrink-0 border-t border-white/[0.05] px-2 pt-2 pb-5 flex items-center justify-around relative z-20"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)" }}
      >
        {NAV.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-colors"
          >
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors ${
                active
                  ? "bg-blue-600/20"
                  : "bg-transparent"
              }`}
              style={active ? { boxShadow: "0 0 10px rgba(59,130,246,0.25)" } : {}}
            >
              <Icon
                className={`w-4 h-4 ${active ? "text-blue-400" : "text-white/25"}`}
              />
            </div>
            <span
              className={`text-[8px] font-mono ${active ? "text-blue-400" : "text-white/20"}`}
            >
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
