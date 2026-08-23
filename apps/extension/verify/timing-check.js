const t0 = performance.now();
const clock = document.getElementById('clock');
const flash = document.getElementById('flash');
const log = document.getElementById('log');
const hits = [];

function tick() {
  clock.textContent = `${((performance.now() - t0) / 1000).toFixed(3)} s`;
  requestAnimationFrame(tick);
}
tick();

addEventListener('click', (e) => {
  const target = e.target instanceof Element ? e.target : null;
  hits.push({
    at: ((performance.now() - t0) / 1000).toFixed(3),
    on: target?.id || target?.tagName || '?',
  });
  log.textContent = hits.map((h) => `${h.at}s  ${h.on}`).join('\n');
  flash.classList.add('on');
  setTimeout(() => flash.classList.remove('on'), 90);
});
