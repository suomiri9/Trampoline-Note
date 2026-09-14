import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";
import { type Routine, type InsertRoutine, type RoutineWithVersions, type RoutineVersionSnapshot } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  tryNetworkOrEnqueueWithOptimistic,
  tryNetworkOrEnqueueChange,
  isQueuedOfflineResult,
  applyOptimisticListChange,
  deleteQueuedByTempId,
  updateQueuedByTempId,
} from "@/lib/offline-queue";
import { trackEvent } from "@/lib/analytics";

export function useRoutines() {
  const { toast } = useToast();

  const query = useQuery<RoutineWithVersions[]>({
    queryKey: [api.routines.list.path],
  });

  const createMutation = useMutation({
    mutationFn: async (routine: InsertRoutine) => {
      return await tryNetworkOrEnqueueWithOptimistic<Routine>(
        "routine",
        routine,
        (tempId) => ({
          id: tempId,
          userId: routine.userId ?? null,
          name: routine.name,
          code: routine.code ?? null,
          category: routine.category ?? null,
          skillIds: routine.skillIds,
          archived: 0,
          versions: [],
        }) as unknown as Routine & { id: number },
        async (signal) => {
          const res = await fetch(api.routines.create.path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(routine),
            credentials: "include",
            signal,
          });
          if (!res.ok) throw new Error(`${res.status}: ${(await res.text()) || res.statusText}`);
          return res.json();
        },
      );
    },
    onSuccess: (result: any) => {
      const queued = result && (result as any)._queuedOffline === true;
      if (!queued) {
        queryClient.invalidateQueries({ queryKey: [api.routines.list.path] });
        trackEvent("routine_created");
      }
      toast({
        title: queued ? "Routine saved offline" : "Routine created successfully",
        ...(queued
          ? { description: "It'll sync when you reconnect." }
          : {}),
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create routine",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      if (id < 0) {
        await deleteQueuedByTempId(id);
        await applyOptimisticListChange("routine", id, "DELETE");
        return { _queuedOffline: true } as const;
      }
      return await tryNetworkOrEnqueueChange("routine", id, "DELETE", null, async (signal) => {
        await apiRequest("DELETE", buildUrl(api.routines.delete.path, { id }), undefined, { signal });
        return null;
      });
    },
    onSuccess: (result) => {
      const queued = isQueuedOfflineResult(result) || (result as any)?._queuedOffline === true;
      if (!queued) {
        queryClient.invalidateQueries({ queryKey: [api.routines.list.path] });
        toast({ title: "Routine deleted successfully" });
      } else {
        toast({ title: "Deleted offline", description: "Will sync when reconnected." });
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...routine
    }: { id: number } & Partial<InsertRoutine> & {
      // "Change from this day" lineup edit: applyFromDay tells the server to
      // snapshot the old lineup for dates before that day; `versions` is the
      // client-precomputed result of the same change so the offline mirror
      // stays correct while the edit is queued (during a lineup change the
      // server recomputes and ignores it). When the lineup is NOT changing,
      // `versions` is applied verbatim (normalized) — the explicit
      // version-management path (correct a change day / delete a version).
      applyFromDay?: string;
      versions?: RoutineVersionSnapshot[];
    }) => {
      if (id < 0) {
        // Never-synced routine: it has no server history to version, so drop
        // the applyFromDay marker AND the precomputed versions before merging
        // into the queued create — otherwise the local mirror would show a
        // lineup split that will never exist on the server.
        const { applyFromDay: _drop, versions: _dropVersions, ...optimistic } = routine;
        await updateQueuedByTempId(id, optimistic);
        await applyOptimisticListChange("routine", id, "PUT", optimistic);
        return { ...optimistic, id, _queuedOffline: true };
      }
      return await tryNetworkOrEnqueueChange("routine", id, "PUT", routine, async (signal) => {
        const res = await apiRequest("PUT", buildUrl(api.routines.update.path, { id }), routine, { signal });
        return res.json();
      });
    },
    onSuccess: (result) => {
      const queued = isQueuedOfflineResult(result) || (result as any)?._queuedOffline === true;
      if (queued) {
        toast({ title: "Saved offline", description: "Will sync when reconnected." });
        return;
      }
      queryClient.invalidateQueries({ queryKey: [api.routines.list.path] });
      // A rename cascades to auto-named routine parts (skills with isDrill 3),
      // so refresh the skills cache too.
      queryClient.invalidateQueries({ queryKey: [api.skills.list.path] });
      toast({ title: "Routine updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update routine",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    ...query,
    createRoutine: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteRoutine: deleteMutation.mutateAsync,
    updateRoutine: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
