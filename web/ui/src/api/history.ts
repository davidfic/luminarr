import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./client";
import type { GrabHistory } from "@/types";

interface HistoryFilters {
  limit?: number;
  download_status?: string;
  protocol?: string;
}

export function useHistory(filters: HistoryFilters = {}) {
  const { limit = 100, download_status, protocol } = filters;
  const params = new URLSearchParams({ limit: String(limit) });
  if (download_status) params.set("download_status", download_status);
  if (protocol) params.set("protocol", protocol);

  return useQuery({
    queryKey: ["history", filters],
    queryFn: () => apiFetch<GrabHistory[]>(`/history?${params}`),
    staleTime: 30_000,
  });
}
