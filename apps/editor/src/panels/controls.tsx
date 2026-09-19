import type { ReactNode } from 'react';

/**
 * A fill bar with the label inside, macOS-style. The native range input sits
 * invisibly on top, so keyboard, drag and screen readers all still work.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <label
      className={`relative flex h-9 items-center overflow-hidden rounded-lg bg-raised text-xs ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      <span className="absolute inset-y-0 left-0 bg-hover" style={{ width: `${pct}%` }} />
      <span
        className="absolute inset-y-2 w-0.5 rounded-full bg-fg/60"
        style={{ left: `calc(${pct}% - 1px)` }}
      />
      <span className="relative flex-1 truncate px-3 text-fg">{label}</span>
      <span className="relative px-3 font-medium text-fg tabular-nums">
        {(format ?? ((v: number) => v.toFixed(2)))(value)}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </label>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex h-9 cursor-pointer items-center justify-between rounded-lg bg-raised px-3 text-xs">
      <span className="text-fg">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="relative h-5 w-9 shrink-0 rounded-full bg-hover transition peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
    </label>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-raised p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`flex-1 rounded-md px-2 py-1.5 text-xs capitalize transition ${
            value === o
              ? 'bg-blue-600 font-medium text-white shadow-sm'
              : 'text-muted hover:text-fg'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</span>
      {children}
    </div>
  );
}
