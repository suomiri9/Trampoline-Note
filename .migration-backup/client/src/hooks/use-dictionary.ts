import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type {
  DictionaryEntry,
  InsertDictionaryEntry,
  DictionarySuggestion,
  DictionarySuggestionForm,
  DictionarySuggestionWithMeta,
  DictionaryAdoptionResult,
  DictionaryImportPreview,
  DictionaryImportResult,
  Skill,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

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
  const { user } = useAuth();

  const query = useQuery<DictionaryEntry[]>({
    queryKey: [
      api.dictionary.list.path,
      user?.id ?? "anonymous",
      user?.isAdmin ? "admin" : "athlete",
    ],
    queryFn: async () => {
      const res = await apiRequest("GET", api.dictionary.list.path);
      return (await res.json()) as DictionaryEntry[];
    },
    enabled: !!user,
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

  const adoptMutation = useMutation({
    mutationFn: async (entryId: number) => {
      const res = await apiRequest(
        "POST",
        buildUrl(api.dictionary.adopt.path, { id: entryId }),
      );
      return (await res.json()) as DictionaryAdoptionResult;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<Skill[]>(
        [api.skills.list.path],
        (current) => {
          if (!current) return current;
          const found = current.some((skill) => skill.id === result.skill.id);
          return found
            ? current.map((skill) =>
                skill.id === result.skill.id ? result.skill : skill,
              )
            : [...current, result.skill];
        },
      );
      queryClient.invalidateQueries({ queryKey: [api.skills.list.path] });
      toast({
        title:
          result.status === "restored"
            ? "Restored to your library"
            : result.status === "existing"
              ? "Already in your library"
              : "Added to your library",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't add to your library",
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
    adoptEntry: adoptMutation.mutateAsync,
    adoptingEntryId: adoptMutation.isPending
      ? adoptMutation.variables
      : undefined,
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

// Owner-only preview + confirmed import of the current personal library into
// the shared dictionary. The server re-checks admin rights and performs the
// import transactionally; this hook only drives the confirmation sheet.
export function useDictionaryImport(enabled: boolean) {
  const { toast } = useToast();
  const preview = useQuery<DictionaryImportPreview>({
    queryKey: [api.dictionary.importPreview.path],
    enabled,
    staleTime: 0,
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", api.dictionary.importLibrary.path);
      return (await res.json()) as DictionaryImportResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [api.dictionary.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.skills.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.dictionary.importPreview.path] });
      toast({
        title: "Library imported",
        description: `${result.added} added, ${result.reused} already there, ${result.skipped} skipped.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't import the library",
        description: friendlyMessage(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  return {
    ...preview,
    importLibrary: importMutation.mutateAsync,
    isImporting: importMutation.isPending,
  };
}

// ---- Image management hooks (admin only) ----
// All three update/invalidate the dictionary list and toast success/failure.

export function useDictionaryImageActions() {
  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async (entryId: number) => {
      const res = await apiRequest(
        "POST",
        buildUrl(api.dictionary.generateImage.path, { id: entryId }),
      );
      return (await res.json()) as DictionaryEntry;
    },
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: [api.dictionary.list.path] });
      toast({ title: "Draft image generated" });
    },
    onError: (error: Error) => {
      toast({
        title: "Image generation failed",
        description: friendlyMessage(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (entryId: number) => {
      const res = await apiRequest(
        "POST",
        buildUrl(api.dictionary.approveImage.path, { id: entryId }),
      );
      return (await res.json()) as DictionaryEntry;
    },
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: [api.dictionary.list.path] });
      toast({ title: "Draft image approved" });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't approve image",
        description: friendlyMessage(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async ({
      entryId,
      target,
    }: {
      entryId: number;
      target: "draft" | "approved" | "all";
    }) => {
      const res = await apiRequest(
        "POST",
        buildUrl(api.dictionary.removeImage.path, { id: entryId }),
        { target },
      );
      return (await res.json()) as DictionaryEntry;
    },
    onSuccess: (entry) => {
      queryClient.invalidateQueries({ queryKey: [api.dictionary.list.path] });
      toast({ title: "Image removed" });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't remove image",
        description: friendlyMessage(error, "Please try again."),
        variant: "destructive",
      });
    },
  });

  return {
    generateImage: generateMutation.mutateAsync,
    isGenerating: generateMutation.isPending,
    generatingEntryId: generateMutation.isPending ? generateMutation.variables : undefined,
    approveImage: approveMutation.mutateAsync,
    isApproving: approveMutation.isPending,
    approvingEntryId: approveMutation.isPending ? approveMutation.variables : undefined,
    removeImage: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  };
}

/** Cache-busted URL for draft or approved image of a dictionary entry. */
export function dictionaryImageUrl(
  entryId: number,
  target: "draft" | "approved",
  cacheBust?: string | null,
): string {
  const base = `/api/dictionary/${entryId}/image/${target}`;
  return cacheBust ? `${base}?t=${cacheBust}` : base;
}
