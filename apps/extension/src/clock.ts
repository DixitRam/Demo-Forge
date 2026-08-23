/**
 * ONE clock for the whole extension (timing risk #1, 02_ARCHITECTURE.md).
 *
 * `performance.now()` is relative to each context's own time origin — the
 * service worker, the offscreen document and every content script each have a
 * different one, so a raw performance.now() from a content script is
 * meaningless to the recorder. Adding timeOrigin gives a high-resolution wall
 * clock that IS comparable across contexts, which is what t0 needs to be.
 */
export function nowWall(): number {
  return performance.timeOrigin + performance.now();
}
