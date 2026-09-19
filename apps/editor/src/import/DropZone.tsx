import { useCallback, useEffect, useState } from 'react';
import { loadBundle, type LoadedProject } from './loadRecording.js';

export default function DropZone({ onLoad }: { onLoad: (p: LoadedProject) => void }) {
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accept = useCallback(
    async (files: File[]) => {
      setBusy(true);
      setError(null);
      try {
        onLoad(await loadBundle(files));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [onLoad],
  );

  // `?demo=<name>` opens a take `demoforge record` left in demos/<name>/.
  useEffect(() => {
    const name = new URLSearchParams(location.search).get('demo');
    if (!name) return;
    const base = `/api/demo/${encodeURIComponent(name)}`;
    let live = true; // StrictMode mounts twice; only the surviving mount loads
    void (async () => {
      const res = await fetch(base);
      if (!res.ok) return setError(`No recorded demo called "${name}".`);
      // A raw demo.json would shadow the project that holds the script.
      const names = (await res.json() as string[]).filter((n, _, all) =>
        n === 'demo.json' ? !all.includes('demo.dfp.json') : true,
      );
      const files = await Promise.all(
        names.map(async (n) => new File([await (await fetch(`${base}/${n}`)).blob()], n)),
      );
      if (live) await accept(files);
    })();
    return () => {
      live = false;
    };
  }, [accept]);

  return (
    <div className="flex h-full items-center justify-center p-8">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void accept([...e.dataTransfer.files]);
        }}
        className={`flex w-full max-w-xl cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-16 text-center transition ${
          over ? 'border-blue-400 bg-blue-400/5' : 'border-line hover:border-line'
        }`}
      >
        <span className="text-lg font-medium">
          {busy ? 'Loading…' : 'Drop demo.json + recording.webm'}
        </span>
        <span className="text-sm text-muted">
          or click to choose them — reopening a saved project? add its
          <span className="text-fg"> .narration.wav</span> to keep the voiceover
        </span>
        <input
          type="file"
          multiple
          accept=".json,.webm,.mp4,.wav"
          className="hidden"
          onChange={(e) => void accept([...(e.target.files ?? [])])}
        />
        {error && <span className="text-sm text-red-700 dark:text-red-400">{error}</span>}
      </label>
    </div>
  );
}
