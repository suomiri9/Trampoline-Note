import { useQuery, useMutation } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";
import { type Skill, type InsertSkill } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function useSkills() {
  const { toast } = useToast();

  const query = useQuery<Skill[]>({
    queryKey: [api.skills.list.path],
  });

  const createMutation = useMutation({
    mutationFn: async (skill: InsertSkill) => {
      const res = await apiRequest("POST", api.skills.create.path, skill);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.skills.list.path] });
      toast({ title: "Skill added successfully" });
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
    onSuccess: () => {
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
