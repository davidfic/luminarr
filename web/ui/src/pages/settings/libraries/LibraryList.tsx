import { useState } from "react";
import {
  useLibraries,
  useCreateLibrary,
  useUpdateLibrary,
  useDeleteLibrary,
  useScanLibrary,
} from "@/api/libraries";
import { useQualityProfiles } from "@/api/quality-profiles";
import type { Library, LibraryRequest } from "@/types";

// ── Shared styles ─────────────────────────────────────────────────────────────

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

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  root_path: string;
  default_quality_profile_id: string;
  min_free_space_gb: string; // string for controlled input, parsed on submit
}

function emptyForm(): FormState {
  return { name: "", root_path: "", default_quality_profile_id: "", min_free_space_gb: "0" };
}

function libraryToForm(lib: Library): FormState {
  return {
    name: lib.name,
    root_path: lib.root_path,
    default_quality_profile_id: lib.default_quality_profile_id ?? "",
    min_free_space_gb: String(lib.min_free_space_gb),
  };
}

function formToRequest(f: FormState): LibraryRequest {
  return {
    name: f.name.trim(),
    root_path: f.root_path.trim(),
    default_quality_profile_id: f.default_quality_profile_id || undefined,
    min_free_space_gb: parseInt(f.min_free_space_gb, 10) || 0,
  };
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  editing: Library | null; // null = creating new
  onClose: () => void;
}

function LibraryModal({ editing, onClose }: ModalProps) {
  const [form, setForm] = useState<FormState>(
    editing ? libraryToForm(editing) : emptyForm()
  );
  const [error, setError] = useState<string | null>(null);

  const { data: profiles } = useQualityProfiles();
  const createLib = useCreateLibrary();
  const updateLib = useUpdateLibrary();

  const isPending = createLib.isPending || updateLib.isPending;

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  function handleSubmit() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.root_path.trim()) { setError("Root path is required."); return; }

    const body = formToRequest(form);

    if (editing) {
      updateLib.mutate({ id: editing.id, ...body }, { onSuccess: onClose, onError: (e) => setError(e.message) });
    } else {
      createLib.mutate(body, { onSuccess: onClose, onError: (e) => setError(e.message) });
    }
  }

  function onInputFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = "var(--color-accent)";
  }
  function onInputBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border-default)";
  }

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
          width: 520,
          maxWidth: "calc(100vw - 48px)",
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
            {editing ? "Edit Library" : "Add Library"}
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
          <div style={fieldStyle}>
            <label style={labelStyle}>Name *</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => set("name", e.currentTarget.value)}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              placeholder="e.g. Movies"
              autoFocus
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Root Path *</label>
            <input
              style={{ ...inputStyle, fontFamily: "var(--font-family-mono)", fontSize: 12 }}
              value={form.root_path}
              onChange={(e) => set("root_path", e.currentTarget.value)}
              onFocus={onInputFocus}
              onBlur={onInputBlur}
              placeholder="/data/movies"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Quality Profile</label>
              <select
                style={{ ...inputStyle, cursor: "pointer" }}
                value={form.default_quality_profile_id}
                onChange={(e) => set("default_quality_profile_id", e.currentTarget.value)}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
              >
                <option value="">None</option>
                {profiles?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Min Free Space (GB)</label>
              <input
                style={inputStyle}
                type="number"
                min="0"
                value={form.min_free_space_gb}
                onChange={(e) => set("min_free_space_gb", e.currentTarget.value)}
                onFocus={onInputFocus}
                onBlur={onInputBlur}
              />
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
            {isPending ? "Saving…" : editing ? "Save Changes" : "Add Library"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Row actions ───────────────────────────────────────────────────────────────

interface RowActionsProps {
  library: Library;
  onEdit: () => void;
}

function RowActions({ library, onEdit }: RowActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const [scanned, setScanned] = useState(false);
  const deleteLib = useDeleteLibrary();
  const scanLib = useScanLibrary();

  function handleScan() {
    scanLib.mutate(library.id, {
      onSuccess: () => {
        setScanned(true);
        setTimeout(() => setScanned(false), 2000);
      },
    });
  }

  if (confirming) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Delete?</span>
        <button
          onClick={() => deleteLib.mutate(library.id, { onSuccess: () => setConfirming(false) })}
          disabled={deleteLib.isPending}
          style={actionBtn("var(--color-danger)", "color-mix(in srgb, var(--color-danger) 15%, transparent)")}
        >
          {deleteLib.isPending ? "…" : "Yes"}
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

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      {scanned ? (
        <span style={{ fontSize: 12, color: "var(--color-success)" }}>Scanning ✓</span>
      ) : (
        <button
          onClick={handleScan}
          disabled={scanLib.isPending}
          style={actionBtn("var(--color-text-secondary)", "var(--color-bg-elevated)")}
        >
          {scanLib.isPending ? "…" : "Scan"}
        </button>
      )}
      <button
        onClick={onEdit}
        style={actionBtn("var(--color-text-secondary)", "var(--color-bg-elevated)")}
      >
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

function actionBtn(color: string, bg: string): React.CSSProperties {
  return {
    background: bg,
    border: "1px solid var(--color-border-default)",
    borderRadius: 5,
    padding: "3px 10px",
    fontSize: 12,
    color,
    cursor: "pointer",
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LibraryList() {
  const { data, isLoading, error } = useLibraries();
  const { data: profiles } = useQualityProfiles();
  const [modal, setModal] = useState<{ open: boolean; editing: Library | null }>({
    open: false,
    editing: null,
  });

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.name]));

  function openCreate() { setModal({ open: true, editing: null }); }
  function openEdit(lib: Library) { setModal({ open: true, editing: lib }); }
  function closeModal() { setModal({ open: false, editing: null }); }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
            Libraries
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
            Media root folders scanned for movie files.
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
          + Add Library
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
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 44, borderRadius: 4 }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ padding: 24, fontSize: 13, color: "var(--color-text-muted)" }}>
            Failed to load libraries.
          </div>
        ) : !data?.length ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500 }}>
              No libraries configured
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-text-muted)" }}>
              Add a library to start tracking movies.
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                {["Name", "Root Path", "Quality Profile", "Min Free Space", ""].map((h) => (
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
              {data.map((lib, i) => (
                <tr
                  key={lib.id}
                  style={{
                    borderBottom: i < data.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                  }}
                >
                  <td style={{ padding: "0 16px", height: 52, color: "var(--color-text-primary)", fontWeight: 500 }}>
                    {lib.name}
                  </td>
                  <td style={{ padding: "0 16px", height: 52, maxWidth: 260 }}>
                    <span
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: "var(--font-family-mono)",
                        fontSize: 12,
                        color: "var(--color-text-secondary)",
                      }}
                      title={lib.root_path}
                    >
                      {lib.root_path}
                    </span>
                  </td>
                  <td style={{ padding: "0 16px", height: 52, color: "var(--color-text-secondary)" }}>
                    {lib.default_quality_profile_id
                      ? (profileMap[lib.default_quality_profile_id] ?? "—")
                      : <span style={{ color: "var(--color-text-muted)" }}>None</span>}
                  </td>
                  <td style={{ padding: "0 16px", height: 52, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                    {lib.min_free_space_gb > 0 ? `${lib.min_free_space_gb} GB` : <span style={{ color: "var(--color-text-muted)" }}>None</span>}
                  </td>
                  <td style={{ padding: "0 16px", height: 52, width: 1 }}>
                    <RowActions library={lib} onEdit={() => openEdit(lib)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal.open && (
        <LibraryModal editing={modal.editing} onClose={closeModal} />
      )}
    </div>
  );
}
