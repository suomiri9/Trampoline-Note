import { useState } from "react";
import {
  BarChart2,
  Bot,
  ChevronDown,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Star,
  Target,
  Trophy,
  Wrench,
} from "lucide-react";

import { Badge } from "@workspace/intent/components/ui/badge";
import { Button } from "@workspace/intent/components/ui/button";

type Skill = {
  type: "routine" | "skill" | "part" | "conn";
  name?: string;
  code?: string;
  dd: number;
};

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

const stats = [
  ["Sessions", "47"],
  ["Streak", "6d"],
  ["Best DD", "68.4"],
  ["This week", "3"],
];

const sessions: Session[] = [
  {
    id: 1,
    date: "Sat, 9 Aug",
    time: "11:22 – 12:42 am",
    label: "NZ NHG Championships 2026, 1st",
    turns: 9,
    dd: 47,
    rating: 4,
    skills: [
      { type: "routine", name: "Set", dd: 6.3 },
      { type: "skill", code: "803o", dd: 1.3 },
      { type: "part", name: "Middle 4 of 6 Doubles", dd: 2.4 },
      { type: "skill", code: "71o", dd: 0.8 },
      { type: "part", name: "Last 4 of 6 Doubles", dd: 3 },
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
];

const nav = [
  [LayoutGrid, "Log"],
  [Trophy, "Debuts"],
  [BarChart2, "Stats"],
  [Target, "Execution"],
  [Layers, "Skills"],
  [MoreHorizontal, "More"],
  [Bot, "Coach"],
];

function Rating({ value }: { value: number }) {
  return (
    <span className="flex gap-[2px]" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-[10px] w-[10px] ${
            n <= value ? "fill-chart-3 text-chart-3" : "text-foreground/15"
          }`}
        />
      ))}
    </span>
  );
}

function SkillPill({ skill }: { skill: Skill }) {
  const label =
    skill.type === "routine"
      ? `ROUTINE  ${skill.name}`
      : skill.type === "part"
        ? `PART  ${skill.name}`
        : skill.type === "conn"
          ? `CONN  ${skill.name}`
          : skill.code;
  const variant =
    skill.type === "routine"
      ? "default"
      : skill.type === "conn"
        ? "destructive"
        : "outline";
  return (
    <Badge
      variant={variant}
      className="px-2 py-1 text-[9px] normal-case tracking-tight"
    >
      {label}
    </Badge>
  );
}

function SessionRow({ session, openByDefault }: { session: Session; openByDefault?: boolean }) {
  const [open, setOpen] = useState(Boolean(openByDefault));
  return (
    <article className="border-b border-border/70 py-4 first:pt-3">
      <button
        className="group flex w-full items-start gap-3 text-left"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-secondary font-mono text-[10px] text-muted-foreground">
          {session.id}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{session.date}</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">{session.time}</span>
          </div>
          <h3 className="mt-1 truncate font-sans text-[14px] font-medium tracking-[-0.02em] text-foreground/90">{session.label}</h3>
          <div className="mt-2 flex items-center gap-3">
            <span className="font-mono text-[10px] text-muted-foreground/80">{session.turns} turns</span>
            <span className="h-1 w-1 rounded-full bg-foreground/20" />
            <span className="font-mono text-[10px] text-primary/80">{session.dd.toFixed(1)} DD</span>
            <Rating value={session.rating} />
          </div>
        </div>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && session.skills.length > 0 && (
        <div className="ml-10 mt-3 border-l border-border pl-3">
          {session.skills.map((skill, index) => (
            <div key={`${session.id}-${index}`} className="flex items-center justify-between gap-3 py-1.5">
              <SkillPill skill={skill} />
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">{skill.dd.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export default function TrainingLogFullVariant() {
  return (
    <main className="relative mx-auto flex min-h-[844px] w-full max-w-[430px] flex-col overflow-hidden bg-background font-mono text-foreground selection:bg-primary selection:text-primary-foreground">
      <div className="pointer-events-none absolute -top-36 left-1/2 h-[480px] w-[620px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(19,104,177,0.22),rgba(10,38,65,0.08)_45%,transparent_72%)]" />
      <header className="relative z-10 px-6 pb-5 pt-5">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="font-semibold tracking-[0.22em] text-foreground/75">TRAINING / LOG</span>
          <span>09:41 <span className="ml-2 text-muted-foreground/50">● ● ●</span></span>
        </div>
        <div className="mt-10 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-primary/70">Performance ledger</p>
            <h1 className="font-sans text-[38px] font-semibold leading-[0.92] tracking-[-0.07em]">
              Train<br />
              <span className="text-gradient-primary">with intent.</span>
            </h1>
          </div>
          <Button
            size="icon"
            className="mb-1 h-11 w-11 rounded-2xl transition-transform hover:scale-105"
            aria-label="New session"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </header>
      <section className="relative z-10 mx-6 grid grid-cols-4 border-y py-4">
        {stats.map(([label, value], index) => (
          <div key={label} className={`space-y-1 ${index > 0 ? "border-l pl-3" : ""}`}>
            <div className="font-sans text-[20px] font-medium tracking-[-0.05em] text-foreground/90">{value}</div>
            <div className="text-[8px] uppercase tracking-[0.13em] text-muted-foreground/80">{label}</div>
          </div>
        ))}
      </section>
      <section className="relative z-10 flex-1 overflow-auto px-6 pb-5">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-background/90 py-4 backdrop-blur-md">
          <span className="micro-label">Recent sessions</span>
          <button className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground/80 transition-colors hover:text-foreground/70"><Wrench className="h-3 w-3" /> Filter</button>
        </div>
        {sessions.map((session, index) => <SessionRow key={session.id} session={session} openByDefault={index === 0} />)}
        <Button
          variant="outline"
          className="mt-4 w-full rounded-xl py-3 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground hover:text-primary"
        >
          Load 30 more
        </Button>
      </section>
      <nav className="relative z-20 flex shrink-0 items-center justify-around border-t bg-sidebar/85 px-2 pb-5 pt-2 backdrop-blur-xl">
        {nav.map(([Icon, label], index) => {
          const NavIcon = Icon;
          const active = index === 0;
          return (
            <button key={label as string} className="flex flex-col items-center gap-1 rounded-xl px-2 py-1 font-mono text-[8px] transition-colors" onClick={() => undefined}>
              <span className={`flex h-7 w-7 items-center justify-center rounded-xl ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground/60"}`}><NavIcon className="h-4 w-4" /></span>
              <span className={active ? "text-sidebar-accent-foreground" : "text-muted-foreground/60"}>{label as string}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}
