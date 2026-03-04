import { useRef, useState } from "react";

// ── Scale ──────────────────────────────────────────────────────────────────────
// Logarithmic mapping between slider position [0, 1] and MB/min value [0, 800].
// Position 0 always means "0" (no minimum / use the zero sentinel).
// Max thumb at position ≥ 0.99 maps to stored value 0 (= "no limit").

const SLIDER_MAX = 800;

function valueToPosition(value: number): number {
  if (value <= 0) return 0;
  if (value >= SLIDER_MAX) return 0.99;
  return Math.log(value + 1) / Math.log(SLIDER_MAX + 1);
}

function positionToValue(position: number, isMax: boolean): number {
  if (isMax && position >= 0.99) return 0; // no-limit sentinel
  if (position <= 0) return 0;
  const raw = Math.exp(position * Math.log(SLIDER_MAX + 1)) - 1;
  // Round to sensible precision based on magnitude
  if (raw < 10) return Math.round(raw * 10) / 10;
  if (raw < 100) return Math.round(raw);
  return Math.round(raw / 5) * 5;
}

function formatValue(value: number, isMax: boolean): string {
  if (isMax && value === 0) return "∞";
  if (value === 0) return "0";
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface RangeSliderProps {
  /** Stored min_size value (MB/min). 0 = no minimum. */
  minValue: number;
  /** Stored max_size value (MB/min). 0 = no limit. */
  maxValue: number;
  onChange: (min: number, max: number) => void;
}

const THUMB_SIZE = 14; // px diameter
const TRACK_HEIGHT = 4; // px

export function RangeSlider({ minValue, maxValue, onChange }: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);
  const [hoveredThumb, setHoveredThumb] = useState<"min" | "max" | null>(null);

  // Convert stored values → positions, treating maxValue=0 as "far right"
  const minPos = valueToPosition(minValue);
  const maxPos = maxValue === 0 ? 1.0 : valueToPosition(maxValue);

  function posFromEvent(e: React.PointerEvent): number {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  function handleTrackClick(e: React.MouseEvent) {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    // Move the nearest thumb
    const distToMin = Math.abs(pos - minPos);
    const distToMax = Math.abs(pos - maxPos);
    if (distToMin <= distToMax) {
      const newMin = positionToValue(Math.min(pos, maxPos), false);
      onChange(newMin, maxValue);
    } else {
      const newMax = positionToValue(Math.max(pos, minPos), true);
      onChange(minValue, newMax);
    }
  }

  function handleMinPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging("min");
  }

  function handleMaxPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging("max");
  }

  function handlePointerMove(e: React.PointerEvent, which: "min" | "max") {
    if (dragging !== which) return;
    const pos = posFromEvent(e);
    if (which === "min") {
      const clampedPos = Math.min(pos, maxPos - 0.01);
      onChange(positionToValue(clampedPos, false), maxValue);
    } else {
      const clampedPos = Math.max(pos, minPos + 0.01);
      onChange(minValue, positionToValue(clampedPos, true));
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setDragging(null);
  }

  const minLabel = formatValue(minValue, false);
  const maxLabel = formatValue(maxValue, true);

  function thumbStyle(which: "min" | "max", pos: number): React.CSSProperties {
    const isHovered = hoveredThumb === which;
    const isDragging = dragging === which;
    return {
      position: "absolute",
      left: `calc(${pos * 100}% - ${THUMB_SIZE / 2}px)`,
      top: `calc(50% - ${THUMB_SIZE / 2}px)`,
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: "50%",
      background: "var(--color-accent)",
      border: "2px solid var(--color-bg-surface)",
      cursor: isDragging ? "grabbing" : "grab",
      transform: isHovered || isDragging ? "scale(1.3)" : "scale(1)",
      boxShadow: isHovered || isDragging
        ? "0 0 0 3px color-mix(in srgb, var(--color-accent) 25%, transparent)"
        : "none",
      transition: isDragging ? "none" : "transform 0.1s, box-shadow 0.1s",
      touchAction: "none",
      zIndex: isDragging ? 3 : 2,
    };
  }

  // Label x offset (clamped so it doesn't overflow the slider)
  function labelLeft(pos: number): string {
    const pct = pos * 100;
    if (pct < 5) return "0%";
    if (pct > 95) return "auto";
    return `${pct}%`;
  }
  function labelRight(pos: number): string {
    const pct = pos * 100;
    if (pct > 95) return "0%";
    return "auto";
  }
  function labelTransform(pos: number): string {
    const pct = pos * 100;
    if (pct < 5) return "none";
    if (pct > 95) return "none";
    return "translateX(-50%)";
  }

  return (
    <div style={{ paddingBottom: 20, userSelect: "none" }}>
      {/* Track container */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        style={{
          position: "relative",
          height: TRACK_HEIGHT,
          background: "var(--color-border-default)",
          borderRadius: TRACK_HEIGHT / 2,
          marginTop: THUMB_SIZE / 2 + 2,
          cursor: "pointer",
        }}
      >
        {/* Filled range between thumbs */}
        <div
          style={{
            position: "absolute",
            left: `${minPos * 100}%`,
            right: `${(1 - maxPos) * 100}%`,
            top: 0,
            bottom: 0,
            background: "var(--color-accent)",
            borderRadius: TRACK_HEIGHT / 2,
            pointerEvents: "none",
          }}
        />

        {/* Min thumb */}
        <div
          style={thumbStyle("min", minPos)}
          onPointerDown={handleMinPointerDown}
          onPointerMove={(e) => handlePointerMove(e, "min")}
          onPointerUp={handlePointerUp}
          onPointerEnter={() => setHoveredThumb("min")}
          onPointerLeave={() => { if (dragging !== "min") setHoveredThumb(null); }}
        />

        {/* Max thumb */}
        <div
          style={thumbStyle("max", maxPos)}
          onPointerDown={handleMaxPointerDown}
          onPointerMove={(e) => handlePointerMove(e, "max")}
          onPointerUp={handlePointerUp}
          onPointerEnter={() => setHoveredThumb("max")}
          onPointerLeave={() => { if (dragging !== "max") setHoveredThumb(null); }}
        />
      </div>

      {/* Value labels */}
      <div style={{ position: "relative", height: 18, marginTop: 4 }}>
        {/* Min label */}
        <span
          style={{
            position: "absolute",
            left: labelLeft(minPos),
            right: labelRight(minPos),
            transform: labelTransform(minPos),
            fontSize: 11,
            fontFamily: "var(--font-family-mono)",
            color: "var(--color-text-secondary)",
            whiteSpace: "nowrap",
          }}
        >
          {minLabel}
        </span>

        {/* Max label — only show if far enough from min to avoid overlap */}
        {maxPos - minPos > 0.08 && (
          <span
            style={{
              position: "absolute",
              left: labelLeft(maxPos),
              right: labelRight(maxPos),
              transform: labelTransform(maxPos),
              fontSize: 11,
              fontFamily: "var(--font-family-mono)",
              color: "var(--color-text-secondary)",
              whiteSpace: "nowrap",
            }}
          >
            {maxLabel}
          </span>
        )}

        {/* Unit label — right-aligned */}
        <span
          style={{
            position: "absolute",
            right: 0,
            fontSize: 10,
            color: "var(--color-text-muted)",
            letterSpacing: "0.02em",
            lineHeight: "18px",
          }}
        >
          MB/min
        </span>
      </div>
    </div>
  );
}
