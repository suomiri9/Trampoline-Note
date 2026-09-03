import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImageIcon, RefreshCw, CheckCircle, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@workspace/rebound/components/ui/button';
import { Badge } from '@workspace/rebound/components/ui/badge';
import { Separator } from '@workspace/rebound/components/ui/separator';
import { toast } from '@workspace/rebound/hooks/use-toast';
import {
  useGenerateDictionaryImage,
  useApproveDictionaryImage,
  useRemoveDictionaryImage,
  getListDictionaryEntriesQueryKey,
  DictionaryImageRemoveInputTarget,
} from '@workspace/api-client-react';
import type { DictionaryEntry } from '@workspace/api-client-react';
import { format } from 'date-fns';

interface ImagePanelProps {
  entry: DictionaryEntry;
}

export function ImagePanel({ entry }: ImagePanelProps) {
  const queryClient = useQueryClient();
  const [draftImgError, setDraftImgError] = useState(false);
  const [approvedImgError, setApprovedImgError] = useState(false);

  const generateImage = useGenerateDictionaryImage({
    mutation: {
      onSuccess: (updated) => {
        queryClient.setQueryData(
          getListDictionaryEntriesQueryKey(),
          (old: DictionaryEntry[] | undefined) =>
            old ? old.map((e) => (e.id === updated.id ? updated : e)) : old,
        );
        setDraftImgError(false);
        toast({ title: 'Image generated', description: `Draft image created for "${updated.name}".` });
      },
      onError: (err: unknown) => {
        const msg = err && typeof err === 'object' && 'message' in err ? (err as { message: string }).message : 'Generation failed';
        toast({ title: 'Generation failed', description: msg, variant: 'destructive' });
      },
    },
  });

  const approveImage = useApproveDictionaryImage({
    mutation: {
      onSuccess: (updated) => {
        queryClient.setQueryData(
          getListDictionaryEntriesQueryKey(),
          (old: DictionaryEntry[] | undefined) =>
            old ? old.map((e) => (e.id === updated.id ? updated : e)) : old,
        );
        setApprovedImgError(false);
        toast({ title: 'Image approved', description: `Draft image approved for "${updated.name}".` });
      },
      onError: () => {
        toast({ title: 'Approval failed', variant: 'destructive' });
      },
    },
  });

  const removeImage = useRemoveDictionaryImage({
    mutation: {
      onSuccess: (updated) => {
        queryClient.setQueryData(
          getListDictionaryEntriesQueryKey(),
          (old: DictionaryEntry[] | undefined) =>
            old ? old.map((e) => (e.id === updated.id ? updated : e)) : old,
        );
        setDraftImgError(false);
        setApprovedImgError(false);
        toast({ title: 'Image removed' });
      },
      onError: () => {
        toast({ title: 'Remove failed', variant: 'destructive' });
      },
    },
  });

  const isGenerating = generateImage.isPending;
  const isApproving = approveImage.isPending;
  const isRemoving = removeImage.isPending;
  const anyPending = isGenerating || isApproving || isRemoving;

  const hasDraft = !!entry.draftImageKey;
  const hasApproved = !!entry.approvedImageKey;

  const draftImageUrl = `/api/dictionary/${entry.id}/image/draft`;
  const approvedImageUrl = `/api/dictionary/${entry.id}/image/approved`;

  return (
    <div className="space-y-4">
      {/* Approved image */}
      {hasApproved && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-xs">Approved</Badge>
              {entry.approvedImageApprovedAt && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(entry.approvedImageApprovedAt), 'MMM d, yyyy')}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-7 px-2 text-xs"
              disabled={anyPending}
              onClick={() =>
                removeImage.mutate({ id: entry.id, data: { target: DictionaryImageRemoveInputTarget.approved } })
              }
              data-testid={`button-remove-approved-${entry.id}`}
            >
              <Trash2 className="size-3 mr-1" />
              Remove
            </Button>
          </div>
          {!approvedImgError ? (
            <div className="rounded-lg overflow-hidden border border-border/60 bg-muted/20">
              <img
                src={approvedImageUrl}
                alt={`Approved image for ${entry.name}`}
                className="w-full object-contain max-h-48"
                onError={() => setApprovedImgError(true)}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-muted/20 flex items-center justify-center h-24">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="size-5 mx-auto mb-1" />
                <p className="text-xs">Image unavailable</p>
              </div>
            </div>
          )}
          {entry.approvedImagePrompt && (
            <p className="text-xs text-muted-foreground line-clamp-2">{entry.approvedImagePrompt}</p>
          )}
        </div>
      )}

      {hasApproved && hasDraft && <Separator />}

      {/* Draft image */}
      {hasDraft && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">Draft</Badge>
              {entry.draftImageCreatedAt && (
                <span className="text-xs text-muted-foreground">
                  {format(new Date(entry.draftImageCreatedAt), 'MMM d, yyyy')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-7 px-2 text-xs"
                disabled={anyPending}
                onClick={() =>
                  removeImage.mutate({ id: entry.id, data: { target: DictionaryImageRemoveInputTarget.draft } })
                }
                data-testid={`button-remove-draft-${entry.id}`}
              >
                <Trash2 className="size-3 mr-1" />
                Remove
              </Button>
            </div>
          </div>
          {!draftImgError ? (
            <div className="rounded-lg overflow-hidden border border-border/60 bg-muted/20">
              <img
                src={draftImageUrl}
                alt={`Draft image for ${entry.name}`}
                className="w-full object-contain max-h-48"
                onError={() => setDraftImgError(true)}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-muted/20 flex items-center justify-center h-24">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="size-5 mx-auto mb-1" />
                <p className="text-xs">Image unavailable</p>
              </div>
            </div>
          )}
          {entry.draftImagePrompt && (
            <p className="text-xs text-muted-foreground line-clamp-2">{entry.draftImagePrompt}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={anyPending}
              onClick={() => generateImage.mutate({ id: entry.id })}
              data-testid={`button-regenerate-${entry.id}`}
            >
              {isGenerating ? (
                <Loader2 className="size-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="size-3 mr-1" />
              )}
              Regenerate
            </Button>
            <Button
              size="sm"
              disabled={anyPending}
              onClick={() => approveImage.mutate({ id: entry.id })}
              data-testid={`button-approve-image-${entry.id}`}
            >
              {isApproving ? (
                <Loader2 className="size-3 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="size-3 mr-1" />
              )}
              Approve
            </Button>
          </div>
        </div>
      )}

      {/* No images yet */}
      {!hasDraft && !hasApproved && (
        <div className="flex flex-col items-center gap-3 py-4 text-center text-muted-foreground">
          <ImageIcon className="size-8 opacity-30" />
          <p className="text-sm">No image generated yet</p>
          <Button
            size="sm"
            variant="outline"
            disabled={isGenerating}
            onClick={() => generateImage.mutate({ id: entry.id })}
            data-testid={`button-generate-${entry.id}`}
          >
            {isGenerating ? (
              <Loader2 className="size-3 mr-1 animate-spin" />
            ) : (
              <ImageIcon className="size-3 mr-1" />
            )}
            {isGenerating ? 'Generating...' : 'Generate Image'}
          </Button>
          {generateImage.isError && (
            <p className="text-xs text-destructive">Generation failed. Try again.</p>
          )}
        </div>
      )}

      {/* Has draft but no approved — show generate action at bottom */}
      {!hasDraft && hasApproved && (
        <Button
          size="sm"
          variant="outline"
          disabled={isGenerating}
          onClick={() => generateImage.mutate({ id: entry.id })}
          data-testid={`button-generate-new-draft-${entry.id}`}
        >
          {isGenerating ? (
            <Loader2 className="size-3 mr-1 animate-spin" />
          ) : (
            <ImageIcon className="size-3 mr-1" />
          )}
          {isGenerating ? 'Generating...' : 'Generate New Draft'}
        </Button>
      )}
    </div>
  );
}
