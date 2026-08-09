import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCreateNote } from "@/hooks/use-notes";
import { isPointCategory } from "@shared/points";
import type { SafeUser } from "@shared/models/auth";
import { Bot, Send, Loader2, Trash2, ImagePlus, X, CalendarPlus, Check, Plus, Wrench, Square } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface CoachMessage {
  id: number;
  role: string;
  content: string;
  images?: string | null;
  draft?: string | null;
  proposals?: string | null;
  suggestions?: string | null;
  createdAt: string;
}

// Confirm-first proposals the coach can attach to a reply — only when the
// athlete explicitly asked for them. Parsed and validated server-side; point
// links carry real library ids (unresolvable references were dropped there).
interface SkillProposal {
  name: string;
  code: string;
  difficulty: number;
  type: "skill" | "drill";
  alreadyExists?: boolean;
}

interface PointLink {
  id: number;
  code: string;
  name: string;
}

interface PointProposal {
  name: string;
  skills: PointLink[];
  routines: PointLink[];
  category: string;
  unresolved: string[];
}

interface MessageProposals {
  skill: SkillProposal | null;
  point: PointProposal | null;
}

function parseMessageProposals(raw: string | null | undefined): MessageProposals | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const skill: SkillProposal | null =
      parsed.skill &&
      typeof parsed.skill === "object" &&
      typeof parsed.skill.name === "string" &&
      typeof parsed.skill.code === "string"
        ? {
            name: parsed.skill.name,
            code: parsed.skill.code,
            difficulty: typeof parsed.skill.difficulty === "number" ? parsed.skill.difficulty : 0,
            type: parsed.skill.type === "drill" ? "drill" : "skill",
            alreadyExists: parsed.skill.alreadyExists === true,
          }
        : null;
    const point: PointProposal | null =
      parsed.point && typeof parsed.point === "object" && typeof parsed.point.name === "string"
        ? {
            name: parsed.point.name,
            skills: Array.isArray(parsed.point.skills)
              ? parsed.point.skills.filter((l: any) => l && typeof l.id === "number")
              : [],
            routines: Array.isArray(parsed.point.routines)
              ? parsed.point.routines.filter((l: any) => l && typeof l.id === "number")
              : [],
            category:
              typeof parsed.point.category === "string" ? parsed.point.category : "General",
            unresolved: Array.isArray(parsed.point.unresolved)
              ? parsed.point.unresolved.filter((u: any) => typeof u === "string")
              : [],
          }
        : null;
    if (!skill && !point) return null;
    return { skill, point };
  } catch {
    return null;
  }
}

// One draft row = one or more skills performed together (several = a
// connection, e.g. with the "one menu row = one connection" setting on).
// Reps apply to the whole row.
interface CoachDraftSkill {
  skillId: number;
  code: string;
  name: string;
}

// A row is plain skills, a routine (routineId → app item {id:-2}) or a
// frequent connection (fcId → app item {id:-3}); routine/connection rows
// carry one display entry in `skills` plus their member customSkillIds.
interface CoachDraftItem {
  skills: CoachDraftSkill[];
  reps: number;
  routineId?: number;
  fcId?: number;
  customSkillIds?: number[];
}

interface CoachDraft {
  date: string;
  items: CoachDraftItem[];
  unmatched: string[];
  noteText: string;
}

const SUGGESTIONS = [
  "How has my training load trended lately?",
  "Am I recovering enough for my current load?",
  "How do I log a session with skills and reps?",
];

const MAX_IMAGES = 3;
// Server rejects data URLs above 4MB of characters; stay safely below.
const MAX_DATA_URL_CHARS = 3_900_000;

// Downscale + JPEG-compress an image file client-side so photo sends stay
// fast. Longest side capped at 1280px, quality stepped down until the data
// URL fits the server's size cap. Throws on unreadable files.
async function compressImage(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("not a readable image"));
    el.src = dataUrl;
  });
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  for (const quality of [0.8, 0.6, 0.4]) {
    const out = canvas.toDataURL("image/jpeg", quality);
    if (out.length <= MAX_DATA_URL_CHARS) return out;
  }
  throw new Error("image too large even after compression");
}

function parseMessageImages(images: string | null | undefined): string[] {
  if (!images) return [];
  try {
    const parsed = JSON.parse(images);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

// Normalizes a stored draft item to the current { skills: [...], reps } shape.
// Legacy drafts (saved before connection rows) stored flat
// { skillId, code, name, reps } items.
function normalizeDraftItem(it: any): CoachDraftItem | null {
  if (!it || typeof it !== "object") return null;
  const reps = typeof it.reps === "number" && it.reps >= 1 ? Math.trunc(it.reps) : 1;
  if (Array.isArray(it.skills)) {
    const skills = it.skills.filter(
      (s: any) => s && typeof s === "object" && typeof s.skillId === "number",
    );
    if (skills.length === 0) return null;
    const item: CoachDraftItem = { skills, reps };
    if (typeof it.routineId === "number") item.routineId = it.routineId;
    if (typeof it.fcId === "number") item.fcId = it.fcId;
    if (Array.isArray(it.customSkillIds)) {
      item.customSkillIds = it.customSkillIds.filter((v: any) => typeof v === "number");
    }
    return item;
  }
  if (typeof it.skillId === "number") {
    return { skills: [{ skillId: it.skillId, code: it.code ?? "", name: it.name ?? "" }], reps };
  }
  return null;
}

function parseMessageDraft(draft: string | null | undefined): CoachDraft | null {
  if (!draft) return null;
  try {
    const parsed = JSON.parse(draft);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      date: typeof parsed.date === "string" ? parsed.date : "",
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizeDraftItem).filter((it: CoachDraftItem | null): it is CoachDraftItem => it !== null)
        : [],
      unmatched: Array.isArray(parsed.unmatched) ? parsed.unmatched : [],
      noteText: typeof parsed.noteText === "string" ? parsed.noteText : "",
    };
  } catch {
    return null;
  }
}

// Parse the quick-reply suggestions JSON stored on an assistant message.
function parseMessageSuggestions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

// Which draft cards have already been added to the log (persists across
// reloads so a saved draft can't be double-submitted).
const ADDED_KEY = "coach-drafts-added";
function getAddedDraftIds(): number[] {
  try {
    const raw = localStorage.getItem(ADDED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "number") : [];
  } catch {
    return [];
  }
}
function markDraftAdded(messageId: number) {
  const ids = getAddedDraftIds();
  if (!ids.includes(messageId)) {
    try {
      localStorage.setItem(ADDED_KEY, JSON.stringify([...ids, messageId].slice(-100)));
    } catch {}
  }
}

// Confirm/dismiss state for proposal cards, persisted so a confirmed
// proposal can't be double-submitted after a reload (mirrors the draft
// cards' localStorage approach).
const PROPOSALS_STATE_KEY = "coach-proposals-state";
type ProposalOutcome = "confirmed" | "dismissed";
function getProposalOutcome(kind: "skill" | "point", messageId: number): ProposalOutcome | null {
  try {
    const raw = localStorage.getItem(PROPOSALS_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const v =
      parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>)[`${kind}-${messageId}`] : undefined;
    return v === "confirmed" || v === "dismissed" ? v : null;
  } catch {
    return null;
  }
}
function setProposalOutcome(kind: "skill" | "point", messageId: number, outcome: ProposalOutcome) {
  try {
    const raw = localStorage.getItem(PROPOSALS_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const map: Record<string, unknown> =
      parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    map[`${kind}-${messageId}`] = outcome;
    const keys = Object.keys(map);
    if (keys.length > 200) {
      for (const k of keys.slice(0, keys.length - 200)) delete map[k];
    }
    localStorage.setItem(PROPOSALS_STATE_KEY, JSON.stringify(map));
  } catch {}
}

// Draft training-log entry proposed by the coach, shown side-by-side with the
// source photo (when the triggering message had one) so the athlete can check
// the AI's reading against the menu and EDIT it — date, reps, removing items,
// dropping unmatched lines, and the notes text — before confirming. Nothing
// is written without the "Add to log" tap.
function DraftEntryCard({
  messageId,
  draft,
  images,
  compact,
}: {
  messageId: number;
  draft: CoachDraft;
  images: string[];
  compact: boolean;
}) {
  const { toast } = useToast();
  const createNote = useCreateNote();
  const [added, setAdded] = useState(() => getAddedDraftIds().includes(messageId));
  // Editable copy of the draft; local until "Add to log".
  const [date, setDate] = useState(draft.date);
  const [items, setItems] = useState<CoachDraftItem[]>(draft.items);
  const [unmatched, setUnmatched] = useState<string[]>(draft.unmatched);
  const [noteText, setNoteText] = useState(draft.noteText);

  const setReps = (i: number, raw: string) => {
    const n = raw === "" ? 1 : Math.max(1, Math.min(999, Math.trunc(Number(raw)) || 1));
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, reps: n } : it)));
  };

  const isEmpty = items.length === 0 && unmatched.length === 0 && !noteText.trim();

  const addToLog = () => {
    if (added || createNote.isPending || isEmpty) return;
    // App skills-JSON format: groups separated by {id: -1}. A row's skills
    // share one group (a connection sums DD); the LAST item's reps set the
    // whole group's reps, matching how the app computes group totals.
    // Routine/connection rows become the app's routine ({id:-2, routineId,
    // customSkillIds}) and connection ({id:-3, fcId, customSkillIds}) items.
    const skillItems: {
      id: number;
      reps?: number;
      routineId?: number;
      fcId?: number;
      customSkillIds?: number[];
    }[] = [];
    items.forEach((it, i) => {
      if (i > 0) skillItems.push({ id: -1 });
      if (it.routineId != null) {
        skillItems.push({
          id: -2,
          routineId: it.routineId,
          customSkillIds: it.customSkillIds ?? [],
          ...(it.reps > 1 ? { reps: it.reps } : {}),
        });
        return;
      }
      if (it.fcId != null) {
        skillItems.push({
          id: -3,
          fcId: it.fcId,
          customSkillIds: it.customSkillIds ?? [],
          ...(it.reps > 1 ? { reps: it.reps } : {}),
        });
        return;
      }
      it.skills.forEach((s, j) => {
        const isLast = j === it.skills.length - 1;
        skillItems.push(isLast && it.reps > 1 ? { id: s.skillId, reps: it.reps } : { id: s.skillId });
      });
    });
    const contentParts: string[] = [];
    if (noteText.trim()) contentParts.push(noteText.trim());
    if (unmatched.length > 0) {
      contentParts.push(`Unmatched from menu:\n${unmatched.map((u) => `- ${u}`).join("\n")}`);
    }
    createNote.mutate(
      {
        date,
        content: contentParts.join("\n\n"),
        skills: skillItems.length > 0 ? JSON.stringify(skillItems) : null,
      },
      {
        onSuccess: () => {
          markDraftAdded(messageId);
          setAdded(true);
          toast({ title: "Added to log", description: `Training entry created for ${date}.` });
        },
        onError: (err: Error) => {
          toast({
            title: "Couldn't add to log",
            description: err.message || "Something went wrong creating the entry.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const editor = (
    <div className="space-y-2 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-wider text-[11px] font-semibold text-primary">
          Draft log entry
        </span>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={added}
          className="h-7 w-auto px-2 font-mono text-[11px] text-muted-foreground"
          data-testid={`input-draft-date-${messageId}`}
        />
      </div>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2" data-testid={`row-draft-item-${messageId}-${i}`}>
              <span className="font-mono text-xs text-primary shrink-0">
                {it.skills.map((s) => s.code).join(" + ")}
              </span>
              <span className="truncate">{it.skills.map((s) => s.name).join(" + ")}</span>
              {(it.routineId != null || it.fcId != null) && (
                <span
                  className="shrink-0 rounded bg-primary/10 px-1 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary"
                  data-testid={`badge-draft-kind-${messageId}-${i}`}
                >
                  {it.routineId != null ? "routine" : "conn"}
                </span>
              )}
              <span className="ml-auto flex items-center gap-1 shrink-0">
                <span className="font-mono text-xs text-muted-foreground">x</span>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={it.reps}
                  onChange={(e) => setReps(i, e.target.value)}
                  disabled={added}
                  className="h-7 w-14 px-1.5 font-mono text-xs text-right"
                  data-testid={`input-draft-reps-${messageId}-${i}`}
                />
                {!added && (
                  <button
                    onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                    className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${it.skills.map((s) => s.name).join(" + ")}`}
                    data-testid={`button-remove-draft-item-${messageId}-${i}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {unmatched.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-0.5" data-testid={`text-draft-unmatched-${messageId}`}>
          <span className="font-semibold">Not matched (kept as notes):</span>
          {unmatched.map((u, i) => (
            <div key={i} className="flex items-center gap-1.5" data-testid={`row-draft-unmatched-${messageId}-${i}`}>
              <span className="truncate">– {u}</span>
              {!added && (
                <button
                  onClick={() => setUnmatched((prev) => prev.filter((_, j) => j !== i))}
                  className="h-5 w-5 rounded flex items-center justify-center shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${u}`}
                  data-testid={`button-remove-unmatched-${messageId}-${i}`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <Textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        disabled={added}
        placeholder="Notes…"
        rows={2}
        className="min-h-[40px] text-xs resize-none"
        data-testid={`textarea-draft-notes-${messageId}`}
      />
      <Button
        size="sm"
        className="w-full"
        variant={added ? "secondary" : "default"}
        disabled={added || createNote.isPending || isEmpty}
        onClick={addToLog}
        data-testid={`button-add-draft-${messageId}`}
      >
        {createNote.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : added ? (
          <Check className="w-4 h-4 mr-2" />
        ) : (
          <CalendarPlus className="w-4 h-4 mr-2" />
        )}
        {added ? "Added to log" : "Add to log"}
      </Button>
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm",
        images.length > 0 && !compact
          ? "grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"
          : "space-y-3",
      )}
      data-testid={`card-coach-draft-${messageId}`}
    >
      {images.length > 0 && (
        <div className="space-y-2 min-w-0">
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`menu photo ${i + 1}`}
              className="w-full rounded-lg object-contain max-h-72 bg-background/40"
              data-testid={`img-draft-photo-${messageId}-${i}`}
            />
          ))}
        </div>
      )}
      {editor}
    </div>
  );
}

// Confirm-first card for a coach-proposed library addition (new skill or
// drill). Nothing is created until "Add to library" is tapped; Dismiss
// retires the card without saving anything.
function SkillProposalCard({
  messageId,
  proposal,
}: {
  messageId: number;
  proposal: SkillProposal;
}) {
  const { toast } = useToast();
  const [outcome, setOutcome] = useState<ProposalOutcome | null>(() =>
    getProposalOutcome("skill", messageId),
  );

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/skills", {
        name: proposal.name,
        code: proposal.code,
        difficulty: proposal.difficulty,
        isDrill: proposal.type === "drill" ? 1 : 0,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/skills"] });
      setProposalOutcome("skill", messageId, "confirmed");
      setOutcome("confirmed");
      toast({
        title: `${proposal.type === "drill" ? "Drill" : "Skill"} added to library`,
        description: `${proposal.name} (${proposal.code})`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't add to library",
        description: err.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const dismiss = () => {
    setProposalOutcome("skill", messageId, "dismissed");
    setOutcome("dismissed");
  };

  return (
    <div
      className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm space-y-2"
      data-testid={`card-skill-proposal-${messageId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-wider text-[11px] font-semibold text-primary">
          Add to skill library
        </span>
        <span
          className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary"
          data-testid={`badge-skill-proposal-type-${messageId}`}
        >
          {proposal.type}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-primary shrink-0">{proposal.code}</span>
        <span className="truncate">{proposal.name}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground shrink-0">
          DD {proposal.difficulty.toFixed(1)}
        </span>
      </div>
      {proposal.alreadyExists && outcome !== "confirmed" && (
        <p className="text-xs text-muted-foreground" data-testid={`text-skill-proposal-exists-${messageId}`}>
          An entry with this code or name is already in your library, so it can't be added again.
        </p>
      )}
      {outcome === "dismissed" ? (
        <p
          className="text-xs text-muted-foreground italic"
          data-testid={`text-skill-proposal-dismissed-${messageId}`}
        >
          Dismissed — nothing was added.
        </p>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            variant={outcome === "confirmed" ? "secondary" : "default"}
            disabled={
              outcome === "confirmed" || confirmMutation.isPending || proposal.alreadyExists
            }
            onClick={() => confirmMutation.mutate()}
            data-testid={`button-confirm-skill-proposal-${messageId}`}
          >
            {confirmMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : outcome === "confirmed" ? (
              <Check className="w-4 h-4 mr-2" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            {outcome === "confirmed" ? "Added to library" : "Add to library"}
          </Button>
          {outcome !== "confirmed" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={dismiss}
              disabled={confirmMutation.isPending}
              data-testid={`button-dismiss-skill-proposal-${messageId}`}
            >
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Confirm-first card for a coach-proposed Point to Fix. On confirm the
// point is sent to the server-side atomic append endpoint, which parses
// the CURRENT stored list, appends and writes inside one transaction —
// so a point added concurrently from another device can't be dropped.
function PointProposalCard({
  messageId,
  proposal,
}: {
  messageId: number;
  proposal: PointProposal;
}) {
  const { toast } = useToast();
  const [outcome, setOutcome] = useState<ProposalOutcome | null>(() =>
    getProposalOutcome("point", messageId),
  );

  const isLinked = proposal.skills.length > 0 || proposal.routines.length > 0;
  const category = isPointCategory(proposal.category) ? proposal.category : "General";

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/points-to-fix", {
        id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: proposal.name,
        skillIds: proposal.skills.map((l) => l.id),
        routineIds: proposal.routines.map((l) => l.id),
        ...(isLinked ? {} : { category }),
      });
      return res.json() as Promise<SafeUser>;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setProposalOutcome("point", messageId, "confirmed");
      setOutcome("confirmed");
      toast({ title: "Point to Fix added", description: proposal.name });
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't add the point",
        description: err.message || "Something went wrong. Check your connection and try again.",
        variant: "destructive",
      });
    },
  });

  const dismiss = () => {
    setProposalOutcome("point", messageId, "dismissed");
    setOutcome("dismissed");
  };

  return (
    <div
      className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm space-y-2"
      data-testid={`card-point-proposal-${messageId}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-wider text-[11px] font-semibold text-primary flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5" />
          Point to fix
        </span>
        {!isLinked && (
          <span
            className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary"
            data-testid={`badge-point-proposal-category-${messageId}`}
          >
            {category}
          </span>
        )}
      </div>
      <p className="font-medium" data-testid={`text-point-proposal-name-${messageId}`}>
        {proposal.name}
      </p>
      {isLinked && (
        <div className="flex flex-wrap gap-1.5" data-testid={`row-point-proposal-links-${messageId}`}>
          {proposal.skills.map((l) => (
            <span
              key={`s-${l.id}`}
              className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs"
            >
              <span className="font-mono text-primary">{l.code}</span>
              {l.name !== l.code && <span className="text-muted-foreground">{l.name}</span>}
            </span>
          ))}
          {proposal.routines.map((l) => (
            <span
              key={`r-${l.id}`}
              className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs"
            >
              <span className="font-mono text-primary">{l.code}</span>
              <span className="text-muted-foreground">routine</span>
            </span>
          ))}
        </div>
      )}
      {proposal.unresolved.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid={`text-point-proposal-unresolved-${messageId}`}>
          Not in your library (left unlinked): {proposal.unresolved.join(", ")}
        </p>
      )}
      {outcome === "dismissed" ? (
        <p
          className="text-xs text-muted-foreground italic"
          data-testid={`text-point-proposal-dismissed-${messageId}`}
        >
          Dismissed — nothing was added.
        </p>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            variant={outcome === "confirmed" ? "secondary" : "default"}
            disabled={outcome === "confirmed" || confirmMutation.isPending}
            onClick={() => confirmMutation.mutate()}
            data-testid={`button-confirm-point-proposal-${messageId}`}
          >
            {confirmMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : outcome === "confirmed" ? (
              <Check className="w-4 h-4 mr-2" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            {outcome === "confirmed" ? "Added to Points to Fix" : "Add to Points to Fix"}
          </Button>
          {outcome !== "confirmed" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={dismiss}
              disabled={confirmMutation.isPending}
              data-testid={`button-dismiss-point-proposal-${messageId}`}
            >
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Photos attached to the user turn that produced a draft: walk back from the
// assistant message to the nearest preceding user message and take its images.
function draftSourceImages(messages: CoachMessage[], assistantIndex: number): string[] {
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (messages[i].role === "user") return parseMessageImages(messages[i].images);
  }
  return [];
}

function ImageBubbles({ images, testId }: { images: string[]; testId: string }) {
  if (images.length === 0) return null;
  return (
    <div className={cn("flex gap-1.5 mb-1.5", images.length > 1 && "flex-wrap")}>
      {images.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`attachment ${i + 1}`}
          className="rounded-lg max-h-40 max-w-[160px] object-cover"
          data-testid={`${testId}-${i}`}
        />
      ))}
    </div>
  );
}

// Clear-history button with confirm dialog. Renders nothing while the chat is
// empty. Shared by the Coach page header and the floating widget header.
export function ClearChatButton() {
  const { data: messages } = useQuery<CoachMessage[]>({
    queryKey: ["/api/coach/messages"],
  });
  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/coach/messages");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coach/messages"] });
    },
  });

  if ((messages?.length ?? 0) === 0) return null;

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          data-testid="button-clear-chat"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear chat history?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your conversation with the coach.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-clear-chat-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => clearMutation.mutate()}
            data-testid="button-clear-chat-confirm"
          >
            Clear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// The coach chat itself: message list + input. `compact` makes the list fill
// its flex parent (floating widget); otherwise it uses page-card sizing.
// Sends the current route with each message so the coach knows what page the
// athlete is looking at. Supports 1-3 photo attachments per message (menu
// photos, technique shots) which the coach can see.
export function CoachChat({ compact = false }: { compact?: boolean }) {
  const [location] = useLocation();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [compressing, setCompressing] = useState(false);
  // The user's message and the coach's partial reply while a send is in
  // flight — rendered as optimistic bubbles until the history refetch lands.
  const [pendingUser, setPendingUser] = useState<{ content: string; images: string[] } | null>(null);
  const [streamText, setStreamText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Aborts the in-flight SSE fetch when the athlete taps Stop; the server
  // sees the disconnect and aborts the OpenAI stream too. Nothing is
  // persisted for a stopped reply — the question is restored to the input.
  const abortRef = useRef<AbortController | null>(null);

  // Paced typewriter for the coach reply. The upstream model often delivers
  // the whole answer in one burst at the end of the SSE stream (it "thinks",
  // then every token lands within ~100ms), so rendering raw deltas shows the
  // full text at once. Deltas accumulate in streamTargetRef; an interval
  // drains them into streamText at a readable rate instead.
  const streamTargetRef = useRef("");
  const streamShownRef = useRef(0);
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopReveal = () => {
    if (revealTimerRef.current != null) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    streamTargetRef.current = "";
    streamShownRef.current = 0;
  };

  const startReveal = () => {
    if (revealTimerRef.current != null) return;
    revealTimerRef.current = setInterval(() => {
      const target = streamTargetRef.current;
      const shown = streamShownRef.current;
      if (shown >= target.length) return; // caught up — wait for more deltas
      const backlog = target.length - shown;
      // Drain ~1/25th of the backlog per tick (min 2 chars): a huge burst
      // finishes within ~1–2s, while a trickle still types word by word.
      const step = Math.max(2, Math.ceil(backlog / 25));
      const next = Math.min(target.length, shown + step);
      streamShownRef.current = next;
      setStreamText(target.slice(0, next));
    }, 33);
  };

  // Never leave the reveal interval running after the chat unmounts.
  useEffect(() => stopReveal, []);

  const { data: messages, isLoading: messagesLoading } = useQuery<CoachMessage[]>({
    queryKey: ["/api/coach/messages"],
  });

  // Quick-reply chips are stored on the assistant message row, so they come
  // straight from history — closing and reopening the chat keeps them
  // visible. Only the newest message's chips are offered (older ones are
  // stale by definition), and the send refetch swaps them for the new ones.
  const lastMessage = messages?.[messages.length - 1];
  const suggestions =
    lastMessage?.role === "assistant" ? parseMessageSuggestions(lastMessage.suggestions) : [];

  const sendMutation = useMutation({
    mutationFn: async ({ content, images }: { content: string; images: string[] }) => {
      setPendingUser({ content, images });
      setStreamText("");
      stopReveal();
      startReveal();
      const aborter = new AbortController();
      abortRef.current = aborter;
      const res = await fetch("/api/coach/messages", {
        method: "POST",
        signal: aborter.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          page: location,
          // Local calendar date so the coach's "today" matches the athlete's
          // timezone (the server clock is UTC).
          date: new Date().toLocaleDateString("en-CA"),
          ...(images.length > 0 ? { images } : {}),
        }),
        credentials: "include",
      });
      if (!res.ok || !res.headers.get("content-type")?.includes("text/event-stream")) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${text}`);
      }
      // Parse the SSE stream: {delta} chunks build the reply live, {done}
      // completes it, {error} aborts.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let done = false;
      let guideUpdated = false;
      while (true) {
        const { value, done: eof } = await reader.read();
        if (eof) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const dataLine = evt.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          let payload: { delta?: string; done?: boolean; reply?: string; error?: string; guideUpdated?: boolean };
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }
          if (payload.error) throw new Error(`503: ${payload.error}`);
          if (payload.delta) {
            acc += payload.delta;
            // Feed the typewriter; the reveal interval paces the display.
            streamTargetRef.current = acc;
          }
          if (payload.done) {
            done = true;
            if (payload.guideUpdated) guideUpdated = true;
          }
        }
      }
      if (!done) throw new Error("503: stream ended unexpectedly");
      // Let the typewriter catch up (bounded) so the bubble doesn't jump to
      // the full text the instant the network stream ends. If the reveal
      // interval is gone (chat closed mid-reply), skip the wait entirely so
      // the reply persists and history refreshes without an artificial stall.
      const revealDeadline = Date.now() + 4000;
      while (
        revealTimerRef.current != null &&
        streamShownRef.current < streamTargetRef.current.length &&
        Date.now() < revealDeadline
      ) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return { reply: acc, guideUpdated };
    },
    onSuccess: async ({ guideUpdated }) => {
      stopReveal();
      await queryClient.invalidateQueries({ queryKey: ["/api/coach/messages"] });
      setPendingUser(null);
      setStreamText("");
      if (guideUpdated) {
        // The coach rewrote the menu notation guide — refresh the cached user
        // and point the athlete at Settings where it stays text-editable.
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        toast({
          title: "Menu notation guide updated",
          description: "The coach updated your guide. Review or edit it in Settings.",
        });
      }
    },
    onSettled: () => {
      abortRef.current = null;
    },
    onError: (err: Error) => {
      stopReveal();
      setPendingUser(null);
      setStreamText("");
      // A stop is deliberate — no error toast; send()'s onError restores the
      // question into the input so it can be rephrased and re-sent.
      if (err.name === "AbortError") return;
      toast({
        title: "The coach didn't answer",
        description: err.message.includes("503")
          ? "The AI coach is unavailable right now. Please try again in a moment."
          : "Something went wrong sending your message.",
        variant: "destructive",
      });
    },
  });

  // Keep the newest message in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sendMutation.isPending, streamText]);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const room = MAX_IMAGES - attachments.length;
    if (room <= 0) {
      toast({ title: "Photo limit", description: `You can attach up to ${MAX_IMAGES} photos.` });
      return;
    }
    const list = Array.from(files);
    if (list.length > room) {
      toast({ title: "Photo limit", description: `Only the first ${room} photo${room > 1 ? "s" : ""} will be attached.` });
    }
    setCompressing(true);
    try {
      for (const file of list.slice(0, room)) {
        if (!file.type.startsWith("image/")) {
          toast({
            title: "Unsupported file",
            description: `"${file.name}" isn't an image. Only photos can be attached.`,
            variant: "destructive",
          });
          continue;
        }
        try {
          const dataUrl = await compressImage(file);
          setAttachments((prev) => (prev.length < MAX_IMAGES ? [...prev, dataUrl] : prev));
        } catch {
          toast({
            title: "Couldn't attach photo",
            description: `"${file.name}" couldn't be read or is too large.`,
            variant: "destructive",
          });
        }
      }
    } finally {
      setCompressing(false);
    }
  };

  const send = (text?: string) => {
    const content = (text ?? input).trim();
    const images = text != null ? [] : attachments;
    if ((!content && images.length === 0) || sendMutation.isPending || compressing) return;
    setInput("");
    setAttachments([]);
    sendMutation.mutate(
      { content, images },
      {
        onError: () => {
          setInput(content);
          setAttachments(images);
        },
      },
    );
  };

  const hasMessages = (messages?.length ?? 0) > 0 || (sendMutation.isPending && pendingUser != null);
  // Hide partially-streamed draft_entry / menu_guide / proposal blocks; the
  // parsed card (or the guide-updated toast) replaces them.
  const visibleStream = streamText
    .split("```draft_entry")[0]
    .split("```menu_guide")[0]
    .split("```skill_proposal")[0]
    .split("```point_proposal")[0]
    .trimEnd();

  return (
    <>
      <div
        ref={scrollRef}
        className={cn(
          "px-4 pb-2 overflow-y-auto space-y-3",
          compact ? "flex-1 min-h-0" : "px-5 max-h-[50vh] min-h-[180px]",
        )}
        data-testid="list-coach-messages"
      >
        {messagesLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-10 w-3/4 rounded-xl" />
            <Skeleton className="h-10 w-2/3 rounded-xl ml-auto" />
          </div>
        ) : !hasMessages ? (
          <div className="py-6 text-center" data-testid="text-coach-empty">
            <Bot className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground mb-4">
              Ask about your training, or how to use anything in the app.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s, i) => (
                <button
                  key={i}
                  className="text-[11px] font-mono px-3 py-1.5 rounded-xl bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => send(s)}
                  data-testid={`button-suggestion-${i}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages!.map((m, idx) => {
            const msgImages = parseMessageImages(m.images);
            const msgDraft = m.role === "assistant" ? parseMessageDraft(m.draft) : null;
            const msgProposals =
              m.role === "assistant" ? parseMessageProposals(m.proposals) : null;
            // Photos from the user turn that triggered this draft, shown
            // beside the editable draft for easy comparison.
            const draftImages = msgDraft ? draftSourceImages(messages!, idx) : [];
            return (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col gap-2",
                  m.role === "user" ? "items-end" : "items-start",
                )}
                data-testid={`message-coach-${m.id}`}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-primary/15 text-foreground"
                      : "bg-secondary text-foreground",
                  )}
                >
                  <ImageBubbles images={msgImages} testId={`img-coach-message-${m.id}`} />
                  {m.content}
                </div>
                {msgDraft && (
                  <div className="w-full">
                    <DraftEntryCard
                      messageId={m.id}
                      draft={msgDraft}
                      images={draftImages}
                      compact={compact}
                    />
                  </div>
                )}
                {msgProposals?.skill && (
                  <div className="w-full">
                    <SkillProposalCard messageId={m.id} proposal={msgProposals.skill} />
                  </div>
                )}
                {msgProposals?.point && (
                  <div className="w-full">
                    <PointProposalCard messageId={m.id} proposal={msgProposals.point} />
                  </div>
                )}
              </div>
            );
          })
        )}
        {sendMutation.isPending && pendingUser != null && (
          <div className="flex justify-end" data-testid="message-coach-pending-user">
            <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-primary/15 text-foreground">
              <ImageBubbles images={pendingUser.images} testId="img-coach-pending" />
              {pendingUser.content}
            </div>
          </div>
        )}
        {sendMutation.isPending &&
          (visibleStream ? (
            <div className="flex justify-start" data-testid="message-coach-streaming">
              <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-secondary text-foreground">
                {visibleStream}
                <span className="inline-block w-2 h-4 ml-0.5 align-text-bottom bg-primary/60 animate-pulse rounded-sm" />
              </div>
            </div>
          ) : (
            <div className="flex justify-start" data-testid="indicator-coach-thinking">
              <div className="bg-secondary rounded-2xl px-4 py-2.5 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking…
              </div>
            </div>
          ))}
      </div>

      {suggestions.length > 0 && !sendMutation.isPending && (
        <div className="px-3 pt-2 pb-1 flex gap-2 shrink-0 overflow-x-auto no-scrollbar" data-testid="row-coach-suggestions">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => send(s)}
              className="text-sm px-4 py-2 rounded-full border border-border bg-white/[0.04] hover:bg-secondary text-foreground transition-colors whitespace-nowrap shrink-0"
              data-testid={`button-reply-suggestion-${i}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="px-3 pt-2 flex gap-2 shrink-0" data-testid="row-coach-attachments">
          {attachments.map((src, i) => (
            <div key={i} className="relative">
              <img
                src={src}
                alt={`photo ${i + 1}`}
                className="h-14 w-14 rounded-lg object-cover border border-white/[0.08]"
                data-testid={`img-attachment-preview-${i}`}
              />
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label="Remove photo"
                data-testid={`button-remove-attachment-${i}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 border-t border-white/[0.07] flex items-end gap-2 shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
          data-testid="input-coach-photos"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-[44px] w-[44px] shrink-0 text-muted-foreground"
          onClick={() => fileInputRef.current?.click()}
          disabled={compressing || attachments.length >= MAX_IMAGES || sendMutation.isPending}
          aria-label="Attach photos"
          data-testid="button-attach-photo"
        >
          {compressing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
        </Button>
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask your coach…"
          rows={1}
          className="min-h-[44px] max-h-32 resize-none"
          data-testid="input-coach-message"
        />
        {sendMutation.isPending ? (
          <Button
            size="icon"
            variant="destructive"
            className="h-[44px] w-[44px] shrink-0"
            onClick={() => abortRef.current?.abort()}
            aria-label="Stop reply"
            data-testid="button-stop-reply"
          >
            <Square className="w-4 h-4 fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="h-[44px] w-[44px] shrink-0"
            onClick={() => send()}
            disabled={(!input.trim() && attachments.length === 0) || compressing}
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        )}
      </div>
    </>
  );
}
