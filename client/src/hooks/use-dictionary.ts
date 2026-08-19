import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type {
  DictionaryEntry,
  InsertDictionaryEntry,
  DictionarySuggestion,
  DictionarySuggestionForm,
  DictionarySuggestionWithMeta,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// apiRequest throws `${status}: ${body}` where body is usually a JSON
// {message} blob — surface the friendly message, not raw JSON.
function friendlyMessage(error: Error, fallback: string): string {
  const raw = error.message.replace(/^\d+:\s*/, "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.message === "string") return parsed.message;
  } catch {
    // not JSON — fall through to the raw text
  }
  return raw || fallback;
}

// Shared skills & drills dictionary (curated by the app owner). Browsing and
// suggesting are for every signed-in user; entry create/update is admin-only
// and additionally enforced server-side.
export function useDictionary() {
  const { toast } = useToast();

  const query = useQuery<DictionaryEntry[]>({
    queryKey: [api.dictionary.list.path],
  });

  const createEntryMutation = useMutation({
    mutationFn: async (entry: InsertDictionaryEntry) => {
      const res = await apiRequest("POST", api.dictionary.create.path, entry);
      return (await res.json()) as DictionaryEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.dictionary.list.path] });
      toast({ title: "Entry added to the dictionary" });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't add entry",
        description: friendlyMessage(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const updateEntryMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<InsertDictionaryEntry>) => {
      const res = await apiRequest("PUT", buildUrl(api.dictionary.update.path, { id }), updates);
      return (await res.json()) as DictionaryEntry;
    },
    onSuccess: (_entry, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.dictionary.list.path] });
      const keys = Object.keys(variables).filter((k) => k !== "id");
      const archiveOnly = keys.length === 1 && keys[0] === "archived";
      toast({
        title: archiveOnly
          ? variables.archived === 1 ? "Entry archived" : "Entry restored"
          : "Entry updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't update entry",
        description: friendlyMessage(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const suggestMutation = useMutation({
    mutationFn: async ({ entryId, ...form }: { entryId: number } & DictionarySuggestionForm) => {
      const res = await apiRequest("POST", buildUrl(api.dictionary.suggest.path, { id: entryId }), form);
      return (await res.json()) as DictionarySuggestion;
    },
    onSuccess: () => {
      toast({
        title: "Suggestion sent",
        description: "The developer will review it — thanks!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't send suggestion",
        description: friendlyMessage(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  return {
    ...query,
    createEntry: createEntryMutation.mutateAsync,
    isCreatingEntry: createEntryMutation.isPending,
    updateEntry: updateEntryMutation.mutateAsync,
    isUpdatingEntry: updateEntryMutation.isPending,
    suggest: suggestMutation.mutateAsync,
    isSuggesting: suggestMutation.isPending,
  };
}

// The owner's pending review queue. `enabled` MUST be gated on isAdmin —
// non-admins get a 403 from this endpoint.
export function useDictionarySuggestions(enabled: boolean) {
  const { toast } = useToast();

  const query = useQuery<DictionarySuggestionWithMeta[]>({
    queryKey: [api.dictionary.suggestions.path],
    enabled,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "accept" | "reject" }) => {
      const res = await apiRequest("POST", buildUrl(api.dictionary.resolveSuggestion.path, { id }), { action });
      return (await res.json()) as { suggestion: DictionarySuggestion; entry: DictionaryEntry | null };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.dictionary.suggestions.path] });
      queryClient.invalidateQueries({ queryKey: [api.dictionary.list.path] });
      if (variables.action === "accept") {
        toast({
          title: "Suggestion accepted",
          description: `"${result.suggestion.suggestedName}" now shows as an also-called name.`,
        });
      } else {
        toast({ title: "Suggestion rejected" });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't resolve suggestion",
        description: friendlyMessage(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  return {
    ...query,
    pendingCount: query.data?.length ?? 0,
    resolve: resolveMutation.mutateAsync,
    isResolving: resolveMutation.isPending,
  };
}
