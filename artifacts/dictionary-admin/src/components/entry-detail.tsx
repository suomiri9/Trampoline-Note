import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Edit2, Archive, ArchiveRestore, X } from 'lucide-react';
import { Button } from '@workspace/rebound/components/ui/button';
import { Badge } from '@workspace/rebound/components/ui/badge';
import { Separator } from '@workspace/rebound/components/ui/separator';
import { toast } from '@workspace/rebound/hooks/use-toast';
import {
  useUpdateDictionaryEntry,
  getListDictionaryEntriesQueryKey,
} from '@workspace/api-client-react';
import type { DictionaryEntry } from '@workspace/api-client-react';
import { EntryForm } from '@/components/entry-form';
import { combineNumericShape, type EntryFormValues } from '@/components/entry-form';
import { ImagePanel } from '@/components/image-panel';

interface EntryDetailProps {
  entry: DictionaryEntry;
  onClose: () => void;
}

export function EntryDetail({ entry, onClose }: EntryDetailProps) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const updateEntry = useUpdateDictionaryEntry({
    mutation: {
      onSuccess: (updated) => {
        queryClient.setQueryData(
          getListDictionaryEntriesQueryKey(),
          (old: DictionaryEntry[] | undefined) =>
            old ? old.map((e) => (e.id === updated.id ? updated : e)) : old,
        );
        toast({ title: 'Entry updated', description: `"${updated.name}" saved.` });
        setEditOpen(false);
      },
      onError: () => {
        toast({ title: 'Update failed', variant: 'destructive' });
      },
    },
  });

  function handleEditSubmit(values: EntryFormValues) {
    updateEntry.mutate({
      id: entry.id,
      data: {
        name: values.name,
        shortName: values.shortName,
        numeric: combineNumericShape(values.numeric, values.numericShape),
        isDrill: Number(values.isDrill) as 0 | 1,
        difficulty: Number(values.difficulty),
        description: values.description ?? null,
        archived: Number(values.archived) as 0 | 1,
        sortOrder: values.sortOrder ?? null,
      },
    });
  }

  function handleToggleArchive() {
    const newArchived = entry.archived === 1 ? 0 : 1;
    updateEntry.mutate({
      id: entry.id,
      data: {
        name: entry.name,
        shortName: entry.shortName,
        numeric: entry.numeric ?? null,
        isDrill: entry.isDrill,
        difficulty: entry.difficulty,
        description: entry.description ?? null,
        archived: newArchived as 0 | 1,
        sortOrder: entry.sortOrder ?? null,
      },
    });
  }

  const isUpdating = updateEntry.isPending;

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-4 border-b border-border/60">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="font-semibold text-foreground truncate" data-testid={`entry-name-${entry.id}`}>
                {entry.name}
              </h2>
              <Badge variant="outline" className="text-xs shrink-0">{entry.shortName}</Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={entry.isDrill === 1 ? 'secondary' : 'default'} className="text-xs">
                {entry.isDrill === 1 ? 'Drill' : 'Skill'}
              </Badge>
              {entry.archived === 1 && (
                <Badge variant="destructive" className="text-xs">Archived</Badge>
              )}
              <span className="text-xs text-muted-foreground">Difficulty: {entry.difficulty}</span>
              {entry.numeric && (
                <span className="text-xs text-muted-foreground font-mono">#{entry.numeric}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditOpen(true)}
              disabled={isUpdating}
              data-testid={`button-edit-entry-${entry.id}`}
              title="Edit entry"
            >
              <Edit2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleToggleArchive}
              disabled={isUpdating}
              data-testid={`button-archive-entry-${entry.id}`}
              title={entry.archived === 1 ? 'Restore entry' : 'Archive entry'}
            >
              {entry.archived === 1 ? (
                <ArchiveRestore className="size-4" />
              ) : (
                <Archive className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid="button-close-detail"
              title="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {entry.description && (
            <div>
              <p className="text-xs text-muted-foreground micro-label mb-1">Description</p>
              <p className="text-sm text-foreground">{entry.description}</p>
            </div>
          )}

          {entry.altNames && entry.altNames.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground micro-label mb-1">Alternate Names</p>
              <div className="flex flex-wrap gap-1">
                {entry.altNames.map((name) => (
                  <Badge key={name} variant="outline" className="text-xs font-normal">{name}</Badge>
                ))}
              </div>
            </div>
          )}

          {entry.sortOrder != null && (
            <div>
              <p className="text-xs text-muted-foreground micro-label mb-1">Sort Order</p>
              <p className="text-sm font-mono">{entry.sortOrder}</p>
            </div>
          )}

          <Separator />

          <div>
            <p className="text-xs text-muted-foreground micro-label mb-3">Images</p>
            <ImagePanel entry={entry} />
          </div>
        </div>
      </div>

      <EntryForm
        open={editOpen}
        onOpenChange={setEditOpen}
        entry={entry}
        onSubmit={handleEditSubmit}
        isPending={isUpdating}
      />
    </>
  );
}
