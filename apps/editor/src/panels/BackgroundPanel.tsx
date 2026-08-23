import { useState } from 'react';
import { GRADIENT_PRESETS, type Background, type FrameStyle } from '../render/style.js';
import { WALLPAPERS, wallpaperThumb } from '../render/wallpapers.js';
import { Section, Slider, Tabs } from './controls.js';

const TABS = ['image', 'color', 'gradient'] as const;
type Tab = (typeof TABS)[number];

export default function BackgroundPanel({
  style,
  setStyle,
}: {
  style: FrameStyle;
  setStyle: (s: FrameStyle) => void;
}) {
  const bg = style.background;
  const [tab, setTab] = useState<Tab>(
    bg.kind === 'solid' ? 'color' : bg.kind === 'gradient' ? 'gradient' : 'image',
  );
  const setBg = (background: Background): void => setStyle({ ...style, background });

  const upload = (file: File | undefined): void => {
    if (!file) return;
    const image = new Image();
    image.onload = () => setBg({ kind: 'image', image });
    image.src = URL.createObjectURL(file);
  };

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} options={TABS} onChange={setTab} />

      {tab === 'image' && (
        <>
          <label className="cursor-pointer rounded-lg border border-slate-700 py-2 text-center text-slate-300 hover:border-slate-500 hover:text-white">
            Upload Custom
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          {bg.kind === 'image' && (
            <div className="overflow-hidden rounded-md border-2 border-sky-400">
              <img src={bg.image.src} alt="" className="h-16 w-full object-cover" />
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            {WALLPAPERS.map((wp) => (
              <button
                key={wp.id}
                title={wp.name}
                onClick={() => setBg({ kind: 'wallpaper', id: wp.id })}
                className={`aspect-[3/2] overflow-hidden rounded-md border-2 transition ${
                  bg.kind === 'wallpaper' && bg.id === wp.id
                    ? 'border-sky-400'
                    : 'border-transparent hover:border-slate-600'
                }`}
              >
                <img src={wallpaperThumb(wp)} alt={wp.name} className="h-full w-full" />
              </button>
            ))}
          </div>
        </>
      )}

      {tab === 'color' && (
        <Section label="Colour">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={bg.kind === 'solid' ? bg.color : '#0f172a'}
              onChange={(e) => setBg({ kind: 'solid', color: e.target.value })}
              className="h-9 w-14 rounded border border-slate-700 bg-transparent"
            />
            <span className="font-mono text-slate-400">
              {bg.kind === 'solid' ? bg.color : 'pick a colour'}
            </span>
          </div>
        </Section>
      )}

      {tab === 'gradient' && (
        <>
          <div className="grid grid-cols-5 gap-1.5">
            {GRADIENT_PRESETS.map((p) => (
              <button
                key={p.name}
                title={p.name}
                onClick={() => setBg({ ...p, kind: 'gradient' })}
                style={{ background: `linear-gradient(${p.angle}deg, ${p.from}, ${p.to})` }}
                className="h-8 rounded border border-slate-700 hover:border-slate-500"
              />
            ))}
          </div>
          {bg.kind === 'gradient' && (
            <>
              <div className="flex items-center justify-between text-slate-400">
                <span>From / to</span>
                <span className="flex gap-1">
                  <input
                    type="color"
                    value={bg.from}
                    onChange={(e) => setBg({ ...bg, from: e.target.value })}
                    className="h-8 w-11 rounded border border-slate-700 bg-transparent"
                  />
                  <input
                    type="color"
                    value={bg.to}
                    onChange={(e) => setBg({ ...bg, to: e.target.value })}
                    className="h-8 w-11 rounded border border-slate-700 bg-transparent"
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
        </>
      )}
    </div>
  );
}
