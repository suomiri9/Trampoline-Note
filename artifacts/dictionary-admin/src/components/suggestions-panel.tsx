import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@workspace/rebound/components/ui/button';
import { Badge } from '@workspace/rebound/components/ui/badge';
import { Card } from '@workspace/rebound/components/ui/card';
import { Skeleton } from '@workspace/rebound/components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@workspace/rebound/components/ui/empty';
import { toast } from '@workspace/rebound/hooks/use-toast';
import {
  useListDictionarySuggestions,
  useResolveDictionarySuggestion,
  getListDictionarySuggestionsQueryKey,
  getListDictionaryEntriesQueryKey,
  DictionarySuggestionResolutionAction,
} from '@workspace/api-client-react';
import type { DictionarySuggestion } from '@workspace/api-client-react';
import { formatDistanceToNow } from 'date-fns';

function SuggestionCard({ suggestion }: { suggestion: DictionarySuggestion }) {
  const queryClient = useQueryClient();

  const resolve = useResolveDictionarySuggestion({
    mutation: {
      onSuccess: (result, variables) => {
        queryClient.invalidateQueries({ queryKey: getListDictionarySuggestionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListDictionaryEntriesQueryKey() });
        const action = variables.data.action;
        toast({
          title: action === 'accept' ? 'Suggestion accepted' : 'Suggestion rejected',
          description: `"${suggestion.suggestedName}" for ${suggestion.entryName}`,
        });
      },
      onError: () => {
        toast({ title: 'Resolution failed', variant: 'destructive' });
      },
    },
  });

  const isPending = resolve.isPending;

  return (
    <Card
      className="panel-hairline p-4 space-y-3"
      data-testid={`card-suggestion-${suggestion.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-medium text-foreground">{suggestion.suggestedName}</span>
            <Badge variant="outline" className="text-xs shrink-0">for {suggestion.entryName}</Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            {suggestion.submitterName && (
              <span>by {suggestion.submitterName}</span>
            )}
            <span>
              {formatDistanceToNow(new Date(suggestion.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>

      {suggestion.note && (
        <p className="text-sm text-muted-foreground border-l-2 border-border/60 pl-3">
          {suggestion.note}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            resolve.mutate({
              id: suggestion.id,
              data: { action: DictionarySuggestionResolutionAction.accept },
            })
          }
          data-testid={`button-accept-suggestion-${suggestion.id}`}
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <CheckCircle className="size-3" />
          )}
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            resolve.mutate({
              id: suggestion.id,
              data: { action: DictionarySuggestionResolutionAction.reject },
            })
          }
          data-testid={`button-reject-suggestion-${suggestion.id}`}
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <XCircle className="size-3" />
          )}
          Reject
        </Button>
      </div>
    </Card>
  );
}

function SuggestionSkeleton() {
  return (
    <div className="space-y-2 p-4 rounded-xl border border-border/60">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export function SuggestionsPanel() {
  const { data: suggestions, isLoading, isError, refetch } = useListDictionarySuggestions();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <SuggestionSkeleton />
        <SuggestionSkeleton />
        <SuggestionSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-center">
        <p className="text-sm text-destructive mb-2">Failed to load suggestions</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const pending = (suggestions ?? []).filter((s) => s.status === 'pending');

  if (pending.length === 0) {
    return (
      <Empty className="border-none py-8">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquare />
          </EmptyMedia>
          <EmptyTitle>No pending suggestions</EmptyTitle>
          <EmptyDescription>
            All submitted name suggestions have been reviewed.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {pending.map((suggestion) => (
        <SuggestionCard key={suggestion.id} suggestion={suggestion} />
      ))}
    </div>
  );
}
