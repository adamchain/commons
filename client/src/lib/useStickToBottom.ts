import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Keep a chat transcript pinned to the newest message: own sends always
 * jump to the end; incoming messages only do if the reader is already near
 * the bottom. Survives iOS keyboard / visual-viewport resizes that would
 * otherwise leave the just-sent bubble below the fold.
 */
export function useStickToBottom(active: boolean, stickKey: string | number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const atBottomRef = useRef(true);
  const forceRef = useRef(true);
  const pinningRef = useRef(false);

  const pinToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (gap < 2 && !forceRef.current) {
      atBottomRef.current = true;
      return;
    }
    pinningRef.current = true;
    el.scrollTop = el.scrollHeight;
    endRef.current?.scrollIntoView({ block: "end", inline: "nearest" });
    atBottomRef.current = true;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      endRef.current?.scrollIntoView({ block: "end", inline: "nearest" });
      requestAnimationFrame(() => {
        pinningRef.current = false;
        atBottomRef.current =
          el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      });
    });
  }, []);

  const stickOnSend = useCallback(() => {
    forceRef.current = true;
  }, []);

  useEffect(() => {
    if (!active) return;
    const shell = shellRef.current;
    const vv = window.visualViewport;
    if (!shell) return;

    const sync = () => {
      if (vv) {
        shell.style.height = `${Math.round(vv.height)}px`;
        shell.style.transform = vv.offsetTop ? `translateY(${Math.round(vv.offsetTop)}px)` : "";
      }
      if (forceRef.current || atBottomRef.current) pinToLatest();
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      shell.style.height = "";
      shell.style.transform = "";
    };
  }, [active, pinToLatest]);

  useEffect(() => {
    if (!active) return;
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      if (pinningRef.current) return;
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      atBottomRef.current = nearBottom;
      if (!nearBottom) forceRef.current = false;
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => {
      if (forceRef.current || atBottomRef.current) pinToLatest();
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [active, pinToLatest]);

  useLayoutEffect(() => {
    if (!active) return;
    if (!forceRef.current && !atBottomRef.current) return;
    pinToLatest();
  }, [active, stickKey, pinToLatest]);

  return { scrollRef, endRef, shellRef, stickOnSend };
}
