import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";
import { type Skill, type InsertSkill } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { tryNetworkOrEnqueueWithOptimistic } from "@/lib/offline-queue";

export function useSkills() {
  const { toast } = useToast();

  const query = useQuery<Skill[]>({
    queryKey: [api.skills.list.path],
  });

  const createMutation = useMutation({
    mutationFn: async (skill: InsertSkill) => {
      return await tryNetworkOrEnqueueWithOptimistic<Skill>(
        "skill",
        skill,
        (tempId) => ({
          id: tempId,
          userId: skill.userId ?? null,
          name: skill.name,
          code: skill.code,
          difficulty: skill.difficulty,
          isDrill: skill.isDrill ?? 0,
          skillIds: skill.skillIds ?? null,
          sortOrder: skill.sortOrder ?? null,
          archived: 0,
        }) as Skill & { id: number },
        async (signal) => {
          const res = await fetch(api.skills.create.path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(skill),
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
        queryClient.invalidateQueries({ queryKey: [api.skills.list.path] });
      }
      const label =
        result?.isDrill === 2 ? "Connection" : result?.isDrill === 1 ? "Drill" : "Skill";
      toast({
        title: queued ? `${label} saved offline` : `${label} added successfully`,
        ...(queued
          ? { description: "It'll sync when you reconnect." }
          : {}),
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add skill",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", buildUrl(api.skills.delete.path, { id }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.skills.list.path] });
      toast({ title: "Skill deleted successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...skill }: { id: number } & Partial<InsertSkill>) => {
      const res = await apiRequest("PUT", buildUrl(api.skills.update.path, { id }), skill);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.skills.list.path] });
      toast({ title: "Skill updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update skill",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      await apiRequest("PATCH", "/api/skills/reorder", { orderedIds });
    },
    onMutate: async (orderedIds: number[]) => {
      await queryClient.cancelQueries({ queryKey: [api.skills.list.path] });
      const previous = queryClient.getQueryData<Skill[]>([api.skills.list.path]);
      if (previous) {
        const updated = previous.map(skill => {
          const idx = orderedIds.indexOf(skill.id);
          return idx !== -1 ? { ...skill, sortOrder: idx } : skill;
        });
        queryClient.setQueryData([api.skills.list.path], updated);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData([api.skills.list.path], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [api.skills.list.path] });
    },
  });

  return {
    ...query,
    createSkill: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteSkill: deleteMutation.mutateAsync,
    updateSkill: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    reorderSkills: reorderMutation.mutateAsync,
  };
}
