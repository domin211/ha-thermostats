"use client";

import { useCallback, useId, useRef } from "react";
import { reading } from "@/lib/areas";
import type { Climate } from "@/lib/types";

// Geometry: 300° sweep with the gap centred at the bottom, like a watch-face ring.
const SWEEP = 300;
const START = 210; // degrees clockwise from 12 o'clock

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export type DialTone = "off" | "idle" | "heat" | "cool" | "fault";

export function toneOf(c: Climate): DialTone {
  if (c.unavailable || c.state === "off") return "off";
  if (reading(c).kind === "fault") return "fault";
  if (c.action === "heating") return "heat";
  if (c.action === "cooling" || c.state === "cool") return "cool";
  return "idle";
}

export function Flame({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12.6 2.2c.3 2.6-.8 4.3-2.2 5.9-1.5 1.7-3.4 3.4-3.4 6.5A5 5 0 0 0 12 19.8a5 5 0 0 0 5-5.1c0-2.2-1-3.9-2-5.1-.2 1.2-.8 2.1-1.7 2.6.4-3.4-.3-7.1-.7-10z"
      />
    </svg>
  );
}
export function Drop({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="currentColor" d="M12 2.5S5.5 9.8 5.5 14.4A6.5 6.5 0 0 0 12 21a6.5 6.5 0 0 0 6.5-6.6C18.5 9.8 12 2.5 12 2.5z" />
    </svg>
  );
}
export function Snow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" />
    </svg>
  );
}
export function Fan({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12 10.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zM11 9.4c-.6-2.8-.4-6.4 2.6-6.4 2.4 0 3 2.4 1.6 4-1 1.1-2.5 1.6-4.2 2.4zm3.6 1.6c2.8-.6 6.4-.4 6.4 2.6 0 2.4-2.4 3-4 1.6-1.1-1-1.6-2.5-2.4-4.2zM13 14.6c.6 2.8.4 6.4-2.6 6.4-2.4 0-3-2.4-1.6-4 1-1.1 2.5-1.6 4.2-2.4zM9.4 13c-2.8.6-6.4.4-6.4-2.6 0-2.4 2.4-3 4-1.6 1.1 1 1.6 2.5 2.4 4.2z"
      />
    </svg>
  );
}

export function ToneIcon({ c, className }: { c: Climate; className?: string }) {
  const t = toneOf(c);
  if (t === "heat") return <Flame className={`ico ico-heat ${className ?? ""}`} />;
  if (t === "cool") return <Snow className={`ico ico-cool ${className ?? ""}`} />;
  if (c.state === "fan_only") return <Fan className={`ico ico-idle ${className ?? ""}`} />;
  if (c.state === "dry") return <Drop className={`ico ico-cool ${className ?? ""}`} />;
  if (t === "off") return <Flame className={`ico ico-off ${className ?? ""}`} />;
  return <Flame className={`ico ico-idle ${className ?? ""}`} />;
}

const frac = (c: Climate, v: number) => Math.min(1, Math.max(0, (v - c.min) / (c.max - c.min || 1)));

export interface DialProps {
  c: Climate;
  /** override setpoint shown on the arc (pending drag value) */
  value?: number | null;
  size?: "sm" | "lg";
  /** when set, arc is draggable */
  onDrag?: (v: number, done: boolean) => void;
  center?: React.ReactNode;
  /** show a reading on a fixed scale instead of the setpoint */
  arc?: { value: number | null; min: number; max: number };
}

export function Dial({ c, value, size = "sm", onDrag, center, arc }: DialProps) {
  const svg = useRef<SVGSVGElement>(null);
  const gid = useId().replace(/:/g, "");
  const dragging = useRef(false);
  const tone = toneOf(c);
  const target = value ?? c.target;
  const W = 200;
  const R = size === "lg" ? 82 : 80;
  const SW = size === "lg" ? 11 : 11;
  const on = tone !== "off";
  const f = arc
    ? arc.value === null
      ? null
      : Math.min(1, Math.max(0.02, (arc.value - arc.min) / (arc.max - arc.min)))
    : target !== null
      ? Math.max(0.02, frac(c, target))
      : null;
  const end = f !== null ? START + SWEEP * f : START;
  const r = reading(c);

  const toValue = useCallback(
    (e: React.PointerEvent) => {
      const el = svg.current;
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const x = e.clientX - (b.left + b.width / 2);
      const y = e.clientY - (b.top + b.height / 2);
      let deg = (Math.atan2(y, x) * 180) / Math.PI + 90; // 0 = top, clockwise
      if (deg < 0) deg += 360;
      let rel = deg - START;
      if (rel < 0) rel += 360;
      if (rel > SWEEP) rel = rel - SWEEP < (360 - SWEEP) / 2 ? SWEEP : 0;
      const raw = c.min + (rel / SWEEP) * (c.max - c.min);
      const step = c.step || 0.5;
      return Math.round(raw / step) * step;
    },
    [c.min, c.max, c.step],
  );

  const drag = onDrag && on && target !== null;
  const knob = target !== null ? polar(W / 2, W / 2, R, end) : null;

  return (
    <div className={`dial-wrap dial-wrap-${size} is-${tone}`}>
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${W}`}
      className={`dial dial-${size} dial-${tone}${drag ? " dial-drag" : ""}`}
      onPointerDown={
        drag
          ? (e) => {
              dragging.current = true;
              (e.target as Element).setPointerCapture?.(e.pointerId);
              const v = toValue(e);
              if (v !== null) onDrag!(v, false);
            }
          : undefined
      }
      onPointerMove={
        drag
          ? (e) => {
              if (!dragging.current) return;
              const v = toValue(e);
              if (v !== null) onDrag!(v, false);
            }
          : undefined
      }
      onPointerUp={
        drag
          ? (e) => {
              if (!dragging.current) return;
              dragging.current = false;
              const v = toValue(e);
              if (v !== null) onDrag!(v, true);
            }
          : undefined
      }
      role={drag ? "slider" : "img"}
      aria-label={`${c.name}: ${r.kind === "ok" ? r.value.toFixed(1) + " degrees" : r.kind === "fault" ? "sensor fault" : "no reading"}`}
      aria-valuenow={drag ? (target ?? undefined) : undefined}
      aria-valuemin={drag ? c.min : undefined}
      aria-valuemax={drag ? c.max : undefined}
    >
      <defs>
        <linearGradient id={`g${gid}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0a84ff" />
          <stop offset=".55" stopColor="#9fd3ff" />
          <stop offset="1" stopColor="#ff453a" />
        </linearGradient>
      </defs>
      <circle cx={W / 2} cy={W / 2} r={W / 2 - 1} className="dial-face" />
      {on && <path d={arcPath(W / 2, W / 2, R, START, START + SWEEP)} className="dial-track" strokeWidth={SW} />}
      {on && f !== null && (
        <path d={arcPath(W / 2, W / 2, R, START, end)} className="dial-arc" strokeWidth={SW} style={tone === "cool" ? { stroke: `url(#g${gid})` } : undefined} />
      )}
      {on && drag && knob && <circle cx={knob[0]} cy={knob[1]} r={SW / 2 + 3} className="dial-knob" />}
    </svg>
      <div className="dial-center">{center}</div>
    </div>
  );
}

/** Dashed ring: N segments, first `active` lit. Used for AC fan speed. */
export function FanRing({ levels, active, label }: { levels: number; active: number; label: string }) {
  const W = 200;
  const R = 80;
  const gap = 14;
  const seg = (SWEEP - gap * (levels - 1)) / levels;
  return (
    <div className="dial-wrap dial-wrap-sm">
    <svg viewBox={`0 0 ${W} ${W}`} className="dial dial-sm dial-fan" role="img" aria-label={`Fan ${label}`}>
      <circle cx={W / 2} cy={W / 2} r={W / 2 - 1} className="dial-face" />
      {Array.from({ length: levels }, (_, i) => {
        const a = START + i * (seg + gap);
        return <path key={i} d={arcPath(W / 2, W / 2, R, a, a + seg)} className={i < active ? "dial-arc" : "dial-track"} strokeWidth={11} />;
      })}
    </svg>
      <div className="dial-center">
        <span className="dial-num dial-num-word">{label}</span>
        <Fan className="ico ico-idle" />
      </div>
    </div>
  );
}
