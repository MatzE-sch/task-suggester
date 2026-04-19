export function longpress(node: HTMLElement, duration = 400) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;

  function start(e: PointerEvent) {
    node.style.userSelect = 'none';
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      node.style.userSelect = 'text';
    }, duration);
  }

  function move(e: PointerEvent) {
    if (timer === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy > 100) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function end() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  node.addEventListener('pointerdown', start);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);

  return {
    destroy() {
      node.removeEventListener('pointerdown', start);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', end);
      node.removeEventListener('pointercancel', end);
    }
  };
}
