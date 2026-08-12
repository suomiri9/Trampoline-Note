import { useState } from 'react';
import {
  Folder, FileText, Image as ImageIcon, Search, Grid2x2, Rows3,
  ChevronRight, Download, Eye, HardDrive, Clock, Layers,
  ArrowRight, Filter, Star, Lock, FileSpreadsheet, Box
} from 'lucide-react';
import { motion } from 'framer-motion';

const NEON = '#CCFF00';
const NEON2 = '#FF3D81';

const projects = [
  { id: 'p1', name: 'HALSTON_LOFT_V4', type: 'folder', items: 142, size: '8.4 GB', modified: '2 hr ago', img: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800&h=600&fit=crop', tag: 'RESIDENTIAL', status: 'ACTIVE', starred: true },
  { id: 'p2', name: 'ODESSA_HOTEL_LOBBY', type: 'folder', items: 287, size: '21.2 GB', modified: 'yesterday', img: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&h=600&fit=crop', tag: 'HOSPITALITY', status: 'ACTIVE', starred: false },
  { id: 'p3', name: 'MERIDIAN_GALLERY', type: 'folder', items: 96, size: '5.1 GB', modified: '3 days ago', img: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=800&h=600&fit=crop', tag: 'COMMERCIAL', status: 'CD PHASE', starred: true },
  { id: 'p4', name: 'KESSLER_PENTHOUSE', type: 'folder', items: 203, size: '14.7 GB', modified: 'last week', img: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&h=600&fit=crop', tag: 'RESIDENTIAL', status: 'INSTALL', starred: false },
  { id: 'p5', name: 'BRUTALIST_CAFE_NO9', type: 'folder', items: 78, size: '3.9 GB', modified: '2 weeks ago', img: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&h=600&fit=crop', tag: 'F&B', status: 'CONCEPT', starred: false },
  { id: 'p6', name: 'VANTA_SHOWROOM', type: 'folder', items: 164, size: '11.3 GB', modified: '3 weeks ago', img: 'https://images.unsplash.com/photo-1567016432779-094069958ea5?w=800&h=600&fit=crop', tag: 'RETAIL', status: 'ACTIVE', starred: false },
];

const caseStudies = [
  { id: 'c1', name: 'CS_ODESSA_FINAL.pdf', size: '184 MB', pages: 64, modified: 'Mar 2024', img: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=800&h=600&fit=crop', kind: 'CASE STUDY' },
  { id: 'c2', name: 'CS_HALSTON_PRESS.pdf', size: '92 MB', pages: 38, modified: 'Jan 2024', img: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop', kind: 'PRESS KIT' },
  { id: 'c3', name: 'CS_MERIDIAN_AWARDS.pdf', size: '210 MB', pages: 72, modified: 'Nov 2023', img: 'https://images.unsplash.com/photo-1615873968403-89e068629265?w=800&h=600&fit=crop', kind: 'AWARD SUBMISSION' },
  { id: 'c4', name: 'STUDIO_MONOGRAPH_2023.pdf', size: '1.2 GB', pages: 240, modified: 'Sep 2023', img: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&h=600&fit=crop', kind: 'MONOGRAPH' },
  { id: 'c5', name: 'CS_VANTA_RETAIL.pdf', size: '156 MB', pages: 44, modified: 'Aug 2023', img: 'https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=800&h=600&fit=crop', kind: 'CASE STUDY' },
];

const documents = [
  { id: 'd1', name: 'FFE_SCHEDULE_ODESSA_R12.xlsx', icon: FileSpreadsheet, size: '4.2 MB', modified: '14:02 today', locked: false },
  { id: 'd2', name: 'MATERIAL_PALETTE_HALSTON.indd', icon: Layers, size: '388 MB', modified: '11:47 today', locked: true },
  { id: 'd3', name: 'LIGHTING_SPEC_MERIDIAN_V3.pdf', icon: FileText, size: '18 MB', modified: 'yesterday', locked: false },
  { id: 'd4', name: 'KESSLER_MILLWORK_SHOPDWG.dwg', icon: Box, size: '67 MB', modified: 'yesterday', locked: false },
  { id: 'd5', name: 'CLIENT_BRIEF_CAFE_NO9.docx', icon: FileText, size: '1.1 MB', modified: '2 days ago', locked: false },
  { id: 'd6', name: 'SITE_SURVEY_VANTA_SCAN.e57', icon: Box, size: '2.4 GB', modified: '3 days ago', locked: true },
  { id: 'd7', name: 'BUDGET_TRACKER_Q2.xlsx', icon: FileSpreadsheet, size: '2.8 MB', modified: '4 days ago', locked: true },
  { id: 'd8', name: 'TEXTILE_SOURCING_NOTES.pdf', icon: FileText, size: '9.4 MB', modified: 'last week', locked: false },
];

const filters = ['ALL', 'RESIDENTIAL', 'HOSPITALITY', 'COMMERCIAL', 'RETAIL', 'F&B'];

function TornDivider({ flip }) {
  return (
    <svg viewBox="0 0 1200 24" preserveAspectRatio="none" className={`w-full h-5 block ${flip ? 'rotate-180' : ''}`} aria-hidden="true">
      <path d="M0 24 L0 12 L38 16 L71 7 L120 14 L163 5 L210 13 L268 8 L301 17 L355 6 L420 15 L470 9 L512 16 L578 5 L630 14 L688 7 L731 16 L790 6 L842 13 L901 8 L948 17 L1010 6 L1062 14 L1118 9 L1160 15 L1200 8 L1200 24 Z" fill="#0a0a0a" />
    </svg>
  );
}

function SectionHeader({ index, title, sub, count }) {
  return (
    <div className="flex items-end justify-between px-6 md:px-12 mb-6">
      <div className="flex items-end gap-5">
        <span className="font-mono text-xs tracking-[0.3em] text-[#555] pb-2">{index}</span>
        <div>
          <h2 className="heading-grunge text-3xl md:text-5xl text-[#ededed] leading-none">{title}</h2>
          <p className="font-mono text-[11px] tracking-[0.25em] text-[#7a7a7a] mt-2">{sub}</p>
        </div>
      </div>
      <div className="hidden md:flex items-center gap-3 pb-1">
        <span className="font-mono text-[11px] tracking-widest text-[#666]">{count}</span>
        <div className="flex items-center gap-1 font-mono text-[11px] tracking-widest" style={{ color: NEON }}>
          SCROLL <ArrowRight size={14} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [filter, setFilter] = useState('ALL');
  const [view, setView] = useState('grid');
  const [selectedDoc, setSelectedDoc] = useState('d2');
  const [query, setQuery] = useState('');

  const visibleProjects = projects.filter(p => filter === 'ALL' || p.tag === filter);
  const sel = documents.find(d => d.id === selectedDoc);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#d6d6d6] relative overflow-x-hidden">
      <link href="https://fonts.googleapis.com/css2?family=Anton&family=Special+Elite&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: `
        .heading-grunge { font-family: 'Anton', sans-serif; letter-spacing: 0.02em; text-transform: uppercase; }
        .stamp { font-family: 'Special Elite', cursive; }
        .font-mono { font-family: 'Space Mono', monospace !important; }

        @keyframes grainShift {
          0%,100% { transform: translate(0,0); }
          20% { transform: translate(-2%,2%); }
          40% { transform: translate(2%,-1%); }
          60% { transform: translate(-1%,-2%); }
          80% { transform: translate(1%,2%); }
        }
        .grain {
          position: fixed; inset: -10%; pointer-events: none; z-index: 50; opacity: 0.55;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.16'/%3E%3C/svg%3E");
          animation: grainShift 0.9s steps(5) infinite;
          mix-blend-mode: overlay;
        }
        @keyframes ambientShift {
          0%,100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .ambient {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: radial-gradient(ellipse 80% 60% at 15% 0%, rgba(204,255,0,0.05), transparent 60%),
                      radial-gradient(ellipse 70% 50% at 90% 100%, rgba(255,61,129,0.045), transparent 60%);
          background-size: 200% 200%;
          animation: ambientShift 18s ease-in-out infinite;
        }
        .torn-card { clip-path: polygon(0% 3%, 4% 0%, 12% 2%, 23% 0%, 34% 2%, 47% 0%, 58% 2%, 70% 0%, 82% 2%, 93% 0%, 100% 3%, 100% 97%, 95% 100%, 84% 98%, 72% 100%, 60% 98%, 47% 100%, 35% 98%, 22% 100%, 10% 98%, 0% 100%); }
        .hscroll { overflow-x: auto; scrollbar-width: thin; scrollbar-color: #2c2c2c #0a0a0a; }
        .hscroll::-webkit-scrollbar { height: 6px; }
        .hscroll::-webkit-scrollbar-track { background: #0a0a0a; border-top: 1px dashed #222; }
        .hscroll::-webkit-scrollbar-thumb { background: #2c2c2c; }
        .hscroll::-webkit-scrollbar-thumb:hover { background: ${NEON}; }
        .tape { position: absolute; width: 72px; height: 22px; background: rgba(220,220,210,0.13); transform: rotate(-5deg); top: -9px; left: 16px; backdrop-filter: blur(1px); border-left: 1px dashed rgba(255,255,255,0.15); border-right: 1px dashed rgba(255,255,255,0.15); }
        .img-grit { filter: grayscale(0.35) contrast(1.12) brightness(0.88); transition: filter .35s ease, transform .5s ease; }
        .group:hover .img-grit { filter: grayscale(0) contrast(1.05) brightness(1); transform: scale(1.04); }
        .neon-underline { box-shadow: inset 0 -2px 0 ${NEON}; }
        .scratch { background-image: repeating-linear-gradient(115deg, transparent 0px, transparent 11px, rgba(255,255,255,0.025) 11px, rgba(255,255,255,0.025) 12px); }
      ` }} />

      <div className="ambient" />
      <div className="grain" />

      {/* ── TOP BAR ─────────────────────────── */}
      <header className="relative z-10 border-b border-[#222]">
        <div className="flex items-center justify-between px-6 md:px-12 py-4">
          <div className="flex items-center gap-6">
            <div className="heading-grunge text-2xl leading-none" style={{ color: NEON }}>
              ROUGHCUT<span className="text-[#ededed]">/STUDIO</span>
            </div>
            <div className="hidden md:flex items-center gap-2 font-mono text-[11px] tracking-widest text-[#777]">
              <span className="text-[#444]">DRIVE://</span>
              <span>STUDIO_ARCHIVE</span>
              <ChevronRight size={12} className="text-[#444]" />
              <span style={{ color: NEON }}>PORTFOLIO</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 border border-[#2a2a2a] bg-[#111] px-3 py-2 w-72 focus-within:border-[#CCFF00] transition-colors">
              <Search size={14} className="text-[#666]" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="SEARCH 47,212 FILES…"
                className="bg-transparent outline-none font-mono text-[11px] tracking-widest text-[#ddd] placeholder:text-[#555] w-full"
              />
            </div>
            <div className="flex border border-[#2a2a2a]">
              <button onClick={() => setView('grid')} className={`p-2 transition-colors ${view === 'grid' ? 'bg-[#CCFF00] text-black' : 'text-[#777] hover:text-[#ddd]'}`}><Grid2x2 size={15} /></button>
              <button onClick={() => setView('list')} className={`p-2 transition-colors ${view === 'list' ? 'bg-[#CCFF00] text-black' : 'text-[#777] hover:text-[#ddd]'}`}><Rows3 size={15} /></button>
            </div>
          </div>
        </div>
        {/* storage strip */}
        <div className="flex items-center gap-6 px-6 md:px-12 py-2 border-t border-dashed border-[#222] font-mono text-[10px] tracking-[0.2em] text-[#666] scratch">
          <span className="flex items-center gap-2"><HardDrive size={11} style={{ color: NEON }} /> 4.2 TB / 8 TB USED</span>
          <div className="hidden md:block flex-1 h-[3px] bg-[#1c1c1c]"><div className="h-full" style={{ width: '52%', background: `linear-gradient(90deg, ${NEON}, ${NEON2})` }} /></div>
          <span className="flex items-center gap-2"><Clock size={11} /> LAST SYNC 14:09:33</span>
          <span className="hidden md:inline">EST. 2003 — KNOW THE MATERIAL BEFORE YOU SPEC IT.</span>
        </div>
      </header>

      {/* ── HERO STRIP ─────────────────────────── */}
      <div className="relative z-10 px-6 md:px-12 pt-10 pb-8">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <p className="stamp text-sm md:text-base text-[#888] mb-2">// the studio's working memory — twenty-one years of rooms, references &amp; reasoning</p>
          <h1 className="heading-grunge text-[13vw] md:text-[7.5vw] leading-[0.88] text-[#ededed]">
            FLAT FILES,<br />
            <span style={{ color: NEON }}>RAW</span> ARCHIVE<span style={{ color: NEON2 }}>.</span>
          </h1>
        </motion.div>
        <div className="flex flex-wrap gap-2 mt-8">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`font-mono text-[11px] tracking-[0.2em] px-4 py-2 border transition-colors ${filter === f ? 'border-[#CCFF00] text-black bg-[#CCFF00]' : 'border-[#2a2a2a] text-[#888] hover:border-[#555] hover:text-[#ddd]'}`}>
              {f}
            </button>
          ))}
          <span className="ml-auto hidden md:flex items-center gap-2 font-mono text-[11px] tracking-widest text-[#555]"><Filter size={12} /> {visibleProjects.length} RESULTS</span>
        </div>
      </div>

      {/* ── 01 PROJECT FOLDERS — horizontal scroll ─────────────────────── */}
      <section className="relative z-10 py-8">
        <SectionHeader index="01" title="Project Folders" sub="WORKING DIRECTORIES — DRAWINGS, RENDERS, SITE PHOTOS" count={`${visibleProjects.length} FOLDERS`} />
        <div className="hscroll pb-4">
          <div className="flex gap-5 px-6 md:px-12 w-max">
            {visibleProjects.map((p, i) => (
              <motion.div key={p.id} initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}
                className="group relative w-[300px] md:w-[340px] flex-shrink-0 cursor-pointer">
                <div className="torn-card bg-[#141414] border border-[#262626] group-hover:border-[#3a3a3a] transition-colors">
                  <div className="relative h-44 overflow-hidden">
                    <img src={p.img} alt={p.name} className="img-grit w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
                    <span className="absolute top-3 left-3 font-mono text-[10px] tracking-[0.2em] px-2 py-1 bg-black/80 border border-[#333]" style={{ color: NEON }}>{p.status}</span>
                    {p.starred && <Star size={14} className="absolute top-3 right-3" style={{ color: NEON2, fill: NEON2 }} />}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Folder size={15} style={{ color: NEON }} />
                      <h3 className="heading-grunge text-lg text-[#ededed] tracking-wide group-hover:neon-underline transition-colors truncate">{p.name}</h3>
                    </div>
                    <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.15em] text-[#777]">
                      <span>{p.items} ITEMS · {p.size}</span>
                      <span className="text-[#555]">{p.modified}</span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-dashed border-[#2a2a2a] flex items-center justify-between">
                      <span className="stamp text-xs text-[#999]">{p.tag.toLowerCase()}</span>
                      <span className="flex items-center gap-1 font-mono text-[10px] tracking-widest opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: NEON }}>OPEN <ArrowRight size={11} /></span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
            <div className="w-[120px] flex-shrink-0 flex items-center justify-center">
              <button className="heading-grunge text-sm text-[#666] hover:text-[#CCFF00] transition-colors -rotate-90 whitespace-nowrap tracking-widest">VIEW ALL 38 →</button>
            </div>
          </div>
        </div>
      </section>

      <TornDivider />
      <div className="bg-[#0e0e0e]">
        {/* ── 02 CASE STUDIES ─────────────────────── */}
        <section className="relative z-10 py-12">
          <SectionHeader index="02" title="Case Studies" sub="PUBLISHED PDFS — CLIENT-FACING, PRINT-READY" count="5 DOCUMENTS · 1.8 GB" />
          <div className="hscroll pb-4">
            <div className="flex gap-6 px-6 md:px-12 w-max items-stretch">
              {caseStudies.map((c, i) => (
                <motion.div key={c.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
                  className="group relative w-[260px] flex-shrink-0 cursor-pointer" style={{ transform: `rotate(${i % 2 === 0 ? '-0.6deg' : '0.7deg'})` }}>
                  <div className="tape" />
                  <div className="bg-[#161616] border border-[#2a2a2a] group-hover:border-[#FF3D81] transition-colors">
                    <div className="relative h-72 overflow-hidden">
                      <img src={c.img} alt={c.name} className="img-grit w-full h-full object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/95 to-transparent pt-12">
                        <span className="font-mono text-[9px] tracking-[0.25em]" style={{ color: NEON2 }}>{c.kind}</span>
                        <p className="font-mono text-[11px] text-[#ddd] mt-1 break-all leading-tight">{c.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2.5 border-t border-dashed border-[#2a2a2a]">
                      <span className="font-mono text-[10px] tracking-widest text-[#777]">{c.pages} PP · {c.size}</span>
                      <div className="flex gap-2">
                        <button className="p-1.5 border border-[#333] text-[#888] hover:text-black hover:bg-[#CCFF00] hover:border-[#CCFF00] transition-colors"><Eye size={12} /></button>
                        <button className="p-1.5 border border-[#333] text-[#888] hover:text-black hover:bg-[#CCFF00] hover:border-[#CCFF00] transition-colors"><Download size={12} /></button>
                      </div>
                    </div>
                  </div>
                  <p className="stamp text-[11px] text-[#666] mt-2 text-right">{c.modified}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </div>
      <TornDivider flip />

      {/* ── 03 DOCUMENT REGISTER ─────────────────────── */}
      <section className="relative z-10 py-12">
        <SectionHeader index="03" title="Document Register" sub="SCHEDULES · SPECS · SHOP DRAWINGS · SCANS" count="8 OF 1,204 RECENT" />
        <div className="px-6 md:px-12 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* table */}
          <div className="lg:col-span-2 border border-[#262626] bg-[#111]">
            <div className="grid grid-cols-12 px-4 py-2.5 border-b border-[#262626] font-mono text-[10px] tracking-[0.25em] text-[#666] scratch">
              <span className="col-span-7">FILENAME</span>
              <span className="col-span-2">SIZE</span>
              <span className="col-span-3 text-right">MODIFIED</span>
            </div>
            {documents.map(d => {
              const Icon = d.icon;
              const active = selectedDoc === d.id;
              return (
                <button key={d.id} onClick={() => setSelectedDoc(d.id)}
                  className={`grid grid-cols-12 items-center w-full text-left px-4 py-3 border-b border-[#1d1d1d] font-mono text-[11px] transition-colors ${active ? 'bg-[#CCFF00] text-black' : 'text-[#bbb] hover:bg-[#1a1a1a]'}`}>
                  <span className="col-span-7 flex items-center gap-3 truncate">
                    <Icon size={14} className={active ? 'text-black' : 'text-[#666]'} style={!active ? { color: NEON } : {}} />
                    <span className="truncate tracking-wide">{d.name}</span>
                    {d.locked && <Lock size={11} className={active ? 'text-black/60' : 'text-[#FF3D81]'} />}
                  </span>
                  <span className={`col-span-2 ${active ? 'text-black/70' : 'text-[#666]'}`}>{d.size}</span>
                  <span className={`col-span-3 text-right ${active ? 'text-black/70' : 'text-[#666]'}`}>{d.modified}</span>
                </button>
              );
            })}
          </div>
          {/* inspector */}
          <div className="relative">
            <div className="torn-card bg-[#161616] border border-[#2a2a2a] p-6 sticky top-6">
              <p className="font-mono text-[10px] tracking-[0.3em] text-[#666] mb-4">FILE INSPECTOR</p>
              <div className="flex items-start gap-3 mb-5">
                <div className="p-3 border border-[#333]" style={{ color: NEON }}>{sel && <sel.icon size={22} />}</div>
                <div className="min-w-0">
                  <h3 className="font-mono text-sm text-[#ededed] break-all leading-snug">{sel?.name}</h3>
                  <p className="stamp text-xs text-[#888] mt-1">last touched {sel?.modified}</p>
                </div>
              </div>
              <dl className="space-y-2.5 font-mono text-[11px] tracking-wider">
                {[['SIZE', sel?.size], ['OWNER', 'M. ARENDT — PRINCIPAL'], ['VERSION', 'R12 (47 prior)'], ['ACCESS', sel?.locked ? 'RESTRICTED · LEAD ONLY' : 'STUDIO-WIDE'], ['CHECKSUM', '9f3a…c41e VERIFIED']].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-dashed border-[#2a2a2a] pb-2">
                    <dt className="text-[#666]">{k}</dt>
                    <dd className={`text-right ${k === 'ACCESS' && sel?.locked ? 'text-[#FF3D81]' : 'text-[#ccc]'}`}>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex gap-2 mt-6">
                <button className="flex-1 heading-grunge text-sm tracking-wider py-3 bg-[#CCFF00] text-black hover:bg-[#e2ff5c] transition-colors">OPEN FILE</button>
                <button className="px-4 border border-[#333] text-[#aaa] hover:border-[#CCFF00] hover:text-[#CCFF00] transition-colors"><Download size={15} /></button>
              </div>
              <p className="stamp text-[11px] text-[#555] mt-4 leading-relaxed">"A spec sheet is an argument. Keep the revision history — it shows the thinking."</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────── */}
      <footer className="relative z-10 border-t border-[#222] mt-8">
        <div className="px-6 md:px-12 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="heading-grunge text-xl text-[#ededed]">ROUGHCUT<span style={{ color: NEON }}>/</span>STUDIO ARCHIVE</div>
          <div className="font-mono text-[10px] tracking-[0.25em] text-[#666] flex flex-wrap gap-x-8 gap-y-2">
            <span>47,212 FILES INDEXED</span>
            <span>BACKUP: NIGHTLY 02:00 CET</span>
            <span style={{ color: NEON2 }}>NOTHING GETS DELETED. EVER.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}