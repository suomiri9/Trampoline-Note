import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  insertDictionaryEntrySchema,
  type DictionaryEntry,
  type InsertDictionaryEntry,
} from "@shared/schema";
import { useDictionary, useDictionarySuggestions } from "@/hooks/use-dictionary";
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
} from "lucide-react";

// Same phone bottom-sheet treatment as the other Arsenal dialogs.
const sheetClass =
  "sm:max-w-md max-h-[90dvh] overflow-y-auto max-sm:!top-auto max-sm:!bottom-0 max-sm:!translate-y-0 max-sm:!max-w-full max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:max-h-[85dvh] max-sm:data-[state=open]:slide-in-from-bottom-8";

const blankEntryForm: InsertDictionaryEntry = {
  name: "",
  code: "",
  isDrill: 0,
  difficulty: 0,
  description: "",
};

function formatSuggestionDate(value: unknown): string {
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface DictionarySectionProps {
  searchQuery: string;
  showArchived: boolean;
  isAdmin: boolean;
  /** The page header's Add button toggles this (admin only). */
  formOpen: boolean;
  onFormOpenChange: (open: boolean) => void;
}

// The shared skills & drills Dictionary tab: browse/search for everyone,
// one-tap "Add to my skills" adoption, a per-entry "suggest a correction"
// sheet, and — for the app owner only — the entry editor plus the pending
// suggestion review queue. Admin actions are ALSO enforced server-side; this
// component only decides what to render.
export function DictionarySection({ searchQuery, showArchived, isAdmin, formOpen, onFormOpenChange }: DictionarySectionProps) {
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
  } = useDictionary();
  const { data: allItems, createSkill, isCreating } = useSkills();
  const {
    data: suggestions,
    isLoading: suggestionsLoading,
    pendingCount,
    resolve,
    isResolving,
    refetch: refetchSuggestions,
  } = useDictionarySuggestions(isAdmin);

  // ---- Adoption ("Add to my skills") ----
  // A personal copy remembers which entry it came from (dictionaryEntryId),
  // so entries already in the library show "Added" instead of duplicating.
  const adoptedIds = new Set(
    (allItems ?? [])
      .filter((s) => s.dictionaryEntryId != null && s.archived !== 1)
      .map((s) => s.dictionaryEntryId as number),
  );
  const adopt = async (entry: DictionaryEntry) => {
    try {
      await createSkill({
        name: entry.name,
        code: entry.code,
        difficulty: entry.difficulty,
        isDrill: entry.isDrill,
        dictionaryEntryId: entry.id,
      });
    } catch {
      // useSkills already toasts failures
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
      // hook toasts the reason (e.g. duplicate pending) — keep the sheet open
    }
  };

  // ---- Admin: entry editor ----
  const [editingEntry, setEditingEntry] = useState<DictionaryEntry | null>(null);
  const editorForm = useForm<InsertDictionaryEntry>({
    resolver: zodResolver(insertDictionaryEntrySchema),
    defaultValues: blankEntryForm,
  });
  const editorOpen = (formOpen && isAdmin) || !!editingEntry;
  const closeEditor = () => {
    onFormOpenChange(false);
    setEditingEntry(null);
    editorForm.reset(blankEntryForm);
  };
  const startEditEntry = (entry: DictionaryEntry) => {
    onFormOpenChange(false);
    setEditingEntry(entry);
    editorForm.reset({
      name: entry.name,
      code: entry.code,
      isDrill: entry.isDrill === 1 ? 1 : 0,
      difficulty: entry.difficulty,
      description: entry.description ?? "",
    });
  };
  const onEditorSubmit = editorForm.handleSubmit(async (values) => {
    const payload = {
      ...values,
      description: values.description?.trim() ? values.description.trim() : null,
    };
    try {
      if (editingEntry) {
        await updateEntry({ id: editingEntry.id, ...payload });
      } else {
        await createEntry(payload);
      }
      closeEditor();
    } catch {
      // hook toasts failures — keep the form open
    }
  });

  // ---- Admin: review queue ----
  const [reviewOpen, setReviewOpen] = useState(false);

  // ---- Filtering ----
  const archivedView = isAdmin && showArchived; // non-admins never receive archived rows
  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = (e: DictionaryEntry) =>
    !q ||
    e.name.toLowerCase().includes(q) ||
    e.code.toLowerCase().includes(q) ||
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
            {!archivedView && (
              <p className="px-4 pt-3 text-xs text-muted-foreground">
                Curated skills &amp; drills — tap <span className="font-medium text-foreground">Add</span> to copy one into your own library.
              </p>
            )}
            <div className="overflow-x-auto p-2">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.08] hover:bg-transparent">
                    <TableHead className="eyebrow w-24">Code</TableHead>
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
                        <TableCell className="font-mono text-sm text-muted-foreground w-24 normal-case">{entry.code}</TableCell>
                        <TableCell className="font-medium text-foreground">
                          <span className="inline-flex items-center gap-2 flex-wrap">
                            <span>{entry.name}</span>
                            {kindBadge(entry.isDrill, `badge-kind-${entry.id}`)}
                          </span>
                          {(entry.altNames ?? []).length > 0 && (
                            <div className="text-[11px] text-muted-foreground/80 mt-0.5" data-testid={`text-alt-names-${entry.id}`}>
                              also called {(entry.altNames ?? []).join(", ")}
                            </div>
                          )}
                          {entry.description && (
                            <div className="text-[11px] text-muted-foreground/60 mt-0.5 line-clamp-1">{entry.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-[hsl(var(--page-accent)/0.9)] tabular-nums">
                          {entry.difficulty.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {!archivedView &&
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
                                  disabled={isCreating}
                                  onClick={() => adopt(entry)}
                                  data-testid={`button-adopt-${entry.id}`}
                                >
                                  <Plus className="h-3.5 w-3.5" /> Add
                                </Button>
                              ))}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-actions-dict-${entry.id}`}>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52 rounded-xl">
                                {!archivedView && (
                                  <DropdownMenuItem
                                    className="cursor-pointer gap-2 text-xs"
                                    onClick={() => openSuggest(entry)}
                                    data-testid={`menu-suggest-${entry.id}`}
                                  >
                                    <MessageSquarePlus className="h-3.5 w-3.5" /> Suggest a correction
                                  </DropdownMenuItem>
                                )}
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
        <DialogContent aria-describedby={undefined} className={sheetClass} style={pageAccentStyle("skills")}>
          <DialogHero icon={MessageSquarePlus} eyebrow="The Arsenal" title="Suggest a correction" />
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm flex items-center gap-2 flex-wrap">
              <span className="font-mono text-muted-foreground normal-case">{suggestTarget?.code}</span>
              <span className="font-medium">{suggestTarget?.name}</span>
              {suggestTarget && kindBadge(suggestTarget.isDrill)}
            </div>
            <p className="text-xs text-muted-foreground">
              Know this {suggestTarget?.isDrill === 1 ? "drill" : "skill"} under a different name? Send it to the
              developer — accepted names show up as "also called …".
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

      {/* Entry editor (admin only) */}
      {isAdmin && (
        <Dialog open={editorOpen} onOpenChange={(o) => { if (!o) closeEditor(); }}>
          <DialogContent aria-describedby={undefined} className={sheetClass} style={pageAccentStyle("skills")}>
            <DialogHero icon={BookOpen} eyebrow="The Arsenal" title={editingEntry ? "Edit entry" : "Add entry"} />
            <Form {...editorForm}>
              <form onSubmit={onEditorSubmit} className="space-y-3">
                <FormField control={editorForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl><Input {...field} placeholder="Barani" data-testid="input-entry-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editorForm.control} name="code" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl><Input {...field} placeholder="41/" data-testid="input-entry-code" /></FormControl>
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
                    {editingEntry ? "Update" : "Add Entry"}
                  </Button>
                  <Button type="button" variant="outline" onClick={closeEditor}>Cancel</Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

      {/* Suggestion review queue (admin only) */}
      {isAdmin && (
        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <DialogContent aria-describedby={undefined} className={sheetClass} style={pageAccentStyle("skills")}>
            <DialogHero icon={Inbox} eyebrow="The Arsenal" title="Review suggestions" />
            <div className="space-y-3">
              {suggestionsLoading ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
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
                      <span className="font-mono normal-case">{s.entryCode}</span>
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
    </div>
  );
}
