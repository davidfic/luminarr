import { useState } from "react";
import {
  useDownloadClients,
  useCreateDownloadClient,
  useUpdateDownloadClient,
  useDeleteDownloadClient,
  useTestDownloadClient,
} from "@/api/downloaders";
import type { DownloadClientConfig, DownloadClientRequest, TestResult } from "@/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function strSetting(settings: Record<string, unknown>, key: string): string {
  const v = settings[key];
  return typeof v === "string" ? v : "";
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--color-bg-elevated)",
  border: "1px solid var(--color-border-default)",
  borderRadius: 6,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--color-text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-secondary)",
  marginBottom: 6,
};

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
};

function actionBtn(color: string, bg: string): React.CSSProperties {
  return {
    background: bg,
    border: "1px solid var(--color-border-default)",
    borderRadius: 5,
    padding: "3px 10px",
    fontSize: 12,
    color,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  kind: string;
  enabled: boolean;
  priority: string;
  // qbittorrent
  qb_url: string;
  qb_username: string;
  qb_password: string;
  qb_category: string;
  qb_save_path: string;
  // deluge
  dl_url: string;
  dl_password: string;
  dl_label: string;
  dl_save_path: string;
}

function emptyForm(): FormState {
  return {
    name: "", kind: "qbittorrent", enabled: true, priority: "1",
    qb_url: "", qb_username: "", qb_password: "", qb_category: "", qb_save_path: "",
    dl_url: "", dl_password: "", dl_label: "", dl_save_path: "",
  };
}

function clientToForm(cfg: DownloadClientConfig): FormState {
  const s = cfg.settings;
  return {
    name: cfg.name,
    kind: cfg.kind,
    enabled: cfg.enabled,
    priority: String(cfg.priority),
    qb_url: cfg.kind === "qbittorrent" ? strSetting(s, "url") : "",
    qb_username: cfg.kind === "qbittorrent" ? strSetting(s, "username") : "",
    qb_password: "",  // never pre-fill; server preserves existing password when omitted
    qb_category: cfg.kind === "qbittorrent" ? strSetting(s, "category") : "",
    qb_save_path: cfg.kind === "qbittorrent" ? strSetting(s, "save_path") : "",
    dl_url: cfg.kind === "deluge" ? strSetting(s, "url") : "",
    dl_password: "",  // never pre-fill; server preserves existing password when omitted
    dl_label: cfg.kind === "deluge" ? strSetting(s, "label") : "",
    dl_save_path: cfg.kind === "deluge" ? strSetting(s, "save_path") : "",
  };
}

function formToRequest(f: FormState): DownloadClientRequest {
  let settings: Record<string, unknown>;

  if (f.kind === "qbittorrent") {
    settings = { url: f.qb_url.trim(), username: f.qb_username.trim() };
    if (f.qb_password.trim()) settings.password = f.qb_password.trim();
    if (f.qb_category.trim()) settings.category = f.qb_category.trim();
    if (f.qb_save_path.trim()) settings.save_path = f.qb_save_path.trim();
  } else {
    settings = { url: f.dl_url.trim() };
    if (f.dl_password.trim()) settings.password = f.dl_password.trim();
    if (f.dl_label.trim()) settings.label = f.dl_label.trim();
    if (f.dl_save_path.trim()) settings.save_path = f.dl_save_path.trim();
  }

  return {
    name: f.name.trim(),
    kind: f.kind,
    enabled: f.enabled,
    priority: parseInt(f.priority, 10) || 1,
    settings,
  };
}

// ── Modal ──────────────────────────────────────────────────────────────────────

interface ModalProps {
  editing: DownloadClientConfig | null;
  onClose: () => void;
}

function DownloadClientModal({ editing, onClose }: ModalProps) {
  const [form, setForm] = useState<FormState>(
    editing ? clientToForm(editing) : emptyForm()
  );
  const [error, setError] = useState<string | null>(null);

  const create = useCreateDownloadClient();
  const update = useUpdateDownloadClient();
  const isPending = create.isPending || update.isPending;

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  function handleSubmit() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    const url = form.kind === "qbittorrent" ? form.qb_url : form.dl_url;
    if (!url.trim()) { setError("URL is required."); return; }

    const body = formToRequest(form);

    if (editing) {
      update.mutate(
        { id: editing.id, ...body },
        { onSuccess: onClose, onError: (e) => setError(e.message) }
      );
    } else {
      create.mutate(body, { onSuccess: onClose, onError: (e) => setError(e.message) });
    }
  }

  function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = "var(--color-accent)";
  }
  function blurBorder(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border-default)";
  }

  const sensitiveHint = editing ? (
    <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>
      Password is masked. Enter a new value to update, leave blank to clear.
    </p>
  ) : null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: 12,
          padding: 24,
          width: 540,
          maxWidth: "calc(100vw - 48px)",
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
          boxShadow: "var(--shadow-modal)",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
            {editing ? "Edit Download Client" : "Add Download Client"}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-muted)",
              fontSize: 18,
              lineHeight: 1,
              padding: "4px 6px",
              borderRadius: 4,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)"; }}
          >
            ✕
          </button>
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Name *</label>
              <input
                style={inputStyle}
                value={form.name}
                onChange={(e) => set("name", e.currentTarget.value)}
                onFocus={focusBorder}
                onBlur={blurBorder}
                placeholder="e.g. qBittorrent Local"
                autoFocus
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Client</label>
              <select
                style={{ ...inputStyle, cursor: "pointer" }}
                value={form.kind}
                onChange={(e) => set("kind", e.currentTarget.value)}
                onFocus={focusBorder}
                onBlur={blurBorder}
              >
                <option value="qbittorrent">qBittorrent</option>
                <option value="deluge">Deluge</option>
              </select>
            </div>
          </div>

          {/* Settings section */}
          <div
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: 8,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <p style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
              {form.kind === "qbittorrent" ? "qBittorrent Settings" : "Deluge Settings"}
            </p>

            {form.kind === "qbittorrent" ? (
              <>
                <div style={fieldStyle}>
                  <label style={labelStyle}>URL *</label>
                  <input
                    style={inputStyle}
                    value={form.qb_url}
                    onChange={(e) => set("qb_url", e.currentTarget.value)}
                    onFocus={focusBorder}
                    onBlur={blurBorder}
                    placeholder="http://localhost:8080"
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Username</label>
                    <input
                      style={inputStyle}
                      value={form.qb_username}
                      onChange={(e) => set("qb_username", e.currentTarget.value)}
                      onFocus={focusBorder}
                      onBlur={blurBorder}
                      placeholder="admin"
                      autoComplete="off"
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Password</label>
                    <input
                      style={inputStyle}
                      type="password"
                      value={form.qb_password}
                      onChange={(e) => set("qb_password", e.currentTarget.value)}
                      onFocus={focusBorder}
                      onBlur={blurBorder}
                      placeholder={editing ? "enter to change" : ""}
                      autoComplete="new-password"
                    />
                    {sensitiveHint}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Category</label>
                    <input
                      style={inputStyle}
                      value={form.qb_category}
                      onChange={(e) => set("qb_category", e.currentTarget.value)}
                      onFocus={focusBorder}
                      onBlur={blurBorder}
                      placeholder="luminarr"
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Save Path</label>
                    <input
                      style={{ ...inputStyle, fontFamily: "var(--font-family-mono)", fontSize: 12 }}
                      value={form.qb_save_path}
                      onChange={(e) => set("qb_save_path", e.currentTarget.value)}
                      onFocus={focusBorder}
                      onBlur={blurBorder}
                      placeholder="/downloads/movies"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={fieldStyle}>
                  <label style={labelStyle}>URL *</label>
                  <input
                    style={inputStyle}
                    value={form.dl_url}
                    onChange={(e) => set("dl_url", e.currentTarget.value)}
                    onFocus={focusBorder}
                    onBlur={blurBorder}
                    placeholder="http://localhost:8112"
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Password</label>
                  <input
                    style={inputStyle}
                    type="password"
                    value={form.dl_password}
                    onChange={(e) => set("dl_password", e.currentTarget.value)}
                    onFocus={focusBorder}
                    onBlur={blurBorder}
                    placeholder={editing ? "enter to change" : "deluge (default)"}
                    autoComplete="new-password"
                  />
                  {sensitiveHint}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Label</label>
                    <input
                      style={inputStyle}
                      value={form.dl_label}
                      onChange={(e) => set("dl_label", e.currentTarget.value)}
                      onFocus={focusBorder}
                      onBlur={blurBorder}
                      placeholder="luminarr"
                    />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Save Path</label>
                    <input
                      style={{ ...inputStyle, fontFamily: "var(--font-family-mono)", fontSize: 12 }}
                      value={form.dl_save_path}
                      onChange={(e) => set("dl_save_path", e.currentTarget.value)}
                      onFocus={focusBorder}
                      onBlur={blurBorder}
                      placeholder="/downloads/movies"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Priority + enabled */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Priority</label>
              <input
                style={inputStyle}
                type="number"
                min="1"
                value={form.priority}
                onChange={(e) => set("priority", e.currentTarget.value)}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: 2 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => set("enabled", e.currentTarget.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--color-accent)" }}
                />
                <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>Enabled</span>
              </label>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-danger)" }}>{error}</p>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "1px solid var(--color-border-default)",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 13,
              color: "var(--color-text-secondary)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bg-elevated)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            style={{
              background: isPending ? "var(--color-bg-subtle)" : "var(--color-accent)",
              color: isPending ? "var(--color-text-muted)" : "var(--color-accent-fg)",
              border: "none",
              borderRadius: 6,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 500,
              cursor: isPending ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!isPending) (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent-hover)";
            }}
            onMouseLeave={(e) => {
              if (!isPending) (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent)";
            }}
          >
            {isPending ? "Saving…" : editing ? "Save Changes" : "Add Client"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Row actions ────────────────────────────────────────────────────────────────

interface RowActionsProps {
  client: DownloadClientConfig;
  onEdit: () => void;
}

function RowActions({ client, onEdit }: RowActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);

  const del = useDeleteDownloadClient();
  const test = useTestDownloadClient();

  function handleTest() {
    setTestResult(null);
    test.mutate(client.id, {
      onSuccess: (r: TestResult) => {
        setTestResult(r);
        setTimeout(() => setTestResult(null), 4000);
      },
      onError: (e) => {
        setTestResult({ ok: false, message: e.message });
        setTimeout(() => setTestResult(null), 4000);
      },
    });
  }

  if (confirming) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Delete?</span>
        <button
          onClick={() => del.mutate(client.id, { onSuccess: () => setConfirming(false) })}
          disabled={del.isPending}
          style={actionBtn("var(--color-danger)", "color-mix(in srgb, var(--color-danger) 15%, transparent)")}
        >
          {del.isPending ? "…" : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          style={actionBtn("var(--color-text-secondary)", "var(--color-bg-elevated)")}
        >
          No
        </button>
      </div>
    );
  }

  if (testResult !== null) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
        <span
          style={{
            fontSize: 12,
            color: testResult.ok ? "var(--color-success)" : "var(--color-danger)",
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={testResult.message}
        >
          {testResult.ok ? "Connected ✓" : `Failed: ${testResult.message ?? "unknown error"}`}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <button
        onClick={handleTest}
        disabled={test.isPending}
        style={actionBtn("var(--color-text-secondary)", "var(--color-bg-elevated)")}
      >
        {test.isPending ? "Testing…" : "Test"}
      </button>
      <button onClick={onEdit} style={actionBtn("var(--color-text-secondary)", "var(--color-bg-elevated)")}>
        Edit
      </button>
      <button
        onClick={() => setConfirming(true)}
        style={actionBtn("var(--color-danger)", "color-mix(in srgb, var(--color-danger) 12%, transparent)")}
      >
        Delete
      </button>
    </div>
  );
}

// ── Badge ──────────────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: string }) {
  const labels: Record<string, string> = { qbittorrent: "qBittorrent", deluge: "Deluge" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
        color: "var(--color-accent)",
      }}
    >
      {labels[kind] ?? kind}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DownloadClientList() {
  const { data, isLoading, error } = useDownloadClients();
  const [modal, setModal] = useState<{ open: boolean; editing: DownloadClientConfig | null }>({
    open: false,
    editing: null,
  });

  function openCreate() { setModal({ open: true, editing: null }); }
  function openEdit(cfg: DownloadClientConfig) { setModal({ open: true, editing: cfg }); }
  function closeModal() { setModal({ open: false, editing: null }); }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
            Download Clients
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
            Torrent and Usenet clients used to download releases.
          </p>
        </div>
        <button
          onClick={openCreate}
          style={{
            background: "var(--color-accent)",
            color: "var(--color-accent-fg)",
            border: "none",
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-accent)"; }}
        >
          + Add Client
        </button>
      </div>

      {/* Table card */}
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: 8,
          boxShadow: "var(--shadow-card)",
          overflow: "hidden",
        }}
      >
        {isLoading ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 44, borderRadius: 4 }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ padding: 24, fontSize: 13, color: "var(--color-text-muted)" }}>
            Failed to load download clients.
          </div>
        ) : !data?.length ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500 }}>
              No download clients configured
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
              Add qBittorrent or Deluge to start downloading.
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                {["Name", "Client", "Priority", "Status", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "10px 16px",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--color-text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((cfg, i) => (
                <tr
                  key={cfg.id}
                  style={{
                    borderBottom: i < data.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                  }}
                >
                  <td style={{ padding: "0 16px", height: 52, color: "var(--color-text-primary)", fontWeight: 500 }}>
                    {cfg.name}
                  </td>
                  <td style={{ padding: "0 16px", height: 52 }}>
                    <KindBadge kind={cfg.kind} />
                  </td>
                  <td style={{ padding: "0 16px", height: 52, color: "var(--color-text-secondary)" }}>
                    {cfg.priority}
                  </td>
                  <td style={{ padding: "0 16px", height: 52 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        color: cfg.enabled ? "var(--color-success)" : "var(--color-text-muted)",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: cfg.enabled ? "var(--color-success)" : "var(--color-text-muted)",
                          flexShrink: 0,
                        }}
                      />
                      {cfg.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td style={{ padding: "0 16px", height: 52, width: 1 }}>
                    <RowActions client={cfg} onEdit={() => openEdit(cfg)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal.open && (
        <DownloadClientModal editing={modal.editing} onClose={closeModal} />
      )}
    </div>
  );
}
