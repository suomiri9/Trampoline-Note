import { useState } from "react";
import {
  Plus,
  Wrench,
  MoreHorizontal,
  Star,
  ChevronRight,
  LayoutGrid,
  BarChart2,
  Target,
  Layers,
  Settings2,
} from "lucide-react";

// ─── Mock data ────────────────────────────────────────────────────────────────

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
  { icon: Settings2, label: "More", active: false },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`w-2.5 h-2.5 ${
            i <= value
              ? "fill-amber-400 text-amber-400"
              : "fill-transparent text-white/10"
          }`}
        />
      ))}
    </span>
  );
}

const PILL_STYLES: Record<string, string> = {
  routine: "bg-blue-500/10 border-blue-400/20 text-blue-300",
  part: "bg-white/[0.04] border-white/10 text-white/45",
  conn: "bg-rose-500/10 border-rose-400/20 text-rose-300",
  skill: "bg-white/[0.04] border-white/10 text-white/50",
};

const PILL_LABEL_STYLES: Record<string, string> = {
  routine: "text-blue-400/50",
  part: "text-white/25",
  conn: "text-rose-400/50",
};

function SkillPill({ skill }: { skill: Skill }) {
  const base =
    "inline-flex items-center gap-1.5 text-[9px] font-mono px-2 py-1 rounded-lg border tracking-wide leading-none";
  const typeStyle = PILL_STYLES[skill.type] ?? PILL_STYLES.skill;

  if (skill.type === "skill") {
    return (
      <span className={`${base} ${typeStyle}`}>
        <span className="font-bold">{skill.code}</span>
      </span>
    );
  }

  const labelStyle = PILL_LABEL_STYLES[skill.type] ?? "";
  const nameText =
    skill.type === "routine"
      ? (skill as { name: string }).name
      : skill.type === "part"
        ? (skill as { name: string }).name
        : (skill as { name: string }).name;

  return (
    <span className={`${base} ${typeStyle}`}>
      <span className={`uppercase tracking-[0.12em] ${labelStyle}`}>
        {skill.type}
      </span>
      <span className="text-white/20 text-[7px]">·</span>
      <span className="font-medium">{nameText}</span>
    </span>
  );
}

/** Thin DD bar behind session rows — relative width vs max session DD */
const MAX_DD = Math.max(...SESSIONS.map((s) => s.dd));

function SessionRow({
  session,
  defaultOpen = false,
}: {
  session: Session;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const barWidth = Math.round((session.dd / MAX_DD) * 100);

  return (
    <div className="select-none">
      <div
        className={`group relative flex items-center gap-3 py-3.5 px-3 -mx-3 rounded-2xl cursor-pointer transition-colors duration-150 ${
          open ? "bg-white/[0.04]" : "hover:bg-white/[0.025]"
        }`}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Left accent bar — thicker when open */}
        <div
          className={`w-[3px] self-stretch rounded-full shrink-0 transition-colors duration-200 ${
            open
              ? "bg-gradient-to-b from-blue-400 to-indigo-500"
              : "bg-white/[0.08] group-hover:bg-white/[0.15]"
          }`}
        />

        {/* Meta column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-mono font-medium text-white/40 tracking-wide">
              {session.date}
            </span>
            <Stars value={session.rating} />
          </div>
          <p className="text-[13.5px] font-semibold text-white/80 leading-snug truncate pr-1">
            {session.label}
          </p>
          <p className="text-[10px] font-mono text-white/20 mt-0.5">
            {session.time}
          </p>
        </div>

        {/* Stats column */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Turns */}
          <div className="text-right">
            <div className="text-[14px] font-semibold tabular-nums leading-none text-white/40">
              {session.turns}
            </div>
            <div className="text-[7px] font-mono uppercase tracking-[0.14em] text-white/20 mt-1">
              turns
            </div>
          </div>

          {/* DD — hero number */}
          <div className="text-right min-w-[48px]">
            <div
              className="text-[22px] font-black tabular-nums leading-none"
              style={{
                background: "linear-gradient(135deg, #60a5fa 0%, #818cf8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              {session.dd.toFixed(1)}
            </div>
            <div className="text-[7px] font-mono uppercase tracking-[0.14em] text-blue-400/35 mt-1">
              dd
            </div>
          </div>

          {/* Chevron */}
          <ChevronRight
            className={`w-3.5 h-3.5 text-white/20 transition-transform duration-200 ${
              open ? "rotate-90 text-white/40" : "group-hover:text-white/35"
            }`}
          />
        </div>

        {/* Subtle DD progress bar at bottom of row */}
        <div
          className="absolute bottom-0 left-3 right-3 h-px rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${barWidth}%`,
              background: open
                ? "linear-gradient(90deg, rgba(96,165,250,0.5), rgba(129,140,248,0.3))"
                : "rgba(255,255,255,0.07)",
              transition: "background 0.2s",
            }}
          />
        </div>
      </div>

      {/* Expanded skills */}
      {open && (
        <div className="pt-0.5 pb-3 pl-6 pr-3">
          {session.skills.length > 0 ? (
            <div className="pl-3 border-l-2 border-blue-500/20 flex flex-col gap-2.5 py-2">
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
            <p className="text-[10px] font-mono text-white/20 py-2 pl-3">
              No skills logged
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TrainingLogPolished() {
  return (
    <div
      className="w-[390px] h-[844px] bg-black text-white overflow-hidden flex flex-col relative"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[560px] h-[300px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% -10%, rgba(59,130,246,0.18) 0%, rgba(99,102,241,0.06) 50%, transparent 72%)",
        }}
      />

      {/* ── Status bar ── */}
      <div className="flex items-center justify-between px-6 pt-3.5 pb-0 shrink-0 relative z-10">
        <span className="text-[12px] font-semibold text-white/80 tabular-nums tracking-tight">
          9:41
        </span>
        <div className="flex items-center gap-1.5">
          {/* Signal bars */}
          <div className="flex gap-[2px] items-end h-3">
            {[40, 60, 80, 100].map((opacity, i) => (
              <div
                key={i}
                className="w-[3px] rounded-sm"
                style={{
                  height: `${7 + i * 2}px`,
                  background: `rgba(255,255,255,${opacity / 100})`,
                }}
              />
            ))}
          </div>
          {/* Battery */}
          <svg className="w-[22px] h-[11px]" viewBox="0 0 22 11" fill="none">
            <rect
              x="0.5"
              y="0.5"
              width="18"
              height="10"
              rx="2.5"
              stroke="white"
              strokeOpacity="0.5"
            />
            <rect x="2" y="2" width="12" height="7" rx="1.5" fill="white" fillOpacity="0.75" />
            <path d="M19.5 3.5v4a2 2 0 0 0 0-4Z" fill="white" fillOpacity="0.4" />
          </svg>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0 relative z-10">
        <div>
          {/* Eyebrow */}
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className="w-[5px] h-[5px] rounded-full"
              style={{ background: "linear-gradient(135deg,#34d399,#10b981)" }}
            />
            <span className="text-[9px] font-mono text-white/35 tracking-[0.2em] uppercase">
              Training Log
            </span>
          </div>
          {/* Headline */}
          <h1
            className="leading-none font-black tracking-tight"
            style={{ fontSize: "34px" }}
          >
            <span
              style={{
                background: "linear-gradient(160deg, #ffffff 40%, rgba(255,255,255,0.55) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Track every{" "}
            </span>
            <span
              style={{
                background: "linear-gradient(135deg, #60a5fa 0%, #818cf8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              jump.
            </span>
          </h1>
        </div>

        {/* Action buttons — right side */}
        <div className="flex flex-col items-end gap-2">
          <button
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-semibold text-white transition-transform active:scale-[0.97]"
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
              boxShadow: "0 2px 20px rgba(59,130,246,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          >
            <Plus className="w-4 h-4" />
            Start Training
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[10px] font-medium text-white/45 hover:bg-white/[0.06] transition-colors">
            <Wrench className="w-3 h-3" />
            Points to Fix
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="mx-4 mb-4 shrink-0 relative z-10">
        <div
          className="flex rounded-2xl overflow-hidden border"
          style={{
            borderColor: "rgba(255,255,255,0.07)",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 100%)",
          }}
        >
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className="flex-1 flex flex-col items-center py-3.5 gap-1"
              style={{
                borderRight:
                  i < STATS.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
              }}
            >
              <span
                className="text-[21px] font-black tabular-nums leading-none"
                style={{
                  background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {s.value}
              </span>
              <span className="text-[7.5px] font-mono uppercase tracking-[0.16em] text-white/25">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Session list ── */}
      <div className="flex-1 overflow-y-auto px-5 relative z-10 min-h-0">
        {/* Section header */}
        <div
          className="flex items-center justify-between sticky top-0 py-2.5 z-10"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,1) 70%, rgba(0,0,0,0))",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/25">
              Recent Sessions
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-mono text-white/18 tabular-nums">
              5 of 47
            </span>
            <button className="w-5 h-5 rounded-md flex items-center justify-center text-white/20 hover:text-white/40 hover:bg-white/5 transition-colors">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col">
          {SESSIONS.map((s, i) => (
            <SessionRow key={s.id} session={s} defaultOpen={i === 0} />
          ))}
        </div>

        {/* Load more */}
        <button
          className="w-full mt-2 mb-3 py-3 rounded-xl border border-white/[0.05] text-[10px] font-mono text-white/20 hover:text-white/35 hover:border-white/10 transition-colors"
        >
          Load 30 more sessions
        </button>
      </div>

      {/* ── Bottom nav ── */}
      <div
        className="shrink-0 px-1 pt-1.5 pb-7 flex items-center justify-around relative z-20"
        style={{
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(24px)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {NAV.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            className="flex flex-col items-center gap-1 px-2.5 py-1 rounded-xl transition-colors"
          >
            <div
              className={`w-10 h-7 rounded-xl flex items-center justify-center transition-colors duration-150 ${
                active ? "" : "bg-transparent"
              }`}
              style={
                active
                  ? {
                      background:
                        "linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.12))",
                      boxShadow: "inset 0 1px 0 rgba(96,165,250,0.1)",
                    }
                  : {}
              }
            >
              <Icon
                className={`w-[19px] h-[19px] transition-colors ${
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
          </button>
        ))}
      </div>
    </div>
  );
}
