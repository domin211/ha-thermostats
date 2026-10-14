"use client";

import { useEffect, useRef, useState } from "react";
import { MODE_LABEL, reading } from "@/lib/areas";
import type { Climate, ControlRequest } from "@/lib/types";

type Send = (r: ControlRequest) => void;

export function Reading({ c, size = "md" }: { c: Climate; size?: "md" | "lg" }) {
  const r = reading(c);
  if (r.kind === "fault")
    return (
      <span className={`reading reading-${size} reading-fault`} title={`Sensor reports ${r.raw} °C`}>
        <span className="fault-tag">Sensor fault</span>
      </span>
    );
  if (r.kind === "none")
    return (
      <span className={`reading reading-${size} reading-none`} title="No temperature reported">
        --.-
      </span>
    );
  const [i, d] = r.value.toFixed(1).split(".");
  return (
    <span className={`reading reading-${size}`}>
      {i}
      <span className="reading-dec">.{d}</span>
      <span className="reading-unit">°C</span>
    </span>
  );
}

export function Status({ c }: { c: Climate }) {
  if (c.unavailable) return <span className="status status-na">Unavailable</span>;
  if (c.state === "off") return <span className="status status-off">Off</span>;
  if (c.action === "heating") return <span className="status status-heat">Heating</span>;
  if (c.action === "cooling") return <span className="status status-cool">Cooling</span>;
  if (c.action === "drying" || c.action === "fan") return <span className="status status-on">{c.action === "fan" ? "Fan" : "Drying"}</span>;
  if (c.state === "heat") return <span className="status status-on">Idle</span>;
  return <span className="status status-on">{MODE_LABEL[c.state] ?? c.state}</span>;
}

/** Setpoint stepper. Batches quick taps and sends once the user pauses. */
export function Setpoint({ c, send, compact }: { c: Climate; send: Send; compact?: boolean }) {
  const [local, setLocal] = useState<number | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (t.current && clearTimeout(t.current)), []);

  const value = local ?? c.target;
  const disabled = c.unavailable || c.state === "off" || value === null;
  const bump = (dir: 1 | -1) => {
    if (value === null) return;
    const step = c.step || 0.5;
    const next = Math.min(c.max, Math.max(c.min, Math.round((value + dir * step) * 10) / 10));
    setLocal(next);
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      send({ action: "set_temperature", entityIds: [c.id], temperature: next });
      setTimeout(() => setLocal(null), 400);
    }, 650);
  };

  return (
    <div className={`setpoint${compact ? " setpoint-compact" : ""}${disabled ? " is-disabled" : ""}`}>
      <button type="button" className="step" onClick={() => bump(-1)} disabled={disabled || value! <= c.min} aria-label={`Lower ${c.name}`}>
        <svg viewBox="0 0 12 12" aria-hidden><path d="M2 6h8" /></svg>
      </button>
      <span className={`setpoint-value${local !== null ? " is-pending" : ""}`} aria-live="polite">
        {value === null ? "--" : value.toFixed(1)}
      </span>
      <button type="button" className="step" onClick={() => bump(1)} disabled={disabled || value! >= c.max} aria-label={`Raise ${c.name}`}>
        <svg viewBox="0 0 12 12" aria-hidden><path d="M2 6h8M6 2v8" /></svg>
      </button>
    </div>
  );
}

export function Power({ c, send, onMode = "heat" }: { c: Climate; send: Send; onMode?: string }) {
  const on = c.state !== "off";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${c.name} ${on ? "on" : "off"}`}
      className={`rocker${on ? " is-on" : ""}`}
      disabled={c.unavailable}
      onClick={() => send({ action: "set_hvac_mode", entityIds: [c.id], mode: on ? "off" : onMode })}
    >
      <span className="rocker-knob" />
    </button>
  );
}

export function Modes({ c, send }: { c: Climate; send: Send }) {
  const order = ["off", "auto", "heat_cool", "cool", "heat", "dry", "fan_only"];
  const modes = [...c.modes].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <div className="modes" role="radiogroup" aria-label={`${c.name} mode`}>
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={c.state === m}
          className={`mode mode-${m}${c.state === m ? " is-active" : ""}`}
          disabled={c.unavailable}
          onClick={() => c.state !== m && send({ action: "set_hvac_mode", entityIds: [c.id], mode: m })}
        >
          {MODE_LABEL[m] ?? m}
        </button>
      ))}
    </div>
  );
}
