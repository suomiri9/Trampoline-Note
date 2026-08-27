import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  insertDictionaryEntrySchema,
  type DictionaryEntry,
  type InsertDictionaryEntry,
} from "@shared/schema";
import {
  useDictionary,
  useDictionaryImport,
  useDictionarySuggestions,
  useDictionaryImageActions,
  dictionaryImageUrl,
} from "@/hooks/use-dictionary";
import { useSkills } from "@/hooks/use-skills";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DialogHero } from "@/components/dialog-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { pageAccentStyle } from "@/lib/page-accent";
import {
  BookOpen,
  Inbox,
  MessageSquarePlus,
  Plus,
  Check,
  X,
  MoreVertical,
  Pencil,
  Archive,
  ArchiveRestore,
  RefreshCw,
  ListPlus,
  Sparkles,
  ImageOff,
  CheckCircle2,
  Loader2,
} from "lucide-react";

// Same phone bottom-sheet treatment as the other Arsenal dialogs.
const sheetClass =
  "!z-[70] sm:max-w-md max-h-[90dvh] overflow-y-auto max-sm:!top-auto max-sm:!bottom-[var(--kb-inset-b,0px)] max-sm:!translate-y-0 max-sm:!max-w-full max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:max-h-[85dvh] max-sm:data-[state=open]:slide-in-from-bottom-8";

const blankEntryForm: InsertDictionaryEntry = {
  name: "",
  shortName: "",
  numeric: "",
  isDrill: 0,
  difficulty: 0,
  description: "",
};

function formatSuggestionDate(value: unknown): string {
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface DictionarySectionProps {
  searchQuery: string;
  showArchived: boolean;
  /** Controls which capabilities are exposed. athlete = browse/adopt/suggest only. admin = full curation bench. */
  mode: "athlete" | "admin";
  /** The page header's Add button toggles this (admin mode only). */
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
}

// ---- Admin-only: Image Panel ----
// Shows draft + approved images, generation controls, approve/remove actions.
// Does not close the form on generation failure — form state is preserved.
function ImagePanel({
  entry,
  generateImage,
  isGenerating,
  approveImage,
  isApproving,
  removeImage,
  isRemoving,
}: {
  entry: DictionaryEntry;
  generateImage: (id: number) => Promise<DictionaryEntry>;
  isGenerating: boolean;
  approveImage: (id: number) => Promise<DictionaryEntry>;
  isApproving: boolean;
  removeImage: (args: { entryId: number; target: "draft" | "approved" | "all" }) => Promise<DictionaryEntry>;
  isRemoving: boolean;
}) {
  const hasDraft = !!entry.draftImageKey;
  const hasApproved = !!entry.approvedImageKey;
  // Timestamp for cache-busting: use the stored date strings from the entry.
  const draftTs = entry.draftImageCreatedAt ? String(entry.draftImageCreatedAt) : undefined;
  const approvedTs = entry.approvedImageApprovedAt ? String(entry.approvedImageApprovedAt) : undefined;

  const busy = isGenerating || isApproving || isRemoving;

  return (
    <div className="space-y-3 pt-1" data-testid={`image-panel-${entry.id}`}>
      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/60">Images</p>

      {/* Draft image */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">Draft</span>
          {hasDraft && entry.draftImageModel && (
            <span className="text-[10px] text-muted-foreground/50 truncate max-w-[120px]">{entry.draftImageModel}</span>
          )}
        </div>
        {hasDraft ? (
          <div className="space-y-2">
            <img
              src={dictionaryImageUrl(entry.id, "draft", draftTs ?? null)}
              alt={`Draft image for ${entry.name}`}
              className="w-full rounded-lg object-cover max-h-48"
              data-testid={`img-draft-${entry.id}`}
            />
            {entry.draftImagePrompt && (
              <p className="text-[10px] text-muted-foreground/60 line-clamp-2">{entry.draftImagePrompt}</p>
            )}
            <div className="flex gap-1.5 flex-wrap">
              <Button
                size="sm"
                className="h-7 px-2 text-[11px] gap-1 flex-1"
                disabled={busy}
                onClick={() => approveImage(entry.id).catch(() => {})}
                data-testid={`button-approve-image-${entry.id}`}
              >
                {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                Approve draft
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px] gap-1"
                disabled={busy}
                onClick={() => generateImage(entry.id).catch(() => {})}
                data-testid={`button-regen-image-${entry.id}`}
              >
                {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Regenerate
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] gap-1 text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => removeImage({ entryId: entry.id, target: "draft" }).catch(() => {})}
                data-testid={`button-remove-draft-${entry.id}`}
              >
                <ImageOff className="h-3 w-3" /> Remove draft
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px] gap-1"
              disabled={busy}
              onClick={() => generateImage(entry.id).catch(() => {})}
              data-testid={`button-gen-image-${entry.id}`}
            >
              {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {isGenerating ? "Generating..." : "Generate image"}
            </Button>
          </div>
        )}
      </div>

      {/* Approved image */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">Approved</span>
          {hasApproved && entry.approvedImageModel && (
            <span className="text-[10px] text-muted-foreground/50 truncate max-w-[120px]">{entry.approvedImageModel}</span>
          )}
        </div>
        {hasApproved ? (
          <div className="space-y-2">
            <img
              src={dictionaryImageUrl(entry.id, "approved", approvedTs ?? null)}
              alt={`Approved image for ${entry.name}`}
              className="w-full rounded-lg object-cover max-h-48"
              data-testid={`img-approved-${entry.id}`}
            />
            {entry.approvedImagePrompt && (
              <p className="text-[10px] text-muted-foreground/60 line-clamp-2">{entry.approvedImagePrompt}</p>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] gap-1 text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => removeImage({ entryId: entry.id, target: "approved" }).catch(() => {})}
              data-testid={`button-remove-approved-${entry.id}`}
            >
              <ImageOff className="h-3 w-3" /> Remove approved
            </Button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/50">No approved image yet.</p>
        )}
      </div>

      {(hasDraft || hasApproved) && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] gap-1 text-destructive hover:text-destructive w-full"
          disabled={busy}
          onClick={() => removeImage({ entryId: entry.id, target: "all" }).catch(() => {})}
          data-testid={`button-remove-all-images-${entry.id}`}
        >
          <ImageOff className="h-3 w-3" /> Remove all images
        </Button>
      )}
    </div>
  );
}

// The shared skills & drills Dictionary section.
// mode='athlete' — browse/search/adopt/suggest; approved images shown in rows.
// mode='admin' — full curation bench: create/edit/archive/import/review/image lifecycle.
export function DictionarySection({ searchQuery, showArchived, mode, formOpen, onFormOpenChange }: DictionarySectionProps) {
  const isAdmin = mode === "admin";

  const {
    data: entries,
    isLoading,
    error,
    refetch,
    createEntry,
    isCreatingEntry,
    updateEntry,
    isUpdatingEntry,
    suggest,
    isSuggesting,
    adoptEntry,
    adoptingEntryId,
  } = useDictionary();
  const { data: allItems } = useSkills();
  const {
    data: suggestions,
    isLoading: suggestionsLoading,
    pendingCount,
    resolve,
    isResolving,
    refetch: refetchSuggestions,
  } = useDictionarySuggestions(isAdmin);
  const [importOpen, setImportOpen] = useState(false);
  const {
    data: importPreview,
    isLoading: importPreviewLoading,
    error: importPreviewError,
    refetch: refetchImportPreview,
    importLibrary,
    isImporting,
  } = useDictionaryImport(isAdmin && importOpen);

  const {
    generateImage,
    isGenerating,
    generatingEntryId,
    approveImage,
    isApproving,
    approvingEntryId,
    removeImage,
    isRemoving,
  } = useDictionaryImageActions();

  // ---- Adoption ("Add to my skills") ----
  const adoptedIds = new Set(
    (allItems ?? [])
      .filter((s) => s.dictionaryEntryId != null && s.archived !== 1)
      .map((s) => s.dictionaryEntryId as number),
  );
  const adopt = async (entry: DictionaryEntry) => {
    try {
      await adoptEntry(entry.id);
    } catch {
      // useDictionary already toasts failures
    }
  };

  // ---- Suggest a correction ----
  const [suggestTarget, setSuggestTarget] = useState<DictionaryEntry | null>(null);
  const [suggestName, setSuggestName] = useState("");
  const [suggestNote, setSuggestNote] = useState("");
  const openSuggest = (entry: DictionaryEntry) => {
    setSuggestTarget(entry);
    setSuggestName("");
    setSuggestNote("");
  };
  const submitSuggestion = async () => {
    if (!suggestTarget || !suggestName.trim()) return;
    try {
      await suggest({
        entryId: suggestTarget.id,
        suggestedName: suggestName.trim(),
        note: suggestNote.trim() || null,
      });
      setSuggestTarget(null);
    } catch {
      // hook toasts the reason — keep the sheet open
    }
  };

  // ---- Admin: entry editor ----
  const [editingEntry, setEditingEntry] = useState<DictionaryEntry | null>(null);
  // Track which tab is active in the editor: metadata vs images
  const [editorTab, setEditorTab] = useState<"info" | "images">("info");
  const editorForm = useForm<InsertDictionaryEntry>({
    resolver: zodResolver(insertDictionaryEntrySchema),
    defaultValues: blankEntryForm,
  });
  const editorOpen = (formOpen && isAdmin) || !!editingEntry;
  const closeEditor = () => {
    onFormOpenChange(false);
    setEditingEntry(null);
    setEditorTab("info");
    editorForm.reset(blankEntryForm);
  };
  const startEditEntry = (entry: DictionaryEntry) => {
    onFormOpenChange(false);
    setEditingEntry(entry);
    setEditorTab("info");
    editorForm.reset({
      name: entry.name,
      shortName: entry.shortName,
      numeric: entry.numeric ?? "",
      isDrill: entry.isDrill === 1 ? 1 : 0,
      difficulty: entry.difficulty,
      description: entry.description ?? "",
    });
  };
  const onEditorSubmit = editorForm.handleSubmit(async (values) => {
    const payload = {
      ...values,
      numeric: values.numeric?.trim() ? values.numeric.trim() : null,
      description: values.description?.trim() ? values.description.trim() : null,
    };
    try {
      if (editingEntry) {
        const updatedEntry = await updateEntry({ id: editingEntry.id, ...payload });
        setEditingEntry(updatedEntry);
        // Keep editor open after update so admin can switch to images tab
        // — only close for new entries (where there's no image to manage yet).
      } else {
        await createEntry(payload);
        closeEditor();
      }
    } catch {
      // hook toasts failures — keep the form open
    }
  });

  // ---- Admin: review queue ----
  const [reviewOpen, setReviewOpen] = useState(false);

  // ---- Filtering ----
  const archivedView = isAdmin && showArchived;
  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = (e: DictionaryEntry) =>
    !q ||
    e.name.toLowerCase().includes(q) ||
    e.shortName.toLowerCase().includes(q) ||
    (e.numeric ?? "").toLowerCase().includes(q) ||
    (e.altNames ?? []).some((n) => n.toLowerCase().includes(q)) ||
    (e.description ?? "").toLowerCase().includes(q);
  const visible = (entries ?? []).filter(
    (e) => (archivedView ? e.archived === 1 : e.archived !== 1) && matchesSearch(e),
  );
  const totalInView = (entries ?? []).filter((e) => (archivedView ? e.archived === 1 : e.archived !== 1)).length;

  const kindBadge = (isDrill: number, testId?: string) => (
    <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground" data-testid={testId}>
      {isDrill === 1 ? "Drill" : "Skill"}
    </Badge>
  );

  return (
    <div>
      <div className="rounded-2xl border border-[hsl(var(--page-accent)/0.14)] bg-white/[0.02] overflow-hidden" data-testid="section-dictionary">
        <div className="flex flex-row items-center justify-between shrink-0 px-4 py-3 border-b border-[hsl(var(--page-accent)/0.12)] bg-[hsl(var(--page-accent)/0.04)]">
          <span className="inline-flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.18em] text-[hsl(var(--page-accent)/0.85)]">
            <span className="h-3 w-[2px] rounded-full bg-[hsl(var(--page-accent)/0.7)]" aria-hidden="true" />
            {archivedView ? "Archived Dictionary Entries" : "Skills & Drills Dictionary"}
            <span className="text-muted-foreground/50 tabular-nums">{visible.length}</span>
          </span>
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setImportOpen(true)}
                data-testid="button-import-library"
              >
                <ListPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setReviewOpen(true);
                  void refetchSuggestions();
                }}
                data-testid="button-review-suggestions"
              >
                <Inbox className="h-4 w-4" />
                <span className="hidden sm:inline">Review</span>
                {pendingCount > 0 && (
                  <span
                    className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--page-accent))] px-1 text-[9px] font-bold text-white tabular-nums"
                    data-testid="badge-pending-count"
                  >
                    {pendingCount}
                  </span>
                )}
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2" data-testid="loading-dictionary">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-white/[0.03] animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="py-10 px-4 text-center" data-testid="error-dictionary">
            <p className="text-sm text-muted-foreground">Couldn't load the dictionary.</p>
            <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => refetch()} data-testid="button-retry-dictionary">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        ) : totalInView === 0 ? (
          <div className="py-12 px-4 text-center flex flex-col items-center" data-testid="text-dictionary-empty">
            <div className="w-12 h-12 mb-4 rounded-full bg-[hsl(var(--page-accent)/0.08)] flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-[hsl(var(--page-accent)/0.8)]" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {archivedView ? "No archived entries" : "The dictionary is empty"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-[300px]">
              {archivedView
                ? "Entries you archive will land here."
                : isAdmin
                  ? "Add your first entry — every athlete will be able to browse it and copy it into their own library."
                  : "The shared list of skills and drills is still being put together. Check back soon!"}
            </p>
            {isAdmin && !archivedView && (
              <Button size="sm" className="mt-4 gap-1.5" onClick={() => onFormOpenChange(true)} data-testid="button-empty-add-entry">
                <Plus className="h-4 w-4" /> Add entry
              </Button>
            )}
          </div>
        ) : (
          <>
            {!archivedView && mode === "athlete" && (
              <p className="px-4 pt-3 text-xs text-muted-foreground">
                Curated skills &amp; drills — tap <span className="font-medium text-foreground">Add</span> to copy one into your own library.
              </p>
            )}
            <div className="overflow-x-auto p-2">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.08] hover:bg-transparent">
                    <TableHead className="eyebrow w-24">Numeric</TableHead>
                    <TableHead className="eyebrow">Name</TableHead>
                    <TableHead className="eyebrow text-right">DD</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6" data-testid="text-dictionary-no-matches">
                        No entries match your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    visible.map((entry) => (
                      <TableRow key={entry.id} className="hover:bg-white/[0.02]" data-testid={`row-dict-${entry.id}`}>
                        <TableCell className="text-sm text-muted-foreground w-24 normal-case">
                          {entry.numeric || "—"}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          <span className="inline-flex items-center gap-2 flex-wrap">
                            <span>{entry.name}</span>
                            {kindBadge(entry.isDrill, `badge-kind-${entry.id}`)}
                          </span>
                          <div className="text-[11px] text-muted-foreground mt-0.5" data-testid={`text-short-name-${entry.id}`}>
                            {entry.shortName}
                          </div>
                          {(entry.altNames ?? []).length > 0 && (
                            <div className="text-[11px] text-muted-foreground/80 mt-0.5" data-testid={`text-alt-names-${entry.id}`}>
                              also called {(entry.altNames ?? []).join(", ")}
                            </div>
                          )}
                          {entry.description && (
                            <div className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-1">{entry.description}</div>
                          )}
                          {/* Approved image thumbnail in athlete rows */}
                          {entry.approvedImageApprovedAt && (
                            <div className="mt-1.5">
                              <img
                                src={dictionaryImageUrl(entry.id, "approved", entry.approvedImageApprovedAt ? String(entry.approvedImageApprovedAt) : null)}
                                alt={entry.name}
                                className="h-12 w-16 rounded-md object-cover"
                                data-testid={`img-approved-row-${entry.id}`}
                              />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-[hsl(var(--page-accent)/0.9)] tabular-nums">
                          {entry.difficulty.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {!isAdmin && !archivedView &&
                              (adoptedIds.has(entry.id) ? (
                                <span
                                  className="inline-flex items-center gap-1 pr-1 text-[11px] font-medium text-[hsl(var(--page-accent)/0.9)]"
                                  data-testid={`status-added-${entry.id}`}
                                >
                                  <Check className="h-3.5 w-3.5" /> Added
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 px-2 text-[11px]"
                                  disabled={adoptingEntryId === entry.id}
                                  onClick={() => adopt(entry)}
                                  data-testid={`button-adopt-${entry.id}`}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  {adoptingEntryId === entry.id ? "Adding..." : "Add"}
                                </Button>
                              ))}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-actions-dict-${entry.id}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52 rounded-xl">
                                {/* Suggest correction: available to all modes when not archived */}
                                {!isAdmin && !archivedView && (
                                  <DropdownMenuItem
                                    className="cursor-pointer gap-2 text-xs"
                                    onClick={() => openSuggest(entry)}
                                    data-testid={`menu-suggest-${entry.id}`}
                                  >
                                    <MessageSquarePlus className="h-3.5 w-3.5" /> Suggest a correction
                                  </DropdownMenuItem>
                                )}
                                {/* Admin-only actions */}
                                {isAdmin && (
                                  <>
                                    <DropdownMenuItem
                                      className="cursor-pointer gap-2 text-xs"
                                      onClick={() => startEditEntry(entry)}
                                      data-testid={`menu-edit-entry-${entry.id}`}
                                    >
                                      <Pencil className="h-3.5 w-3.5" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="cursor-pointer gap-2 text-xs"
                                      onClick={() =>
                                        updateEntry({ id: entry.id, archived: entry.archived === 1 ? 0 : 1 }).catch(() => {})
                                      }
                                      data-testid={`menu-archive-entry-${entry.id}`}
                                    >
                                      {entry.archived === 1 ? (
                                        <>
                                          <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
                                        </>
                                      ) : (
                                        <>
                                          <Archive className="h-3.5 w-3.5" /> Archive
                                        </>
                                      )}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Suggest-a-correction sheet (any user) */}
      <Dialog open={!!suggestTarget} onOpenChange={(o) => { if (!o) setSuggestTarget(null); }}>
        <DialogContent data-kb-anchor="bottom" aria-describedby={undefined} className={sheetClass} style={pageAccentStyle("skills")}>
          <DialogHero icon={MessageSquarePlus} eyebrow="The Arsenal" title="Suggest a correction" />
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
              {suggestTarget?.numeric && (
                <span className="text-muted-foreground normal-case">{suggestTarget.numeric}</span>
              )}
              <span className="font-medium">{suggestTarget?.name}</span>
              <span className="text-muted-foreground">{suggestTarget?.shortName}</span>
              {suggestTarget && kindBadge(suggestTarget.isDrill)}
            </div>
            <p className="text-xs text-muted-foreground">
              Know this {suggestTarget?.isDrill === 1 ? "drill" : "skill"} under a different name? Send it to the
              developer — accepted names show up as "also called ...".
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none" htmlFor="suggest-name">Suggested name</label>
              <Input
                id="suggest-name"
                value={suggestName}
                onChange={(e) => setSuggestName(e.target.value)}
                placeholder="e.g. Barani ball out"
                maxLength={120}
                data-testid="input-suggest-name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none" htmlFor="suggest-note">
                Note <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                id="suggest-note"
                value={suggestNote}
                onChange={(e) => setSuggestNote(e.target.value)}
                placeholder="Anything that helps — where you've heard it, a source..."
                rows={3}
                maxLength={500}
                data-testid="input-suggest-note"
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={submitSuggestion}
                disabled={!suggestName.trim() || isSuggesting}
                data-testid="button-send-suggestion"
              >
                {isSuggesting ? "Sending..." : "Send suggestion"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSuggestTarget(null)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Entry editor + image lifecycle (admin only) */}
      {isAdmin && (
        <Dialog open={editorOpen} onOpenChange={(o) => { if (!o) closeEditor(); }}>
          <DialogContent data-kb-anchor="bottom" aria-describedby={undefined} className={sheetClass} style={pageAccentStyle("skills")}>
            <DialogHero icon={BookOpen} eyebrow="The Arsenal" title={editingEntry ? "Edit entry" : "Add entry"} />

            {/* Tab strip — only shown when editing an existing entry (new entries have no image yet) */}
            {editingEntry && (
              <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08] mb-1">
                <button
                  type="button"
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-colors pressable ${
                    editorTab === "info"
                      ? "bg-white/[0.08] text-foreground font-semibold"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setEditorTab("info")}
                  data-testid="tab-editor-info"
                >
                  Info
                </button>
                <button
                  type="button"
                  className={`flex-1 py-1.5 rounded-lg text-[11px] font-mono uppercase tracking-wider transition-colors pressable ${
                    editorTab === "images"
                      ? "bg-white/[0.08] text-foreground font-semibold"
                      : "text-muted-foreground"
                  }`}
                  onClick={() => setEditorTab("images")}
                  data-testid="tab-editor-images"
                >
                  Images
                  {(editingEntry.draftImageKey || editingEntry.approvedImageKey) && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--page-accent)/0.7)]" />
                  )}
                </button>
              </div>
            )}

            {/* Info tab (always shown for new entries, conditionally for edits) */}
            {(!editingEntry || editorTab === "info") && (
              <Form {...editorForm}>
                <form onSubmit={onEditorSubmit} className="space-y-3">
                  <FormField control={editorForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl><Input {...field} placeholder="Barani" data-testid="input-entry-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={editorForm.control} name="shortName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Short name</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          maxLength={40}
                          placeholder="Warm up"
                          data-testid="input-entry-short-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={editorForm.control} name="numeric" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Numeric <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          maxLength={40}
                          placeholder="41/"
                          data-testid="input-entry-numeric"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={editorForm.control} name="isDrill" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select value={String(field.value ?? 0)} onValueChange={(v) => field.onChange(parseInt(v))}>
                        <FormControl><SelectTrigger data-testid="select-entry-kind"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="0">Skill</SelectItem>
                          <SelectItem value="1">Drill</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={editorForm.control} name="difficulty" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Difficulty</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.1" {...field} onChange={(e) => field.onChange(parseFloat(e.target.value))} data-testid="input-entry-difficulty" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={editorForm.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value ?? ""} rows={3} maxLength={500} placeholder="Cues, prerequisites, what to watch for..." data-testid="input-entry-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1" disabled={isCreatingEntry || isUpdatingEntry} data-testid="button-save-entry">
                      {editingEntry
                        ? (isUpdatingEntry ? "Saving..." : "Update")
                        : (isCreatingEntry ? "Adding..." : "Add Entry")}
                    </Button>
                    <Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button>
                  </div>
                </form>
              </Form>
            )}

            {/* Images tab (edit-only) */}
            {editingEntry && editorTab === "images" && (
              <ImagePanel
                entry={editingEntry}
                generateImage={async (id) => {
                  const entry = await generateImage(id);
                  setEditingEntry(entry);
                  return entry;
                }}
                isGenerating={isGenerating && generatingEntryId === editingEntry.id}
                approveImage={async (id) => {
                  const entry = await approveImage(id);
                  setEditingEntry(entry);
                  return entry;
                }}
                isApproving={isApproving && approvingEntryId === editingEntry.id}
                removeImage={async (args) => {
                  const entry = await removeImage(args);
                  setEditingEntry(entry);
                  return entry;
                }}
                isRemoving={isRemoving}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Suggestion review queue (admin only) */}
      {isAdmin && (
        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <DialogContent data-kb-anchor="bottom" aria-describedby={undefined} className={sheetClass} style={pageAccentStyle("skills")}>
            <DialogHero icon={Inbox} eyebrow="The Arsenal" title="Review suggestions" />
            <div className="space-y-3">
              {suggestionsLoading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
              ) : !suggestions || suggestions.length === 0 ? (
                <div className="py-8 text-center" data-testid="text-queue-empty">
                  <p className="text-sm font-medium text-foreground">All clear</p>
                  <p className="text-xs text-muted-foreground mt-1">No pending suggestions right now.</p>
                </div>
              ) : (
                suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2"
                    data-testid={`card-suggestion-${s.id}`}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="normal-case">{s.entryShortName}</span>
                      <span className="font-medium text-foreground">{s.entryName}</span>
                      {kindBadge(s.entryIsDrill)}
                    </div>
                    <p className="text-sm">
                      also called <span className="font-semibold">"{s.suggestedName}"</span>
                    </p>
                    {s.note && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{s.note}</p>}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-muted-foreground">
                        {s.submitterName ?? "Unknown user"}
                        {formatSuggestionDate(s.createdAt) && ` · ${formatSuggestionDate(s.createdAt)}`}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px] gap-1"
                          disabled={isResolving}
                          onClick={() => resolve({ id: s.id, action: "reject" }).catch(() => {})}
                          data-testid={`button-reject-${s.id}`}
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1"
                          disabled={isResolving}
                          onClick={() => resolve({ id: s.id, action: "accept" }).catch(() => {})}
                          data-testid={`button-accept-${s.id}`}
                        >
                          <Check className="h-3.5 w-3.5" /> Accept
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Owner-only, preview-first personal-library import. */}
      {isAdmin && (
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent data-kb-anchor="bottom" aria-describedby={undefined} className={sheetClass} style={pageAccentStyle("skills")}>
            <DialogHero icon={ListPlus} eyebrow="The Arsenal" title="Import my library" />
            {importPreviewLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Checking your library...</div>
            ) : importPreviewError || !importPreview ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">Couldn't check your library.</p>
                <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => refetchImportPreview()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  This copies your active skills and drills into the shared dictionary. Their existing codes become both Short names and Numeric values, so you can clear or adjust the exceptions afterward.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-foreground">{importPreview.counts.toAdd}</div>
                    <div className="text-[10px] text-muted-foreground">to add</div>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-foreground">{importPreview.counts.reused}</div>
                    <div className="text-[10px] text-muted-foreground">already there</div>
                  </div>
                  <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                    <div className="text-lg font-bold tabular-nums text-foreground">{importPreview.counts.skipped}</div>
                    <div className="text-[10px] text-muted-foreground">skipped</div>
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.08] divide-y divide-white/[0.06] max-h-64 overflow-y-auto">
                  {importPreview.candidates.length === 0 ? (
                    <p className="p-4 text-center text-xs text-muted-foreground">No eligible skills or drills found.</p>
                  ) : (
                    importPreview.candidates.map((candidate) => (
                      <div key={candidate.skillId} className="flex items-center gap-3 px-3 py-2">
                        <span className="w-20 shrink-0 text-xs text-muted-foreground normal-case">{candidate.shortName}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{candidate.name}</span>
                        <Badge variant="outline" className="shrink-0 text-[9px]">
                          {candidate.status === "new" ? "New" : "Existing"}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={isImporting || importPreview.candidates.length === 0}
                    onClick={async () => {
                      try {
                        await importLibrary();
                        setImportOpen(false);
                      } catch {
                        // hook keeps the sheet open and shows the reason
                      }
                    }}
                    data-testid="button-confirm-import-library"
                  >
                    {isImporting ? "Importing..." : "Import library"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
