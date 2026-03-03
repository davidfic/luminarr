import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { RadarrPreviewResult, RadarrImportOptions, RadarrImportResult } from "@/types";

export function useRadarrPreview() {
  return useMutation({
    mutationFn: (req: { url: string; api_key: string }) =>
      apiFetch<RadarrPreviewResult>("/import/radarr/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      }),
  });
}

export function useRadarrImport() {
  return useMutation({
    mutationFn: (req: { url: string; api_key: string; options: RadarrImportOptions }) =>
      apiFetch<RadarrImportResult>("/import/radarr/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      }),
  });
}
