import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "./client";
import type { QualityProfile, QualityProfileRequest } from "@/types";

export function useQualityProfiles() {
  return useQuery({
    queryKey: ["quality-profiles"],
    queryFn: () => apiFetch<QualityProfile[]>("/quality-profiles"),
  });
}

export function useCreateQualityProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: QualityProfileRequest) =>
      apiFetch<QualityProfile>("/quality-profiles", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quality-profiles"] });
      toast.success("Quality profile created");
    },
    onError: (err) => toast.error((err as Error).message),
  });
}

export function useUpdateQualityProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: QualityProfileRequest & { id: string }) =>
      apiFetch<QualityProfile>(`/quality-profiles/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quality-profiles"] });
      toast.success("Quality profile saved");
    },
    onError: (err) => toast.error((err as Error).message),
  });
}

export function useDeleteQualityProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/quality-profiles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quality-profiles"] });
      toast.success("Quality profile deleted");
    },
    onError: (err) => toast.error((err as Error).message),
  });
}
