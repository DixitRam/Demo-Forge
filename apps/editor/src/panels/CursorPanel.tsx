import { cursorMoveMs, type FrameStyle } from '../render/style.js';
import { Section, Slider, Toggle } from './controls.js';

export default function CursorPanel({
  style,
  setStyle,
}: {
  style: FrameStyle;
  setStyle: (s: FrameStyle) => void;
}) {
  const c = style.cursor;
  const set = (patch: Partial<typeof c>): void =>
    setStyle({ ...style, cursor: { ...c, ...patch } });

  return (
    <div className="flex flex-col gap-5">
      <Section label="Synthetic cursor">
        <Toggle label="Show cursor" checked={c.show} onChange={(show) => set({ show })} />
        <Toggle label="Click pulse" checked={c.clicks} onChange={(clicks) => set({ clicks })} />
      </Section>

      <Section label="Motion">
        <Slider
          label="Size"
          value={c.size}
          min={0.015}
          max={0.12}
          step={0.005}
          disabled={!c.show}
          onChange={(size) => set({ size })}
          format={(v) => `${Math.round(v * 1000) / 10}%`}
        />
        <Slider
          label="Smoothing"
          value={c.smoothing}
          min={0}
          max={1}
          step={0.05}
          disabled={!c.show}
          onChange={(smoothing) => set({ smoothing })}
          format={(v) => `${Math.round(cursorMoveMs(v))}ms`}
        />
      </Section>

      <p className="text-[11px] leading-relaxed text-slate-500">
        This cursor is drawn from the click log, not captured from the screen. That is what will
        let a Playwright-driven recording — which never moves a real pointer — get correct cursor
        motion for free.
      </p>
    </div>
  );
}
