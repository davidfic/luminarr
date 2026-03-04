import { useState, useCallback } from "react";
import { toast } from "sonner";
import {
  useSystemStatus,
  useSystemHealth,
  useTasks,
  useRunTask,
  useSaveConfig,
} from "@/api/system";
import { useMovies } from "@/api/movies";
import { useQueue } from "@/api/queue";
import type { HealthStatus } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function healthColor(status: HealthStatus): string {
  if (status === "healthy") return "var(--color-success)";
  if (status === "degraded") return "var(--color-warning)";
  return "var(--color-danger)";
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-border-subtle)",
  borderRadius: 8,
  padding: 20,
  boxShadow: "var(--shadow-card)",
};

const sectionHeader: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  marginBottom: 16,
  marginTop: 0,
};

function Pill({ ok, labelTrue, labelFalse }: { ok: boolean; labelTrue: string; labelFalse: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 500,
        color: ok ? "var(--color-success)" : "var(--color-text-muted)",
        background: ok
          ? "color-mix(in srgb, var(--color-success) 12%, transparent)"
          : "var(--color-bg-subtle)",
      }}
    >
      {ok ? labelTrue : labelFalse}
    </span>
  );
}

function SkeletonRow({ width = "100%", height = 16 }: { width?: string | number; height?: number }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: 4, marginBottom: 8 }}
    />
  );
}

// ── Stats strip ───────────────────────────────────────────────────────────────

function StatsStrip() {
  const movies = useMovies({ per_page: 1 });
  const queue = useQueue();

  const stats: { label: string; value: string | number; loading: boolean }[] =
    [
      {
        label: "Total Movies",
        value: movies.data?.total ?? 0,
        loading: movies.isLoading,
      },
      {
        label: "Downloading",
        value: queue.data?.length ?? 0,
        loading: queue.isLoading,
      },
    ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}
    >
      {stats.map(({ label, value, loading }) => (
        <div
          key={label}
          style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: 8,
            padding: "16px 20px",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
              marginBottom: 6,
            }}
          >
            {label}
          </span>
          {loading ? (
            <div
              className="skeleton"
              style={{ height: 28, width: 60, borderRadius: 4 }}
            />
          ) : (
            <span
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                letterSpacing: "-0.02em",
                lineHeight: 1,
              }}
            >
              {value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Section 1: Status ─────────────────────────────────────────────────────────

type UpdateState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "up-to-date" }
  | { type: "available"; tag: string; url: string }
  | { type: "error"; message: string };

function StatusSection() {
  const { data, isLoading } = useSystemStatus();
  const [updateState, setUpdateState] = useState<UpdateState>({ type: "idle" });

  const checkForUpdates = useCallback(async () => {
    setUpdateState({ type: "loading" });
    try {
      const res = await fetch("https://api.github.com/repos/davidfic/luminarr/releases/latest");
      if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
      const json = (await res.json()) as { tag_name: string; html_url: string };
      const current = data?.version ?? "";
      // Compare allowing "v" prefix mismatch (e.g. tag "v0.1.0" vs version "0.1.0")
      const tagBare = json.tag_name.replace(/^v/, "");
      const currentBare = current.replace(/^v/, "");
      if (tagBare === currentBare) {
        setUpdateState({ type: "up-to-date" });
      } else {
        setUpdateState({ type: "available", tag: json.tag_name, url: json.html_url });
      }
    } catch (e) {
      setUpdateState({ type: "error", message: (e as Error).message });
    }
  }, [data?.version]);

  return (
    <div style={card}>
      <p style={sectionHeader}>Status</p>
      {isLoading ? (
        <div>
          <SkeletonRow width="60%" />
          <SkeletonRow width="40%" />
          <SkeletonRow width="50%" />
          <SkeletonRow width="45%" />
        </div>
      ) : data ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "160px 1fr",
            rowGap: 10,
            fontSize: 13,
          }}
        >
          <span style={{ color: "var(--color-text-secondary)" }}>Application</span>
          <span style={{ color: "var(--color-text-primary)" }}>
            {data.app_name} {data.version}
          </span>

          <span style={{ color: "var(--color-text-secondary)" }}>Updates</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={checkForUpdates}
              disabled={updateState.type === "loading"}
              style={{
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border-default)",
                borderRadius: 6,
                padding: "3px 10px",
                fontSize: 12,
                color: updateState.type === "loading" ? "var(--color-text-muted)" : "var(--color-text-secondary)",
                cursor: updateState.type === "loading" ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => {
                if (updateState.type !== "loading") {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color =
                  updateState.type === "loading" ? "var(--color-text-muted)" : "var(--color-text-secondary)";
              }}
            >
              {updateState.type === "loading" ? "Checking…" : "Check for updates"}
            </button>
            {updateState.type === "up-to-date" && (
              <span style={{ fontSize: 12, color: "var(--color-success)" }}>Up to date ✓</span>
            )}
            {updateState.type === "available" && (
              <a
                href={updateState.url}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: "var(--color-accent)" }}
              >
                {updateState.tag} available →
              </a>
            )}
            {updateState.type === "error" && (
              <span style={{ fontSize: 12, color: "var(--color-danger)" }}>
                {updateState.message}
              </span>
            )}
          </div>

          <span style={{ color: "var(--color-text-secondary)" }}>Go Version</span>
          <span style={{ color: "var(--color-text-primary)" }}>{data.go_version}</span>

          <span style={{ color: "var(--color-text-secondary)" }}>Build Time</span>
          <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-family-mono)", fontSize: 12 }}>
            {data.build_time}
          </span>

          <span style={{ color: "var(--color-text-secondary)" }}>Database</span>
          <span style={{ color: "var(--color-text-primary)" }}>
            {data.db_type}
            {data.db_path && (
              <span style={{ display: "block", fontSize: 11, fontFamily: "var(--font-family-mono)", color: "var(--color-text-muted)", marginTop: 2 }}>
                {data.db_path}
              </span>
            )}
          </span>

          <span style={{ color: "var(--color-text-secondary)" }}>Uptime</span>
          <span style={{ color: "var(--color-text-primary)" }}>{formatUptime(data.uptime_seconds)}</span>

          <span style={{ color: "var(--color-text-secondary)" }}>Started</span>
          <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-family-mono)", fontSize: 12 }}>
            {data.start_time}
          </span>

          <span style={{ color: "var(--color-text-secondary)" }}>AI</span>
          <Pill ok={data.ai_enabled} labelTrue="Enabled" labelFalse="Disabled" />

          <span style={{ color: "var(--color-text-secondary)" }}>TMDB</span>
          <Pill ok={data.tmdb_enabled} labelTrue="Configured" labelFalse="Not configured" />
        </div>
      ) : null}
    </div>
  );
}

// ── Section 2: Health ─────────────────────────────────────────────────────────

function HealthSection() {
  const { data, isLoading, error } = useSystemHealth();

  return (
    <div style={card}>
      <p style={sectionHeader}>Health</p>
      {isLoading ? (
        <div>
          <SkeletonRow height={32} />
          <SkeletonRow height={32} />
          <SkeletonRow height={32} />
        </div>
      ) : error ? (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
          Failed to load health data.
        </p>
      ) : data ? (
        <div>
          {/* Overall status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 16,
              fontSize: 13,
              fontWeight: 500,
              color: healthColor(data.status),
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "currentColor",
                flexShrink: 0,
              }}
            />
            {data.status === "healthy" && "All systems healthy"}
            {data.status === "degraded" && "Degraded"}
            {data.status === "unhealthy" && "Unhealthy"}
          </div>

          {/* Individual checks */}
          {data.checks.map((check, i) => (
            <div
              key={check.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                height: 40,
                borderBottom:
                  i < data.checks.length - 1
                    ? "1px solid var(--color-border-subtle)"
                    : "none",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: healthColor(check.status),
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500, minWidth: 140 }}>
                {check.name}
              </span>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                {check.message}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Section 3: Tasks ──────────────────────────────────────────────────────────

function TasksSection() {
  const { data, isLoading } = useTasks();
  const runTask = useRunTask();
  const [triggered, setTriggered] = useState<string | null>(null);

  function handleRun(name: string) {
    runTask.mutate(name, {
      onSuccess: () => {
        setTriggered(name);
        setTimeout(() => setTriggered((prev) => (prev === name ? null : prev)), 2000);
      },
    });
  }

  return (
    <div style={card}>
      <p style={sectionHeader}>Tasks</p>
      {isLoading ? (
        <div>
          <SkeletonRow height={32} />
          <SkeletonRow height={32} />
          <SkeletonRow height={32} />
        </div>
      ) : !data?.length ? (
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
          No tasks registered.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Task", "Interval", ""].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    paddingBottom: 8,
                    borderBottom: "1px solid var(--color-border-subtle)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((task, i) => {
              const isPending = runTask.isPending && runTask.variables === task.name;
              const wasTriggered = triggered === task.name;

              return (
                <tr key={task.name}>
                  <td
                    style={{
                      height: 44,
                      color: "var(--color-text-primary)",
                      fontWeight: 500,
                      borderBottom:
                        i < data.length - 1
                          ? "1px solid var(--color-border-subtle)"
                          : "none",
                      paddingRight: 16,
                    }}
                  >
                    {task.name}
                  </td>
                  <td
                    style={{
                      height: 44,
                      color: "var(--color-text-secondary)",
                      fontFamily: "var(--font-family-mono)",
                      fontSize: 12,
                      borderBottom:
                        i < data.length - 1
                          ? "1px solid var(--color-border-subtle)"
                          : "none",
                      paddingRight: 16,
                    }}
                  >
                    {task.interval}
                  </td>
                  <td
                    style={{
                      height: 44,
                      textAlign: "right",
                      borderBottom:
                        i < data.length - 1
                          ? "1px solid var(--color-border-subtle)"
                          : "none",
                    }}
                  >
                    {wasTriggered ? (
                      <span style={{ fontSize: 12, color: "var(--color-success)" }}>
                        Triggered ✓
                      </span>
                    ) : (
                      <button
                        disabled={isPending}
                        onClick={() => handleRun(task.name)}
                        style={{
                          background: "var(--color-bg-elevated)",
                          border: "1px solid var(--color-border-default)",
                          color: isPending ? "var(--color-text-muted)" : "var(--color-text-secondary)",
                          borderRadius: 6,
                          padding: "4px 12px",
                          fontSize: 12,
                          cursor: isPending ? "not-allowed" : "pointer",
                        }}
                        onMouseEnter={(e) => {
                          if (!isPending) {
                            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg-subtle)";
                            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg-elevated)";
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-secondary)";
                        }}
                      >
                        {isPending ? "Running…" : "Run Now"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Section 4: Configuration ──────────────────────────────────────────────────

function ConfigSection() {
  const { data: status } = useSystemStatus();
  const saveConfig = useSaveConfig();
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    if (!key.trim()) return;
    saveConfig.mutate(
      { tmdb_api_key: key.trim() },
      {
        onSuccess: () => {
          setSaved(true);
          setKey("");
          setTimeout(() => setSaved(false), 2000);
        },
      }
    );
  }

  return (
    <div style={card}>
      <p style={sectionHeader}>Configuration</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)", minWidth: 100 }}>
            TMDB API Key
          </span>
          {status && (
            <Pill ok={status.tmdb_enabled} labelTrue="Configured" labelFalse="Not configured" />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <input
            type={show ? "text" : "password"}
            placeholder="Enter new TMDB API key…"
            value={key}
            onChange={(e) => setKey(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-default)",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 13,
              color: "var(--color-text-primary)",
              width: 320,
              outline: "none",
              fontFamily: "var(--font-family-mono)",
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = "var(--color-accent)";
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLInputElement).style.borderColor = "var(--color-border-default)";
            }}
          />

          <button
            onClick={() => setShow((s) => !s)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              color: "var(--color-text-muted)",
              padding: "4px 6px",
            }}
          >
            {show ? "hide" : "show"}
          </button>

          <button
            disabled={!key.trim() || saveConfig.isPending}
            onClick={handleSave}
            style={{
              background: !key.trim() || saveConfig.isPending ? "var(--color-bg-subtle)" : "var(--color-accent)",
              color: !key.trim() || saveConfig.isPending ? "var(--color-text-muted)" : "var(--color-accent-fg)",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              cursor: !key.trim() || saveConfig.isPending ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (key.trim() && !saveConfig.isPending)
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent-hover)";
            }}
            onMouseLeave={(e) => {
              if (key.trim() && !saveConfig.isPending)
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent)";
            }}
          >
            {saveConfig.isPending ? "Saving…" : "Save"}
          </button>

          {saved && (
            <span style={{ fontSize: 12, color: "var(--color-success)" }}>Saved ✓</span>
          )}
        </div>

        {saveConfig.error && (
          <p style={{ fontSize: 12, color: "var(--color-danger)", margin: 0 }}>
            {saveConfig.error instanceof Error ? saveConfig.error.message : "Failed to save."}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Section 5: Backup & Restore ───────────────────────────────────────────────

function BackupSection() {
  const [downloading, setDownloading] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    try {
      const key = ((window as unknown) as Record<string, unknown>).__LUMINARR_KEY__ as string;
      const res = await fetch("/api/v1/system/backup", {
        headers: { "X-Api-Key": key },
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `luminarr-backup-${date}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  async function handleRestore(file: File) {
    setRestoreMsg(null);
    setRestoreError(null);
    try {
      const key = ((window as unknown) as Record<string, unknown>).__LUMINARR_KEY__ as string;
      const res = await fetch("/api/v1/system/restore", {
        method: "POST",
        headers: {
          "X-Api-Key": key,
          "Content-Type": "application/octet-stream",
        },
        body: file,
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setRestoreMsg("Restore staged — restart Luminarr to apply the backup.");
    } catch (e) {
      setRestoreError((e as Error).message);
    }
  }

  const btnStyle: React.CSSProperties = {
    background: "var(--color-bg-elevated)",
    border: "1px solid var(--color-border-default)",
    borderRadius: 6,
    padding: "7px 14px",
    fontSize: 13,
    color: "var(--color-text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
    flexShrink: 0,
  };

  return (
    <div style={card}>
      <p style={sectionHeader}>Backup & Restore</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Download */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <span
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-text-primary)",
                marginBottom: 4,
              }}
            >
              Download Backup
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Downloads a consistent snapshot of the database.
            </span>
          </div>
          <button
            onClick={() => { void handleDownload(); }}
            disabled={downloading}
            style={{
              ...btnStyle,
              color: downloading ? "var(--color-text-muted)" : "var(--color-text-secondary)",
              cursor: downloading ? "not-allowed" : "pointer",
            }}
          >
            {downloading ? "Preparing…" : "Download Backup"}
          </button>
        </div>

        {/* Restore */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <span
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--color-text-primary)",
                marginBottom: 4,
              }}
            >
              Restore from Backup
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Select a .db backup file. Changes take effect after restart.
            </span>
          </div>
          <label
            style={{ ...btnStyle, cursor: "pointer", display: "inline-block" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLLabelElement).style.background = "var(--color-bg-subtle)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLLabelElement).style.background = "var(--color-bg-elevated)";
            }}
          >
            Choose File
            <input
              type="file"
              accept=".db"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (file) void handleRestore(file);
                // Reset so same file can be chosen again
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        {restoreMsg && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-success)" }}>
            {restoreMsg}
          </p>
        )}
        {restoreError && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-danger)" }}>
            {restoreError}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SystemPage() {
  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--color-text-primary)",
            margin: 0,
            marginBottom: 4,
            letterSpacing: "-0.01em",
          }}
        >
          System
        </h1>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
          Runtime status, health checks, and configuration.
        </p>
      </div>

      <StatsStrip />
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <StatusSection />
        <HealthSection />
        <TasksSection />
        <ConfigSection />
        <BackupSection />
      </div>
    </div>
  );
}
