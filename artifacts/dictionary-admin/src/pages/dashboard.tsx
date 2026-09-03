import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  BookOpen,
  MessageSquare,
  LogOut,
  ChevronRight,
  Filter,
  Upload,
} from 'lucide-react';
import { Button } from '@workspace/rebound/components/ui/button';
import { Input } from '@workspace/rebound/components/ui/input';
import { Badge } from '@workspace/rebound/components/ui/badge';
import { Skeleton } from '@workspace/rebound/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@workspace/rebound/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/rebound/components/ui/select';
import { Separator } from '@workspace/rebound/components/ui/separator';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@workspace/rebound/components/ui/empty';
import { cn } from '@workspace/rebound/lib/utils';
import { toast } from '@workspace/rebound/hooks/use-toast';
import {
  useListDictionaryEntries,
  useCreateDictionaryEntry,
  useListDictionarySuggestions,
  getListDictionaryEntriesQueryKey,
} from '@workspace/api-client-react';
import type { DictionaryEntry } from '@workspace/api-client-react';
import type { AuthUser } from '@/hooks/use-auth';
import { EntryForm } from '@/components/entry-form';
import type { EntryFormValues } from '@/components/entry-form';
import { EntryDetail } from '@/components/entry-detail';
import { SuggestionsPanel } from '@/components/suggestions-panel';
import { ImportLibraryDialog } from '@/components/import-library-dialog';

interface DashboardProps {
  user: AuthUser;
  onLogout: () => void;
}

function EntrySkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
      <Skeleton className="size-8 rounded-md shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  isSelected,
  onClick,
}: {
  entry: DictionaryEntry;
  isSelected: boolean;
  onClick: () => void;
}) {
  const hasDraft = !!entry.draftImageKey;
  const hasApproved = !!entry.approvedImageKey;

  return (
    <button
      type="button"
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 border-b border-border/40 text-left transition-colors pressable',
        isSelected
          ? 'bg-primary/5 border-l-2 border-l-primary'
          : 'hover:bg-muted/40 border-l-2 border-l-transparent',
      )}
      onClick={onClick}
      data-testid={`row-entry-${entry.id}`}
    >
      <div
        className={cn(
          'size-8 rounded-md shrink-0 flex items-center justify-center text-xs font-mono font-bold',
          entry.isDrill === 1
            ? 'bg-secondary text-secondary-foreground'
            : 'bg-primary/10 text-primary',
        )}
      >
        {entry.shortName.slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-foreground truncate">{entry.name}</span>
          {entry.archived === 1 && (
            <Badge variant="destructive" className="text-xs shrink-0 py-0">Archived</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{entry.isDrill === 1 ? 'Drill' : 'Skill'}</span>
          <span>·</span>
          <span>DD {entry.difficulty}</span>
          {hasDraft && !hasApproved && (
            <>
              <span>·</span>
              <span className="text-amber-500">Draft image</span>
            </>
          )}
          {hasApproved && (
            <>
              <span>·</span>
              <span className="text-green-500">Image approved</span>
            </>
          )}
        </div>
      </div>
      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </button>
  );
}

export default function Dashboard({ user, onLogout }: DashboardProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'skill' | 'drill'>('all');
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [imageFilter, setImageFilter] = useState<'all' | 'no-image' | 'draft' | 'approved'>('all');
  const [selectedEntry, setSelectedEntry] = useState<DictionaryEntry | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = useState('entries');

  const {
    data: entries,
    isLoading,
    isError,
    refetch,
  } = useListDictionaryEntries();

  const { data: suggestions } = useListDictionarySuggestions();
  const pendingSuggestionsCount = useMemo(
    () => (suggestions ?? []).filter((s) => s.status === 'pending').length,
    [suggestions],
  );

  const createEntry = useCreateDictionaryEntry({
    mutation: {
      onSuccess: (created) => {
        queryClient.invalidateQueries({ queryKey: getListDictionaryEntriesQueryKey() });
        toast({ title: 'Entry created', description: `"${created.name}" added to the dictionary.` });
        setCreateOpen(false);
        setSelectedEntry(created);
      },
      onError: () => {
        toast({ title: 'Creation failed', variant: 'destructive' });
      },
    },
  });

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    let list = entries;

    if (archiveFilter === 'active') {
      list = list.filter((e) => e.archived === 0);
    } else if (archiveFilter === 'archived') {
      list = list.filter((e) => e.archived === 1);
    }

    if (typeFilter === 'skill') {
      list = list.filter((e) => e.isDrill === 0);
    } else if (typeFilter === 'drill') {
      list = list.filter((e) => e.isDrill === 1);
    }

    if (imageFilter === 'no-image') {
      list = list.filter((e) => !e.draftImageKey && !e.approvedImageKey);
    } else if (imageFilter === 'draft') {
      list = list.filter((e) => !!e.draftImageKey && !e.approvedImageKey);
    } else if (imageFilter === 'approved') {
      list = list.filter((e) => !!e.approvedImageKey);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.shortName.toLowerCase().includes(q) ||
          (e.numeric ?? '').includes(q) ||
          (e.altNames ?? []).some((a) => a.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [entries, search, typeFilter, archiveFilter, imageFilter]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    onLogout();
  }

  function handleCreateSubmit(values: EntryFormValues) {
    createEntry.mutate({
      data: {
        name: values.name,
        shortName: values.shortName,
        numeric: values.numeric ?? null,
        isDrill: Number(values.isDrill) as 0 | 1,
        difficulty: Number(values.difficulty),
        description: values.description ?? null,
        archived: Number(values.archived) as 0 | 1,
        sortOrder: values.sortOrder ?? null,
      },
    });
  }

  const hasFilters =
    typeFilter !== 'all' || archiveFilter !== 'active' || imageFilter !== 'all' || search.trim() !== '';

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 h-14">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <BookOpen className="size-5 text-primary shrink-0" />
            <span className="font-semibold text-foreground text-sm">Dictionary Admin</span>
            <span className="text-muted-foreground text-xs hidden sm:inline">
              — {user.displayName ?? user.email}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
            data-testid="button-import-library"
          >
            <Upload className="size-4" />
            <span className="hidden sm:inline">Import library</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            data-testid="button-logout"
            className="text-muted-foreground"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left panel: entries list */}
        <div
          className={cn(
            'flex flex-col border-r border-border/60',
            selectedEntry ? 'hidden md:flex md:w-80 lg:w-96' : 'flex-1',
          )}
        >
          <Tabs value={tab} onValueChange={setTab} className="flex flex-col flex-1 min-h-0">
            <div className="px-4 pt-4 pb-0">
              <TabsList className="w-full">
                <TabsTrigger value="entries" className="flex-1 gap-2" data-testid="tab-entries">
                  <BookOpen className="size-3.5" />
                  Entries
                  {entries && (
                    <Badge variant="secondary" className="text-xs ml-1">
                      {entries.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="suggestions" className="flex-1 gap-2" data-testid="tab-suggestions">
                  <MessageSquare className="size-3.5" />
                  Suggestions
                  {pendingSuggestionsCount > 0 && (
                    <Badge className="text-xs ml-1">{pendingSuggestionsCount}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="entries" className="flex flex-col flex-1 min-h-0 mt-0">
              {/* Search & filters */}
              <div className="p-4 space-y-3 border-b border-border/40">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Search entries..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8"
                      data-testid="input-search"
                    />
                  </div>
                  <Button
                    onClick={() => setCreateOpen(true)}
                    size="icon"
                    data-testid="button-create-entry"
                    title="New entry"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
                    <SelectTrigger className="h-7 text-xs w-auto min-w-[90px]" data-testid="select-type-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="skill">Skills</SelectItem>
                      <SelectItem value="drill">Drills</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={archiveFilter} onValueChange={(v) => setArchiveFilter(v as typeof archiveFilter)}>
                    <SelectTrigger className="h-7 text-xs w-auto min-w-[90px]" data-testid="select-archive-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                      <SelectItem value="all">All statuses</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={imageFilter} onValueChange={(v) => setImageFilter(v as typeof imageFilter)}>
                    <SelectTrigger className="h-7 text-xs w-auto min-w-[90px]" data-testid="select-image-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any image</SelectItem>
                      <SelectItem value="no-image">No image</SelectItem>
                      <SelectItem value="draft">Draft only</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                    </SelectContent>
                  </Select>

                  {hasFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => {
                        setSearch('');
                        setTypeFilter('all');
                        setArchiveFilter('active');
                        setImageFilter('all');
                      }}
                      data-testid="button-clear-filters"
                    >
                      Clear
                    </Button>
                  )}
                </div>

                {filteredEntries.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {filteredEntries.length} of {entries?.length ?? 0} entries
                  </p>
                )}
              </div>

              {/* Entry list */}
              <div className="flex-1 overflow-y-auto">
                {isLoading && (
                  <>
                    <EntrySkeleton />
                    <EntrySkeleton />
                    <EntrySkeleton />
                    <EntrySkeleton />
                    <EntrySkeleton />
                  </>
                )}

                {isError && (
                  <div className="p-4 text-center">
                    <p className="text-sm text-destructive mb-2">Failed to load entries</p>
                    <Button size="sm" variant="outline" onClick={() => refetch()}>
                      Retry
                    </Button>
                  </div>
                )}

                {!isLoading && !isError && filteredEntries.length === 0 && (
                  <Empty className="border-none py-8">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <BookOpen />
                      </EmptyMedia>
                      <EmptyTitle>No entries found</EmptyTitle>
                      <EmptyDescription>
                        {hasFilters
                          ? 'Try clearing filters or a different search term.'
                          : 'Add the first entry to get started.'}
                      </EmptyDescription>
                    </EmptyHeader>
                    {!hasFilters && (
                      <EmptyContent>
                        <Button onClick={() => setCreateOpen(true)} size="sm" data-testid="button-create-first-entry">
                          <Plus className="size-4" />
                          New Entry
                        </Button>
                      </EmptyContent>
                    )}
                  </Empty>
                )}

                {!isLoading &&
                  !isError &&
                  filteredEntries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      isSelected={selectedEntry?.id === entry.id}
                      onClick={() =>
                        setSelectedEntry(selectedEntry?.id === entry.id ? null : entry)
                      }
                    />
                  ))}
              </div>
            </TabsContent>

            <TabsContent value="suggestions" className="flex-1 overflow-y-auto mt-0 p-4">
              <SuggestionsPanel />
            </TabsContent>
          </Tabs>
        </div>

        {/* Right panel: entry detail */}
        {selectedEntry && (
          <div className="flex-1 min-w-0 flex flex-col">
            <EntryDetail
              entry={
                // Keep detail in sync with latest data from cache
                (entries ?? []).find((e) => e.id === selectedEntry.id) ?? selectedEntry
              }
              onClose={() => setSelectedEntry(null)}
            />
          </div>
        )}

        {/* Right panel placeholder when nothing selected */}
        {!selectedEntry && (
          <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
            <div className="text-center space-y-2">
              <BookOpen className="size-10 mx-auto opacity-20" />
              <p className="text-sm">Select an entry to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Create entry dialog */}
      <EntryForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        entry={null}
        onSubmit={handleCreateSubmit}
        isPending={createEntry.isPending}
      />
      <ImportLibraryDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
