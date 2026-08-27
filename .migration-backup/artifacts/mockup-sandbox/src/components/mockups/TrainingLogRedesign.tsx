import { useState } from "react";
import { Plus, Wrench, MoreHorizontal, Star, ChevronDown } from "lucide-react";

// ─── Mock data ──────────────────────────────────────────────────────────────

const SESSIONS = [
  {
    id: 1,
    date: "Sat, 9 Aug 2026",
    time: "11:22 am – 12:42 am",
    label: "NZ NHG Championships 2026, 1st",
    turns: 9,
    dd: 47.0,
    rating: 4,
    skills: [
      { type: "routine", name: "Set", dd: 6.3 },
      { type: "skill",   code: "803o", dd: 1.3 },
      { type: "part",    name: "Middle 4 of 6 Doubles", attempt: "2/4", dd: 2.4 },
      { type: "skill",   code: "71o", dd: 0.8 },
      { type: "part",    name: "Last 4 of 6 Doubles", dd: 3.0 },
    ],
  },
  {
    id: 2,
    date: "Thu, 7 Aug 2026",
    time: "4:00 pm – 5:45 pm",
    label: "Afternoon drills",
    turns: 14,
    dd: 62.4,
    rating: 5,
    skills: [
      { type: "routine", name: "Full Set", dd: 6.3 },
      { type: "skill",   code: "821<", dd: 2.1 },
      { type: "skill",   code: "803o", dd: 1.3 },
    ],
  },
  {
    id: 3,
    date: "Tue, 5 Aug 2026",
    time: "3:30 pm – 5:00 pm",
    label: "Tech work — back somis",
    turns: 8,
    dd: 31.2,
    rating: 3,
    skills: [
      { type: "skill", code: "801o", dd: 0.6 },
      { type: "skill", code: "803o", dd: 1.3 },
      { type: "conn",  name: "Back somi combo", dd: 2.8 },
    ],
  },
  {
    id: 4,
    date: "Sun, 3 Aug 2026",
    time: "10:00 am – 11:30 am",
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
    date: "Fri, 1 Aug 2026",
    time: "4:15 pm – 6:00 pm",
    label: "Light fitness session",
    turns: 6,
    dd: 19.8,
    rating: 2,
    skills: [],
  },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function Stars({ value }: { value: number }) {
  return (
    <span className="flex gap-px">
      {[1,2,3,4,5].map(i => (
        <Star
          key={i}
          className={`w-2.5 h-2.5 ${i <= value ? "fill-yellow-400 text-yellow-400" : "fill-transparent text-white/15"}`}
        />
      ))}
    </span>
  );
}

function SkillPill({ skill }: { skill: typeof SESSIONS[0]["skills"][0] }) {
  const base = "inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border";
  if (skill.type === "routine")
    return <span className={`${base} bg-blue-600/20 border-blue-500/30 text-blue-300`}>ROUTINE <span className="font-bold text-blue-200">{skill.name}</span></span>;
  if (skill.type === "part")
    return <span className={`${base} bg-white/5 border-white/10 text-white/50`}>PART <span className="text-white/70 font-semibold">{skill.name}</span></span>;
  if (skill.type === "conn")
    return <span className={`${base} bg-red-500/15 border-red-500/25 text-red-300`}>CONN <span className="font-bold">{skill.name}</span></span>;
  // plain skill code
  return <span className={`${base} bg-white/5 border-white/10 text-white/60`}>{skill.code}</span>;
}

function SessionRow({ session, defaultOpen = false }: { session: typeof SESSIONS[0]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="group cursor-pointer select-none"
      onClick={() => setOpen(o => !o)}
    >
      {/* ── Main row ── */}
      <div className="flex items-center gap-3 py-4 border-t border-white/[0.06] transition-colors group-hover:bg-white/[0.025] px-1 rounded-lg -mx-1">

        {/* Left accent */}
        <div className="w-0.5 h-10 rounded-full bg-blue-500/60 shrink-0" />

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[11px] font-mono text-white/35 tracking-wide">{session.date}</span>
            <span className="text-white/15 text-[10px]">·</span>
            <span className="text-[11px] font-mono text-white/25">{session.time}</span>
            <Stars value={session.rating} />
          </div>
          <p className="text-[13px] font-semibold text-white/80 leading-snug truncate">{session.label}</p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-5 shrink-0">
          <div className="text-right">
            <div className="text-[20px] font-bold tabular-nums leading-none text-white/40">{session.turns}</div>
            <div className="text-[8px] font-mono uppercase tracking-widest text-white/20 mt-0.5">turns</div>
          </div>
          <div className="text-right">
            <div className="text-[20px] font-bold tabular-nums leading-none text-blue-400">{session.dd.toFixed(1)}</div>
            <div className="text-[8px] font-mono uppercase tracking-widest text-white/20 mt-0.5">total dd</div>
          </div>
          <div className="flex items-center gap-1">
            <ChevronDown
              className={`w-3.5 h-3.5 text-white/20 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
            <button
              className="w-6 h-6 rounded-full flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/5 transition-colors"
              onClick={e => e.stopPropagation()}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Expanded skills ── */}
      {open && session.skills.length > 0 && (
        <div className="pb-2 px-1 -mt-1">
          <div className="ml-4 pl-3 border-l border-white/[0.06] flex flex-col gap-1.5 pb-2">
            {session.skills.map((skill, i) => (
              <div key={i} className="flex items-center justify-between">
                <SkillPill skill={skill} />
                <span className="text-[11px] font-mono text-white/30 tabular-nums">{skill.dd.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function TrainingLogRedesign() {
  return (
    <div
      className="min-h-screen bg-black text-white overflow-y-auto"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── Hero ── */}
      <div className="flex flex-col items-center text-center px-6 pt-16 pb-10">
        {/* Pill tag */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-mono text-white/40 tracking-widest uppercase mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Training Log
        </div>

        {/* Headline */}
        <h1 className="text-[42px] font-black tracking-tight leading-[1.05] mb-3">
          Track every{" "}
          <span className="text-blue-400">jump.</span>
        </h1>

        {/* Subtitle */}
        <p className="text-[13px] text-white/35 max-w-[260px] leading-relaxed mb-8">
          Every session, every skill, every difficulty point.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.04] text-[12px] font-medium text-white/50 hover:bg-white/[0.08] transition-colors">
            <Wrench className="w-3.5 h-3.5" />
            Points to Fix
          </button>
          <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-[12px] font-semibold text-white shadow-lg shadow-blue-900/40 hover:bg-blue-500 transition-colors">
            <Plus className="w-4 h-4" />
            Start Training
          </button>
        </div>
      </div>

      {/* ── Sessions ── */}
      <div className="px-5 pb-32 max-w-[430px] mx-auto">
        {/* Section header */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/20">Recent Sessions</span>
          <span className="text-[10px] font-mono text-white/15">5 of 47</span>
        </div>

        {SESSIONS.map((s, i) => (
          <SessionRow key={s.id} session={s} defaultOpen={i === 0} />
        ))}

        {/* Load more */}
        <button className="w-full mt-4 py-3 rounded-xl border border-white/[0.06] text-[11px] font-mono text-white/25 hover:text-white/40 hover:border-white/10 hover:bg-white/[0.02] transition-colors">
          Load 30 more
        </button>
      </div>
    </div>
  );
}
