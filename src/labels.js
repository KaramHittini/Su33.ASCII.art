const container = document.getElementById('labels');
const active = new Map(); // id -> {el, start, text, shown, x, y}
const CHAR_MS = 25;

export function setLabels(list) {
  const now = performance.now();
  const seen = new Set();
  for (const l of list) {
    seen.add(l.id);
    let a = active.get(l.id);
    if (!a) {
      const el = document.createElement('div');
      el.className = 'label';
      container.appendChild(el);
      a = { el, start: now, text: l.text, shown: -1, x: null, y: null };
      active.set(l.id, a);
    }
    if (a.text !== l.text) { a.text = l.text; a.shown = -1; }
    if (a.x !== l.x || a.y !== l.y) {
      a.x = l.x; a.y = l.y;
      a.el.style.left = (l.x * 100).toFixed(2) + '%';
      a.el.style.top = (l.y * 100).toFixed(2) + '%';
    }
    const n = Math.min(a.text.length, Math.floor((now - a.start) / CHAR_MS) + 1);
    if (n !== a.shown) { a.shown = n; a.el.textContent = a.text.slice(0, n); }
  }
  for (const [id, a] of active) {
    if (!seen.has(id)) { a.el.remove(); active.delete(id); }
  }
}
