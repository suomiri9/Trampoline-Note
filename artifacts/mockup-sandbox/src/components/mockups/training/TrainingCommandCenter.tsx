import { useMemo, useState, type ReactNode } from "react";

type Session = {
  id: number;
  time: string;
  title: string;
  kind: string;
  duration: string;
  detail: string;
  accent: string;
  done: boolean;
};

const initialSessions: Session[] = [
  { id: 1, time: "07:30", title: "Warm-up / lines", kind: "Prep", duration: "18 min", detail: "Easy tempo. Keep the landing quiet and leave one rep in reserve.", accent: "#d86a45", done: true },
  { id: 2, time: "08:00", title: "Barani · layout", kind: "Skill", duration: "32 min", detail: "Three clean entries, then two connected attempts. Film the second set.", accent: "#5267a9", done: false },
  { id: 3, time: "08:45", title: "Full routine A", kind: "Routine", duration: "24 min", detail: "One pass at competition pace. Mark deductions immediately after the dismount.", accent: "#6a8f74", done: false },
  { id: 4, time: "09:20", title: "Mobility reset", kind: "Recovery", duration: "12 min", detail: "Hips, thoracic spine, calves. Slow breathing throughout.", accent: "#b28b4d", done: false },
];

function TinyMark({ children }: { children: ReactNode }) {
  return <span style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase" }}>{children}</span>;
}

export function TrainingCommandCenter() {
  const [sessions, setSessions] = useState(initialSessions);
  const [selectedId, setSelectedId] = useState(2);
  const [filter, setFilter] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const selected = sessions.find((session) => session.id === selectedId) ?? sessions[0];
  const visible = useMemo(() => filter === "All" ? sessions : sessions.filter((session) => session.kind === filter), [filter, sessions]);
  const completed = sessions.filter((session) => session.done).length;

  const toggleDone = (id: number) => {
    setSessions((current) => current.map((session) => session.id === id ? { ...session, done: !session.done } : session));
  };
  const addSession = () => {
    if (!newTitle.trim()) return;
    const next: Session = { id: Date.now(), time: "09:45", title: newTitle.trim(), kind: "Focus", duration: "20 min", detail: "A new block for today's training plan.", accent: "#7c658f", done: false };
    setSessions((current) => [...current, next]);
    setNewTitle("");
    setShowAdd(false);
    setSelectedId(next.id);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#eeece6", color: "#252a2c", fontFamily: "'DM Sans', system-ui, sans-serif", padding: "28px clamp(18px, 4vw, 62px)" }}>
      <style>{`
        * { box-sizing: border-box; }
        button { font: inherit; }
        .tcc-shell { max-width: 1240px; margin: 0 auto; }
        .tcc-fade { animation: tccFade .45s ease both; }
        @keyframes tccFade { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
        .tcc-nav { display:flex; align-items:center; justify-content:space-between; padding-bottom:27px; border-bottom:1px solid #d5d2ca; }
        .tcc-logo { display:flex; align-items:center; gap:11px; font-weight:800; letter-spacing:-.05em; font-size:19px; }
        .tcc-logo i { width:22px; height:22px; display:block; border-radius:50%; background:#d86a45; position:relative; }
        .tcc-logo i:after { content:""; width:8px; height:8px; position:absolute; right:3px; top:3px; border-radius:50%; background:#eeece6; }
        .tcc-navlinks { display:flex; align-items:center; gap:26px; color:#777976; font-size:12px; }
        .tcc-navlinks b { color:#252a2c; }
        .tcc-avatar { width:31px; height:31px; border-radius:50%; display:grid; place-items:center; background:#293238; color:#f1eee8; font-size:11px; font-weight:700; }
        .tcc-heading { display:flex; justify-content:space-between; align-items:end; padding:46px 0 28px; }
        .tcc-kicker { color:#d86a45; font-weight:700; font-size:11px; letter-spacing:.16em; text-transform:uppercase; }
        h1 { font: 400 clamp(38px, 6vw, 68px)/.92 Georgia, serif; letter-spacing:-.055em; margin:9px 0 0; }
        .tcc-date { text-align:right; color:#777976; font-size:12px; line-height:1.6; }
        .tcc-date strong { color:#252a2c; display:block; font-size:14px; }
        .tcc-grid { display:grid; grid-template-columns:minmax(0, 1.25fr) minmax(290px, .75fr); gap:18px; align-items:start; }
        .tcc-card { background:#f8f6f1; border:1px solid #d8d5cd; border-radius:16px; box-shadow:0 8px 26px rgba(67,61,50,.045); }
        .tcc-toolbar { padding:16px 19px; display:flex; gap:7px; align-items:center; border-bottom:1px solid #dedbd3; }
        .tcc-filter { border:0; background:transparent; color:#858681; font-size:11px; padding:7px 11px; cursor:pointer; border-radius:20px; }
        .tcc-filter.active { background:#293238; color:#f8f6f1; }
        .tcc-add { margin-left:auto; border:1px solid #cfcac0; background:#f8f6f1; border-radius:8px; width:31px; height:31px; cursor:pointer; font-size:19px; line-height:1; color:#535957; }
        .tcc-row { display:grid; grid-template-columns:70px 1fr 80px 28px; gap:12px; align-items:center; min-height:84px; padding:12px 19px; border-bottom:1px solid #e5e2dc; cursor:pointer; transition:background .18s ease; }
        .tcc-row:last-child { border-bottom:0; }
        .tcc-row:hover, .tcc-row.selected { background:#f0eee8; }
        .tcc-time { color:#8b8d89; font:11px ui-monospace, monospace; }
        .tcc-title { font-weight:700; font-size:14px; letter-spacing:-.01em; }
        .tcc-type { font-size:10px; color:#888a85; margin-top:4px; }
        .tcc-duration { color:#767975; font:11px ui-monospace, monospace; text-align:right; }
        .tcc-check { width:21px; height:21px; border:1px solid #babbb4; border-radius:50%; display:grid; place-items:center; color:#f8f6f1; cursor:pointer; background:transparent; font-size:12px; }
        .tcc-check.done { background:#6a8f74; border-color:#6a8f74; }
        .tcc-side { padding:24px; position:sticky; top:20px; }
        .tcc-sidehead { display:flex; justify-content:space-between; align-items:start; padding-bottom:26px; }
        .tcc-side h2 { font:400 29px/1 Georgia, serif; letter-spacing:-.045em; margin:6px 0 0; }
        .tcc-status { color:#6a8f74; font:10px ui-monospace, monospace; text-transform:uppercase; letter-spacing:.12em; }
        .tcc-rule { height:1px; background:#dedbd3; margin:0 -24px 20px; }
        .tcc-detail { color:#696d69; line-height:1.55; font-size:13px; margin:0 0 25px; }
        .tcc-meta { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:25px; }
        .tcc-meta div { background:#efede7; border-radius:9px; padding:11px 12px; }
        .tcc-meta span { display:block; color:#898b86; font-size:10px; margin-bottom:3px; }
        .tcc-meta strong { font-size:13px; }
        .tcc-primary { width:100%; border:0; background:#293238; color:#f8f6f1; border-radius:9px; padding:13px; cursor:pointer; font-size:12px; font-weight:700; }
        .tcc-secondary { width:100%; margin-top:8px; border:1px solid #d0ccc4; background:transparent; color:#4c5351; border-radius:9px; padding:11px; cursor:pointer; font-size:12px; }
        .tcc-summary { margin-top:18px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:18px; }
        .tcc-stat { padding:17px 0; border-top:2px solid #293238; }
        .tcc-stat span { display:block; color:#898b86; font-size:10px; text-transform:uppercase; letter-spacing:.09em; }
        .tcc-stat strong { display:block; font:400 28px Georgia,serif; margin-top:8px; }
        .tcc-modal { margin-top:13px; padding:14px; background:#efede7; border-radius:10px; display:flex; gap:8px; }
        .tcc-modal input { min-width:0; flex:1; background:#f8f6f1; border:1px solid #d0ccc4; padding:9px; border-radius:7px; outline:none; font-size:12px; }
        .tcc-modal button { border:0; background:#d86a45; color:#fff; border-radius:7px; padding:0 12px; cursor:pointer; }
        @media (max-width:700px) { .tcc-navlinks span, .tcc-navlinks b { display:none; } .tcc-heading { align-items:start; flex-direction:column; gap:18px; } .tcc-date { text-align:left; } .tcc-grid { grid-template-columns:1fr; } .tcc-side { position:static; } .tcc-row { grid-template-columns:52px 1fr 25px; } .tcc-duration { display:none; } .tcc-summary { gap:10px; } }
      `}</style>
      <div className="tcc-shell">
        <nav className="tcc-nav">
          <div className="tcc-logo"><i /> bounce / log</div>
          <div className="tcc-navlinks"><b>Today</b><span>Library</span><span>Insights</span><div className="tcc-avatar">AM</div></div>
        </nav>
        <header className="tcc-heading tcc-fade">
          <div><div className="tcc-kicker">Thursday · 14 September</div><h1>Make the next<br /><em>rep count.</em></h1></div>
          <div className="tcc-date"><strong>Morning block</strong>08:00 — 09:45 · 4 sessions</div>
        </header>
        <section className="tcc-grid tcc-fade">
          <div>
            <div className="tcc-card">
              <div className="tcc-toolbar">
                {["All", "Skill", "Routine", "Recovery"].map((item) => <button key={item} className={`tcc-filter ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item}</button>)}
                <button className="tcc-add" onClick={() => setShowAdd(!showAdd)} aria-label="Add session">+</button>
              </div>
              {showAdd && <div className="tcc-modal"><input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addSession()} placeholder="Name a new block…" /><button onClick={addSession}>Add</button></div>}
              {visible.map((session) => <div key={session.id} className={`tcc-row ${selected?.id === session.id ? "selected" : ""}`} onClick={() => setSelectedId(session.id)}>
                <div className="tcc-time">{session.time}</div><div><div className="tcc-title" style={{ borderLeft: `3px solid ${session.accent}`, paddingLeft: 10 }}>{session.title}</div><div className="tcc-type"><TinyMark>{session.kind}</TinyMark></div></div><div className="tcc-duration">{session.duration}</div>
                <button className={`tcc-check ${session.done ? "done" : ""}`} onClick={(event) => { event.stopPropagation(); toggleDone(session.id); }}>{session.done ? "✓" : ""}</button>
              </div>)}
            </div>
            <div className="tcc-summary">
              <div className="tcc-stat"><span>Completed</span><strong>{completed}<small style={{ fontSize: 15, color: "#898b86" }}> / {sessions.length}</small></strong></div>
              <div className="tcc-stat"><span>Planned time</span><strong>86m</strong></div>
              <div className="tcc-stat"><span>Current streak</span><strong>6<small style={{ fontSize: 15, color: "#898b86" }}> days</small></strong></div>
            </div>
          </div>
          {selected && <aside className="tcc-card tcc-side">
            <div className="tcc-sidehead"><div><div className="tcc-kicker">{selected.kind} block</div><h2>{selected.title}</h2></div><div className="tcc-status">{selected.done ? "Complete" : "Up next"}</div></div>
            <div className="tcc-rule" /><p className="tcc-detail">{selected.detail}</p>
            <div className="tcc-meta"><div><span>Start</span><strong>{selected.time}</strong></div><div><span>Duration</span><strong>{selected.duration}</strong></div></div>
            <button className="tcc-primary" onClick={() => toggleDone(selected.id)}>{selected.done ? "Mark for review" : "Log this session"}</button>
            <button className="tcc-secondary" onClick={() => setSelectedId(sessions[(sessions.findIndex((item) => item.id === selected.id) + 1) % sessions.length].id)}>Next block →</button>
          </aside>}
        </section>
      </div>
    </main>
  );
}

export default TrainingCommandCenter;