import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type NoteInput, type NoteUpdateInput } from "@shared/routes";

// Utility to parse standard error responses if needed
async function handleResponse(res: Response, fallbackError: string) {
  if (!res.ok) {
    let errorMessage = fallbackError;
    try {
      const errorData = await res.json();
      if (errorData.message) errorMessage = errorData.message;
    } catch {
      // Ignore JSON parse errors if the response isn't JSON
    }
    throw new Error(errorMessage);
  }
  return res.status === 204 ? null : res.json();
}

export function useNotes() {
  return useQuery({
    queryKey: [api.notes.list.path],
    queryFn: async () => {
      const res = await fetch(api.notes.list.path, { credentials: "include" });
      const data = await handleResponse(res, "Failed to fetch notes");
      // Optionally validate with Zod here
      return api.notes.list.responses[200].parse(data);
    },
  });
}

export function useNote(id: number) {
  return useQuery({
    queryKey: [api.notes.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.notes.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      const data = await handleResponse(res, "Failed to fetch note");
      return api.notes.get.responses[200].parse(data);
    },
    enabled: !!id,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: NoteInput) => {
      const validated = api.notes.create.input.parse(data);
      const res = await fetch(api.notes.create.path, {
        method: api.notes.create.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
        credentials: "include",
      });
      const responseData = await handleResponse(res, "Failed to create note");
      return api.notes.create.responses[201].parse(responseData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notes.list.path] });
      invalidateAllHistory(queryClient);
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Record<string, any>) => {
      const url = buildUrl(api.notes.update.path, { id });
      const res = await fetch(url, {
        method: api.notes.update.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      const responseData = await handleResponse(res, "Failed to update note");
      return responseData;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [api.notes.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.notes.get.path, variables.id] });
      invalidateAllHistory(queryClient);
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.notes.delete.path, { id });
      const res = await fetch(url, { 
        method: api.notes.delete.method, 
        credentials: "include" 
      });
      await handleResponse(res, "Failed to delete note");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notes.list.path] });
      invalidateAllHistory(queryClient);
    },
  });
}

function invalidateAllHistory(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && (key.includes("/history"));
    },
  });
}
