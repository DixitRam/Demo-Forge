import { ASPECT_PRESETS, type FrameStyle } from '../render/style.js';
import { Section } from './controls.js';

export default function LayoutPanel({
  style,
  setStyle,
  videoAspect,
}: {
  style: FrameStyle;
  setStyle: (s: FrameStyle) => void;
  videoAspect: number;
}) {
  const current = style.aspect;

  return (
    <div className="flex flex-col gap-5">
      <Section label="Aspect ratio">
        <div className="grid grid-cols-3 gap-2">
          {ASPECT_PRESETS.map((p) => {
            const active = current === p.value;
            const ratio = p.value ?? videoAspect;
            return (
              <button
                key={p.label}
                onClick={() => setStyle({ ...style, aspect: p.value })}
                className={`flex flex-col items-center gap-1.5 rounded-lg border py-2 transition ${
                  active
                    ? 'border-blue-400 bg-blue-500/10 text-blue-100'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                }`}
              >
                <span
                  style={{ aspectRatio: String(ratio) }}
                  className={`w-8 rounded-[3px] border ${
                    active ? 'border-blue-300 bg-blue-400/20' : 'border-zinc-600'
                  }`}
                />
                <span className="text-[10px]">{p.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-zinc-500">
          The recording is fitted inside the chosen frame — nothing is cropped, so a tall frame
          around a wide capture leaves more background above and below.
        </p>
      </Section>
    </div>
  );
}
