import type { ReactNode } from 'react';

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
  return (
    <label className={`flex flex-col gap-1 ${disabled ? 'opacity-40' : ''}`}>
      <span className="flex justify-between text-zinc-400">
        <span>{label}</span>
        <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200 tabular-nums">
          {(format ?? ((v: number) => v.toFixed(2)))(value)}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-blue-500"
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
    <label className="flex cursor-pointer items-center justify-between">
      <span className="text-zinc-300">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-blue-400"
      />
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
    <div className="flex gap-1 rounded-xl bg-zinc-950 p-1 ring-1 ring-white/5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`flex-1 rounded-lg px-2 py-1 capitalize transition ${
            value === o
              ? 'bg-blue-500 font-medium text-white'
              : 'text-zinc-400 hover:text-zinc-200'
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
      <span className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}
