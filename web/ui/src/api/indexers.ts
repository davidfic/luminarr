import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "./client";
import type { IndexerConfig, IndexerRequest, TestResult } from "@/types";

export function useIndexers() {
  return useQuery({
    queryKey: ["indexers"],
    queryFn: () => apiFetch<IndexerConfig[]>("/indexers"),
  });
}

export function useCreateIndexer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IndexerRequest) =>
      apiFetch<IndexerConfig>("/indexers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indexers"] });
      toast.success("Indexer saved");
    },
    onError: (err) => toast.error((err as Error).message),
  });
}

export function useUpdateIndexer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: IndexerRequest & { id: string }) =>
      apiFetch<IndexerConfig>(`/indexers/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indexers"] });
      toast.success("Indexer saved");
    },
    onError: (err) => toast.error((err as Error).message),
  });
}

export function useDeleteIndexer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/indexers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indexers"] });
      toast.success("Indexer deleted");
    },
    onError: (err) => toast.error((err as Error).message),
  });
}

export function useTestIndexer() {
  return useMutation({
    mutationFn: (id: string) => apiFetch<TestResult>(`/indexers/${id}/test`, { method: "POST" }),
    onError: (err) => toast.error((err as Error).message),
  });
}
