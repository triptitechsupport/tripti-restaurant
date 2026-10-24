// Phone-app behaviour for the Tripti Staff app (loaded only inside the app):
// no pinch zoom, a short vibration on taps, and pull down at the top of a
// screen to refresh it.

function lockZoom() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}

function haptics() {
  if (typeof navigator.vibrate !== 'function') return;
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('button, [role="tab"], [role="menuitem"], [role="option"], a[href], input[type="checkbox"], [role="switch"]');
    if (el && !el.disabled) {
      try { navigator.vibrate(8); } catch { /* not allowed */ }
    }
  }, true);
}

// True when the touch starts inside something that is itself scrolled down,
// or inside a dialog / sheet: then a downward swipe must scroll, not refresh.
function blocked(target) {
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return true;
  for (let el = target; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
    if (el.matches?.('input, textarea, select, [contenteditable="true"]')) return true;
  }
  return false;
}

function pullToRefresh() {
  const THRESHOLD = 72;
  const ring = document.createElement('div');
  ring.className = 'app-ptr';
  ring.setAttribute('aria-hidden', 'true');
  ring.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>';
  document.body.appendChild(ring);

  let startY = null;
  let pull = 0;
  const show = (d) => {
    ring.style.transform = `translate(-50%, ${Math.min(d, THRESHOLD + 20) - 48}px) rotate(${d * 3}deg)`;
    ring.style.opacity = String(Math.min(1, d / THRESHOLD));
    ring.classList.toggle('ready', d >= THRESHOLD);
  };
  const reset = () => {
    startY = null; pull = 0;
    ring.style.transition = 'transform .2s ease, opacity .2s ease';
    ring.style.transform = 'translate(-50%, -48px)';
    ring.style.opacity = '0';
    setTimeout(() => { ring.style.transition = ''; }, 220);
  };

  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) { startY = null; return; }
    startY = e.touches[0].clientY;
    pull = 0;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || window.scrollY > 0) { if (pull) reset(); else startY = null; return; }
    pull = dy * 0.5;
    show(pull);
  }, { passive: true });

  window.addEventListener('touchend', () => {
    if (startY == null) return;
    if (pull >= THRESHOLD) {
      ring.classList.add('spin');
      try { navigator.vibrate?.(15); } catch { /* ignore */ }
      setTimeout(() => window.location.reload(), 150);
      return;
    }
    reset();
  }, { passive: true });
  window.addEventListener('touchcancel', reset, { passive: true });
}

export function startAppShell() {
  lockZoom();
  haptics();
  if (document.body) pullToRefresh();
  else document.addEventListener('DOMContentLoaded', pullToRefresh, { once: true });
}
