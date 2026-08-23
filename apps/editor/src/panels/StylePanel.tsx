import { GRADIENT_PRESETS, type Background, type FrameStyle } from '../render/style.js';

interface Props {
  style: FrameStyle;
  setStyle: (s: FrameStyle) => void;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-slate-400">
        <span>{label}</span>
        <span className="font-mono">{(format ?? ((v: number) => v.toFixed(3)))(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-sky-400"
      />
    </label>
  );
}

export default function StylePanel({ style, setStyle }: Props) {
  const bg = style.background;
  const set = (patch: Partial<FrameStyle>): void => setStyle({ ...style, ...patch });
  const setBg = (background: Background): void => set({ background });

  const pickImage = (file: File | undefined): void => {
    if (!file) return;
    const image = new Image();
    image.onload = () => setBg({ kind: 'image', image });
    image.src = URL.createObjectURL(file);
  };

  return (
    <div className="flex flex-col gap-4 border-t border-slate-800 p-4 text-xs">
      <div className="flex gap-1">
        {(['solid', 'gradient', 'image'] as const).map((kind) => (
          <button
            key={kind}
            onClick={() => {
              if (kind === bg.kind) return;
              if (kind === 'solid') setBg({ kind: 'solid', color: '#0f172a' });
              if (kind === 'gradient') setBg({ ...GRADIENT_PRESETS[0]!, kind: 'gradient' });
              if (kind === 'image') document.getElementById('df-wallpaper')?.click();
            }}
            className={`flex-1 rounded px-2 py-1 capitalize ${
              bg.kind === kind ? 'bg-sky-500/30 text-sky-100' : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            {kind}
          </button>
        ))}
        <input
          id="df-wallpaper"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickImage(e.target.files?.[0])}
        />
      </div>

      {bg.kind === 'solid' && (
        <label className="flex items-center justify-between text-slate-400">
          <span>Colour</span>
          <input
            type="color"
            value={bg.color}
            onChange={(e) => setBg({ kind: 'solid', color: e.target.value })}
            className="h-7 w-14 rounded border border-slate-700 bg-transparent"
          />
        </label>
      )}

      {bg.kind === 'gradient' && (
        <>
          <div className="flex gap-1">
            {GRADIENT_PRESETS.map((p) => (
              <button
                key={p.name}
                title={p.name}
                onClick={() => setBg({ ...p, kind: 'gradient' })}
                style={{ background: `linear-gradient(${p.angle}deg, ${p.from}, ${p.to})` }}
                className="h-6 flex-1 rounded border border-slate-700"
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span>From / to</span>
            <span className="flex gap-1">
              <input
                type="color"
                value={bg.from}
                onChange={(e) => setBg({ ...bg, from: e.target.value })}
                className="h-7 w-10 rounded border border-slate-700 bg-transparent"
              />
              <input
                type="color"
                value={bg.to}
                onChange={(e) => setBg({ ...bg, to: e.target.value })}
                className="h-7 w-10 rounded border border-slate-700 bg-transparent"
              />
            </span>
          </div>
          <Slider
            label="Angle"
            value={bg.angle}
            min={0}
            max={360}
            step={5}
            onChange={(angle) => setBg({ ...bg, angle })}
            format={(v) => `${v}°`}
          />
        </>
      )}

      {bg.kind === 'image' && (
        <button
          onClick={() => document.getElementById('df-wallpaper')?.click()}
          className="rounded bg-slate-800 px-2 py-1 hover:bg-slate-700"
        >
          Change wallpaper…
        </button>
      )}

      <Slider
        label="Padding"
        value={style.padding}
        min={0}
        max={0.2}
        step={0.005}
        onChange={(padding) => set({ padding })}
      />
      <Slider
        label="Corner radius"
        value={style.radius}
        min={0}
        max={0.08}
        step={0.002}
        onChange={(radius) => set({ radius })}
      />
      <Slider
        label="Shadow blur"
        value={style.shadow.blur}
        min={0}
        max={0.15}
        step={0.005}
        onChange={(blur) => set({ shadow: { ...style.shadow, blur } })}
      />
      <Slider
        label="Shadow strength"
        value={style.shadow.alpha}
        min={0}
        max={1}
        step={0.05}
        onChange={(alpha) => set({ shadow: { ...style.shadow, alpha } })}
        format={(v) => v.toFixed(2)}
      />
    </div>
  );
}
