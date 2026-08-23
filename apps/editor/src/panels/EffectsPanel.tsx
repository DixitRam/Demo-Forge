import type { FrameStyle } from '../render/style.js';
import { Section, Slider } from './controls.js';

export default function EffectsPanel({
  style,
  setStyle,
}: {
  style: FrameStyle;
  setStyle: (s: FrameStyle) => void;
}) {
  const set = (patch: Partial<FrameStyle>): void => setStyle({ ...style, ...patch });
  const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;

  return (
    <div className="flex flex-col gap-5">
      <Section label="Frame">
        <Slider
          label="Padding"
          value={style.padding}
          min={0}
          max={0.2}
          step={0.005}
          onChange={(padding) => set({ padding })}
          format={pct}
        />
        <Slider
          label="Corner radius"
          value={style.radius}
          min={0}
          max={0.08}
          step={0.002}
          onChange={(radius) => set({ radius })}
          format={pct}
        />
      </Section>

      <Section label="Shadow">
        <Slider
          label="Blur"
          value={style.shadow.blur}
          min={0}
          max={0.15}
          step={0.005}
          onChange={(blur) => set({ shadow: { ...style.shadow, blur } })}
          format={pct}
        />
        <Slider
          label="Offset"
          value={style.shadow.y}
          min={0}
          max={0.08}
          step={0.002}
          onChange={(y) => set({ shadow: { ...style.shadow, y } })}
          format={pct}
        />
        <Slider
          label="Strength"
          value={style.shadow.alpha}
          min={0}
          max={1}
          step={0.05}
          onChange={(alpha) => set({ shadow: { ...style.shadow, alpha } })}
          format={pct}
        />
      </Section>
    </div>
  );
}
