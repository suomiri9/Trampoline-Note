import { RefreshCw, Upload } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@workspace/rebound/components/ui/badge';
import { Button } from '@workspace/rebound/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/rebound/components/ui/dialog';
import { Skeleton } from '@workspace/rebound/components/ui/skeleton';
import { toast } from '@workspace/rebound/hooks/use-toast';
import {
  getGetDictionaryImportPreviewQueryKey,
  getListDictionaryEntriesQueryKey,
  useGetDictionaryImportPreview,
  useImportDictionaryLibrary,
} from '@workspace/api-client-react';

interface ImportLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportLibraryDialog({ open, onOpenChange }: ImportLibraryDialogProps) {
  const queryClient = useQueryClient();
  const preview = useGetDictionaryImportPreview({
    query: {
      queryKey: getGetDictionaryImportPreviewQueryKey(),
      enabled: open,
      staleTime: 0,
    },
  });
  const importLibrary = useImportDictionaryLibrary({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListDictionaryEntriesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDictionaryImportPreviewQueryKey() });
        toast({
          title: 'Library imported',
          description: `${result.added} added, ${result.reused} reused, ${result.skipped} skipped.`,
        });
        onOpenChange(false);
      },
      onError: () => {
        toast({
          title: "Couldn't import the library",
          description: 'No changes were applied. Please try again.',
          variant: 'destructive',
        });
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-4 text-primary" />
            Import my library
          </DialogTitle>
          <DialogDescription>
            Preview and copy your active skills and drills into the shared dictionary.
            Existing matches are reused, and no import runs until you confirm.
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
            <Skeleton className="h-32" />
          </div>
        ) : preview.isError || !preview.data ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Couldn't check your library.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void preview.refetch()}
              data-testid="button-retry-import-preview"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                ['to add', preview.data.counts.toAdd],
                ['already there', preview.data.counts.reused],
                ['skipped', preview.data.counts.skipped],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-border/60 bg-muted/20 p-3 text-center">
                  <div className="text-lg font-bold tabular-nums text-foreground">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/40">
              {preview.data.candidates.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No eligible skills or drills found.
                </p>
              ) : (
                preview.data.candidates.map((candidate) => (
                  <div key={candidate.skillId} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                      {candidate.shortName}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {candidate.name}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {candidate.status === 'new' ? 'New' : 'Existing'}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              importLibrary.isPending ||
              !preview.data ||
              preview.data.candidates.length === 0
            }
            onClick={() => importLibrary.mutate()}
            data-testid="button-confirm-import-library"
          >
            {importLibrary.isPending ? 'Importing…' : 'Import library'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}