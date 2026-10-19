/**
 * Horizontal strips (home calendar, community pills, bulletin tabs) used to
 * steal a vertical swipe, so the page underneath wouldn't move. The strip
 * only claims a gesture once it is clearly sideways; a vertical swipe is left
 * to the page.
 */
const DRAG_PX = 8;

export function installAxisScroll(): void {
  const flag = window as Window & { __commonsAxisScroll?: boolean };
  if (flag.__commonsAxisScroll) return;
  flag.__commonsAxisScroll = true;

  let el: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let locked: "x" | "y" | null = null;

  const find = (target: EventTarget | null): HTMLElement | null => {
    const node = target instanceof Element ? target : null;
    return node?.closest<HTMLElement>("[data-axis-scroll]") ?? null;
  };

  document.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) {
        el = null;
        return;
      }
      el = find(e.target);
      locked = null;
      if (!el) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startLeft = el.scrollLeft;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!el || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!locked) {
        if (Math.abs(dx) < DRAG_PX && Math.abs(dy) < DRAG_PX) return;
        locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (locked === "y") {
        el = null;
        return;
      }
      el.scrollLeft = startLeft - dx;
      if (e.cancelable) e.preventDefault();
    },
    { passive: false },
  );

  const release = () => {
    el = null;
    locked = null;
  };
  document.addEventListener("touchend", release, { passive: true });
  document.addEventListener("touchcancel", release, { passive: true });
}
