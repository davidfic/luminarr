import {
  useCollectionStats,
  useQualityStats,
  useStorageStats,
  useGrabStats,
} from "@/api/stats";
import type {
  CollectionStats,
  QualityBucket,
  StorageStats,
  GrabStats,
} from "@/api/stats";

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function pct(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 100);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div
      className="skeleton"
      style={{ borderRadius: 12, height: 220, background: "var(--color-bg-elevated)" }}
    />
  );
}

// ── Card shell ────────────────────────────────────────────────────────────────

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--color-bg-elevated)",
        borderRadius: 12,
        border: "1px solid var(--color-border-subtle)",
        padding: "20px 24px",
      }}
    >
      <h2
        style={{
          margin: "0 0 18px",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Stat block ────────────────────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div style={{ flex: 1, minWidth: 100 }}>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: accent ?? "var(--color-text-primary)",
          lineHeight: 1,
          marginBottom: 6,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 500 }}>
        {label}
      </div>
    </div>
  );
}

// ── Bar row ───────────────────────────────────────────────────────────────────

function BarRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color?: string;
}) {
  const width = pct(count, total);
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
          fontSize: 13,
        }}
      >
        <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>
          {label}
        </span>
        <span style={{ color: "var(--color-text-muted)" }}>
          {count.toLocaleString()} ({width}%)
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: "var(--color-border-subtle)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${width}%`,
            height: "100%",
            borderRadius: 3,
            background: color ?? "var(--color-accent)",
            transition: "width 400ms ease",
          }}
        />
      </div>
    </div>
  );
}

// ── Collection card ───────────────────────────────────────────────────────────

function CollectionCard({ data }: { data: CollectionStats }) {
  return (
    <Card title="Collection">
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
        <StatBlock label="Total Movies" value={data.total_movies.toLocaleString()} />
        <StatBlock label="Monitored" value={data.monitored.toLocaleString()} />
        <StatBlock label="Have File" value={data.with_file.toLocaleString()} />
        <StatBlock
          label="Missing"
          value={data.missing.toLocaleString()}
          accent={data.missing > 0 ? "var(--color-warning, #f59e0b)" : undefined}
        />
        <StatBlock
          label="Needs Upgrade"
          value={data.needs_upgrade.toLocaleString()}
          accent={
            data.needs_upgrade > 0 ? "var(--color-warning, #f59e0b)" : undefined
          }
        />
        <StatBlock
          label="Added Last 30d"
          value={data.recently_added.toLocaleString()}
          accent={
            data.recently_added > 0 ? "var(--color-success)" : undefined
          }
        />
      </div>
    </Card>
  );
}

// ── Quality card ──────────────────────────────────────────────────────────────

function aggregateBy(buckets: QualityBucket[], key: keyof QualityBucket) {
  const map: Record<string, number> = {};
  for (const b of buckets) {
    const k = b[key] as string;
    map[k] = (map[k] ?? 0) + b.count;
  }
  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

const RESOLUTION_ORDER = ["2160p", "1080p", "720p", "SD", "unknown"];
const SOURCE_ORDER = ["Remux", "Bluray", "WebDL", "WEBRip", "HDTV", "unknown"];
const CODEC_ORDER = ["AV1", "x265", "x264", "unknown"];
const HDR_ORDER = ["DolbyVision", "HDR10", "HDR10+", "HLG", "none", "unknown"];

function sortedGroup(
  buckets: QualityBucket[],
  key: keyof QualityBucket,
  order: string[]
) {
  const items = aggregateBy(buckets, key);
  return items.sort((a, b) => {
    const ai = order.indexOf(a.label);
    const bi = order.indexOf(b.label);
    if (ai === -1 && bi === -1) return b.count - a.count;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function QualityGroup({
  title,
  items,
  total,
}: {
  title: string;
  items: { label: string; count: number }[];
  total: number;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {items.map((it) => (
        <BarRow key={it.label} label={it.label} count={it.count} total={total} />
      ))}
    </div>
  );
}

function QualityCard({ data }: { data: QualityBucket[] }) {
  const total = data.reduce((s, b) => s + b.count, 0);
  if (total === 0) {
    return (
      <Card title="Quality Distribution">
        <p style={{ color: "var(--color-text-muted)", fontSize: 13, margin: 0 }}>
          No movie files yet.
        </p>
      </Card>
    );
  }

  const resolutions = sortedGroup(data, "resolution", RESOLUTION_ORDER);
  const sources = sortedGroup(data, "source", SOURCE_ORDER);
  const codecs = sortedGroup(data, "codec", CODEC_ORDER);
  const hdrs = sortedGroup(data, "hdr", HDR_ORDER);

  return (
    <Card title="Quality Distribution">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 24,
        }}
      >
        <QualityGroup title="Resolution" items={resolutions} total={total} />
        <QualityGroup title="Source" items={sources} total={total} />
        <QualityGroup title="Codec" items={codecs} total={total} />
        <QualityGroup title="HDR" items={hdrs} total={total} />
      </div>
    </Card>
  );
}

// ── Storage card ──────────────────────────────────────────────────────────────

function StorageTrendLine({ points }: { points: { bytes: number; date: string }[] }) {
  if (points.length < 2) {
    return (
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "8px 0 0" }}>
        Trend data is collecting — check back tomorrow.
      </p>
    );
  }

  const max = Math.max(...points.map((p) => p.bytes));
  const min = Math.min(...points.map((p) => p.bytes));
  const range = max - min || 1;
  const W = 400;
  const H = 60;
  const stepX = W / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = H - ((p.bytes - min) / range) * (H - 4) - 2;
    return `${x},${y}`;
  });

  const pathD = `M ${coords.join(" L ")}`;
  const areaD = `M ${coords[0]} L ${coords.join(" L ")} L ${(points.length - 1) * stepX},${H} L 0,${H} Z`;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6 }}>
        Storage over time
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: 60, display: "block" }}
        preserveAspectRatio="none"
      >
        <path d={areaD} fill="color-mix(in srgb, var(--color-accent) 15%, transparent)" />
        <path d={pathD} fill="none" stroke="var(--color-accent)" strokeWidth="2" />
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--color-text-muted)",
          marginTop: 4,
        }}
      >
        <span>{points[0].date}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

function StorageCard({ data }: { data: StorageStats }) {
  const trendPoints = (data.trend ?? []).map((p) => ({
    bytes: p.total_bytes,
    date: new Date(p.captured_at).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <Card title="Storage">
      <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 8 }}>
        <StatBlock label="Total Used" value={formatBytes(data.total_bytes)} />
        <StatBlock label="Files" value={data.file_count.toLocaleString()} />
        {data.file_count > 0 && (
          <StatBlock
            label="Avg per File"
            value={formatBytes(Math.round(data.total_bytes / data.file_count))}
          />
        )}
      </div>
      <StorageTrendLine points={trendPoints} />
    </Card>
  );
}

// ── Grabs card ────────────────────────────────────────────────────────────────

function GrabsCard({ data }: { data: GrabStats }) {
  const successPct = Math.round(data.success_rate * 100);

  return (
    <Card title="Grab Performance">
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
        <StatBlock label="Total Grabs" value={data.total_grabs.toLocaleString()} />
        <StatBlock label="Successful" value={data.successful.toLocaleString()} />
        <StatBlock
          label="Failed"
          value={data.failed.toLocaleString()}
          accent={data.failed > 0 ? "var(--color-danger, #ef4444)" : undefined}
        />
        <StatBlock
          label="Success Rate"
          value={`${successPct}%`}
          accent={
            successPct >= 90
              ? "var(--color-success)"
              : successPct >= 70
              ? "var(--color-warning, #f59e0b)"
              : "var(--color-danger, #ef4444)"
          }
        />
      </div>

      {(data.top_indexers ?? []).length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: 10,
            }}
          >
            Top Indexers
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                {["Indexer", "Grabs", "Success Rate"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === "Indexer" ? "left" : "right",
                      color: "var(--color-text-muted)",
                      fontWeight: 500,
                      paddingBottom: 8,
                      fontSize: 12,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.top_indexers.map((idx) => (
                <tr
                  key={idx.indexer_id}
                  style={{ borderTop: "1px solid var(--color-border-subtle)" }}
                >
                  <td
                    style={{
                      padding: "8px 0",
                      color: "var(--color-text-primary)",
                      fontWeight: 500,
                    }}
                  >
                    {idx.indexer_name}
                  </td>
                  <td
                    style={{
                      padding: "8px 0",
                      textAlign: "right",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {idx.grab_count.toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: "8px 0",
                      textAlign: "right",
                      color:
                        idx.success_rate >= 0.9
                          ? "var(--color-success)"
                          : idx.success_rate >= 0.7
                          ? "var(--color-warning, #f59e0b)"
                          : "var(--color-danger, #ef4444)",
                      fontWeight: 600,
                    }}
                  >
                    {Math.round(idx.success_rate * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const collection = useCollectionStats();
  const quality = useQualityStats();
  const storage = useStorageStats();
  const grabs = useGrabStats();

  return (
    <div
      style={{
        padding: "32px 32px 64px",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: "var(--color-text-primary)",
          marginBottom: 24,
        }}
      >
        Statistics
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Collection */}
        {collection.isLoading ? (
          <CardSkeleton />
        ) : collection.error ? (
          <Card title="Collection">
            <p style={{ color: "var(--color-danger, #ef4444)", margin: 0, fontSize: 13 }}>
              Failed to load collection stats.
            </p>
          </Card>
        ) : collection.data ? (
          <CollectionCard data={collection.data} />
        ) : null}

        {/* Quality + Storage side by side on wide screens */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
            gap: 20,
          }}
        >
          {quality.isLoading ? (
            <CardSkeleton />
          ) : quality.error ? (
            <Card title="Quality Distribution">
              <p style={{ color: "var(--color-danger, #ef4444)", margin: 0, fontSize: 13 }}>
                Failed to load quality data.
              </p>
            </Card>
          ) : quality.data ? (
            <QualityCard data={quality.data} />
          ) : null}

          {storage.isLoading ? (
            <CardSkeleton />
          ) : storage.error ? (
            <Card title="Storage">
              <p style={{ color: "var(--color-danger, #ef4444)", margin: 0, fontSize: 13 }}>
                Failed to load storage data.
              </p>
            </Card>
          ) : storage.data ? (
            <StorageCard data={storage.data} />
          ) : null}
        </div>

        {/* Grabs */}
        {grabs.isLoading ? (
          <CardSkeleton />
        ) : grabs.error ? (
          <Card title="Grab Performance">
            <p style={{ color: "var(--color-danger, #ef4444)", margin: 0, fontSize: 13 }}>
              Failed to load grab stats.
            </p>
          </Card>
        ) : grabs.data ? (
          <GrabsCard data={grabs.data} />
        ) : null}
      </div>
    </div>
  );
}
