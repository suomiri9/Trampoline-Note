import { useState } from "react";
import {
  Plus, Wrench, MoreHorizontal, Star,
  ChevronDown, LayoutGrid, BarChart2,
  Target, Layers, MoreHorizontal as More,
} from "lucide-react";

// ─── Mock data ──────────────────────────────────────────────────────────────

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
    "inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-md border tracking-wide";
  if (skill.type === "routine")
    return (
      <span className={`${base} bg-blue-500/15 border-blue-400/25 text-blue-300`}>
        <span className="text-blue-400/60">ROUTINE</span>
        <span className="font-bold text-blue-200">{skill.name}</span>
      </span>
    );
  if (skill.type === "part")
    return (
      <span className={`${base} bg-white/[0.04] border-white/10 text-white/45`}>
        <span className="text-white/30">PART</span>
        <span className="text-white/65">{skill.name}</span>
      </span>
    );
  if (skill.type === "conn")
    return (
      <span className={`${base} bg-rose-500/12 border-rose-400/25 text-rose-300`}>
        <span className="text-rose-400/60">CONN</span>
        <span className="font-bold">{skill.name}</span>
      </span>
    );
  return (
    <span className={`${base} bg-white/[0.04] border-white/10 text-white/55`}>
      {skill.code}
    </span>
  );
}

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
      <div
        className={`group flex items-center gap-3 py-3 px-2 -mx-2 rounded-xl cursor-pointer transition-colors ${
          open ? "bg-white/[0.035]" : "hover:bg-white/[0.02]"
        }`}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Accent bar */}
        <div
          className={`w-[3px] h-10 rounded-full shrink-0 transition-colors ${
            open ? "bg-blue-500" : "bg-white/10 group-hover:bg-white/20"
          }`}
        />

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] font-mono text-white/40 tracking-wide">
              {session.date}
            </span>
            <span className="text-white/15 text-[9px]">·</span>
            <span className="text-[10px] font-mono text-white/25">
              {session.time}
            </span>
            <Stars value={session.rating} />
          </div>
          <p className="text-[13px] font-semibold text-white/85 leading-snug truncate pr-2">
            {session.label}
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <div className="text-[15px] font-semibold tabular-nums leading-none text-white/55">
              {session.turns}
            </div>
            <div className="text-[7px] font-mono uppercase tracking-[0.15em] text-white/25 mt-1">
              turns
            </div>
          </div>
          <div className="text-right min-w-[42px]">
            <div className="text-[19px] font-bold tabular-nums leading-none text-blue-400">
              {session.dd.toFixed(1)}
            </div>
            <div className="text-[7px] font-mono uppercase tracking-[0.15em] text-blue-400/40 mt-1">
              dd
            </div>
          </div>
          <div className="flex items-center">
            <ChevronDown
              className={`w-3.5 h-3.5 text-white/25 transition-transform duration-200 ${
                open ? "rotate-180 text-white/45" : ""
              }`}
            />
            <button
              className="w-6 h-6 rounded-lg flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/5 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded skills */}
      {open && session.skills.length > 0 && (
        <div className="pb-2 pl-5 pr-2">
          <div className="pl-3 border-l border-white/[0.07] flex flex-col gap-2 py-1">
            {session.skills.map((skill, i) => (
              <div key={i} className="flex items-center justify-between">
                <SkillPill skill={skill} />
                <span className="text-[10px] font-mono text-white/30 tabular-nums">
                  +{skill.dd.toFixed(1)}
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

export default function TrainingLogRefined() {
  return (
    <div
      className="w-[390px] h-[844px] bg-black text-white overflow-hidden flex flex-col relative"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── Glow backdrop ── */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[520px] h-[360px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.16) 0%, rgba(59,130,246,0.03) 50%, transparent 78%)",
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

      {/* ── Hero ── */}
      <div className="flex flex-col items-center text-center px-6 pt-5 pb-6 shrink-0 relative z-10">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[9px] font-mono text-white/40 tracking-[0.18em] uppercase mb-5">
          <span className="w-1 h-1 rounded-full bg-emerald-400" />
          Training Log
        </div>

        {/* Big headline */}
        <h1
          className="leading-[0.98] font-black tracking-tight mb-3"
          style={{ fontSize: "40px" }}
        >
          <span
            style={{
              background: "linear-gradient(165deg, #ffffff 35%, rgba(255,255,255,0.5) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Track every
          </span>
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

        <p className="text-[11px] text-white/35 leading-relaxed mb-5 max-w-[220px]">
          Every session, skill, and difficulty point — in one place.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/[0.08] bg-white/[0.03] text-[11px] font-medium text-white/55 hover:bg-white/[0.06] active:scale-[0.98] transition-all">
            <Wrench className="w-3.5 h-3.5" />
            Points to Fix
          </button>
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-semibold text-white active:scale-[0.98] transition-transform"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
              boxShadow: "0 0 24px rgba(59,130,246,0.32)",
            }}
          >
            <Plus className="w-4 h-4" />
            Start Training
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="mx-4 mb-4 shrink-0 relative z-10">
        <div className="flex divide-x divide-white/[0.06] rounded-2xl overflow-hidden border border-white/[0.07] bg-white/[0.025]">
          {STATS.map((s) => (
            <div key={s.label} className="flex-1 flex flex-col items-center py-3 gap-1">
              <span
                className="text-[18px] font-bold tabular-nums leading-none"
                style={{
                  background: "linear-gradient(135deg,#60a5fa,#a78bfa)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {s.value}
              </span>
              <span className="text-[8px] font-mono uppercase tracking-[0.15em] text-white/30">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Session list ── */}
      <div className="flex-1 overflow-y-auto px-5 relative z-10 min-h-0">
        {/* Section header */}
        <div className="flex items-center justify-between sticky top-0 bg-black/95 backdrop-blur-sm py-2 z-10">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">
            Recent Sessions
          </span>
          <span className="text-[9px] font-mono text-white/20 tabular-nums">5 of 47</span>
        </div>

        <div className="divide-y divide-white/[0.05]">
          {SESSIONS.map((s, i) => (
            <SessionRow key={s.id} session={s} defaultOpen={i === 0} />
          ))}
        </div>

        <button className="w-full mt-3 mb-2 py-2.5 rounded-xl border border-white/[0.06] text-[10px] font-mono text-white/25 hover:text-white/40 hover:border-white/12 transition-colors">
          Load 30 more
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
