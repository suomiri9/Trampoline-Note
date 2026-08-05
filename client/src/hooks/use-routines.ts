import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";
import { type Routine, type InsertRoutine } from "@shared/schema";
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

export function useRoutines() {
  const { toast } = useToast();

  const query = useQuery<Routine[]>({
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
          skillIds: routine.skillIds,
          archived: 0,
        }) as Routine & { id: number },
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
    mutationFn: async ({ id, ...routine }: { id: number } & Partial<InsertRoutine>) => {
      if (id < 0) {
        await updateQueuedByTempId(id, routine);
        await applyOptimisticListChange("routine", id, "PUT", routine);
        return { ...routine, id, _queuedOffline: true };
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
