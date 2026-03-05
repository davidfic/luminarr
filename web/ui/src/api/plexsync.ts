import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "./client";
import type {
  PlexSection,
  PlexSyncPreviewResult,
  PlexSyncImportOptions,
  PlexSyncImportResult,
} from "@/types";

export function usePlexSections() {
  return useMutation({
    mutationFn: (mediaServerID: string) =>
      apiFetch<PlexSection[]>(`/media-servers/${mediaServerID}/sections`),
    onError: (err) => toast.error((err as Error).message),
  });
}

export function usePlexSyncPreview() {
  return useMutation({
    mutationFn: ({ id, sectionKey }: { id: string; sectionKey: string }) =>
      apiFetch<PlexSyncPreviewResult>(
        `/media-servers/${id}/sync/preview`,
        { method: "POST", body: JSON.stringify({ section_key: sectionKey }) },
      ),
    onError: (err) => toast.error((err as Error).message),
  });
}

export function usePlexSyncImport() {
  return useMutation({
    mutationFn: ({ id, ...opts }: PlexSyncImportOptions & { id: string }) =>
      apiFetch<PlexSyncImportResult>(
        `/media-servers/${id}/sync/import`,
        { method: "POST", body: JSON.stringify(opts) },
      ),
    onError: (err) => toast.error((err as Error).message),
  });
}
