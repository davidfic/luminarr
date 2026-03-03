import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "./client";
import type { Library, LibraryRequest, LibraryStats } from "@/types";

export function useLibraries() {
  return useQuery({
    queryKey: ["libraries"],
    queryFn: () => apiFetch<Library[]>("/libraries"),
  });
}

export function useCreateLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LibraryRequest) =>
      apiFetch<Library>("/libraries", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      toast.success("Library created");
    },
    onError: (err) => toast.error((err as Error).message),
  });
}

export function useUpdateLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: LibraryRequest & { id: string }) =>
      apiFetch<Library>(`/libraries/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      toast.success("Library saved");
    },
    onError: (err) => toast.error((err as Error).message),
  });
}

export function useDeleteLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/libraries/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["libraries"] });
      toast.success("Library deleted");
    },
    onError: (err) => toast.error((err as Error).message),
  });
}

export function useScanLibrary() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/libraries/${id}/scan`, { method: "POST" }),
    onError: (err) => toast.error((err as Error).message),
  });
}

export function useLibraryStats(id: string) {
  return useQuery({
    queryKey: ["libraries", id, "stats"],
    queryFn: () => apiFetch<LibraryStats>(`/libraries/${id}/stats`),
    enabled: !!id,
  });
}
