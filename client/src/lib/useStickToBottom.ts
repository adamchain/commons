import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Keep a chat transcript pinned to the newest message. Own sends always jump
 * to the end; incoming messages only do if the reader is already near the
 * bottom. The shell is locked to the visual viewport so the iOS keyboard
 * shrinks the list instead of covering the just-sent bubble.
 */
export function useStickToBottom(active: boolean, stickKey: string | number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const atBottomRef = useRef(true);
  const forceRef = useRef(true);
  const pinningRef = useRef(false);
  const pinTimersRef = useRef<number[]>([]);

  const pinToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinningRef.current = true;
    // Never use scrollIntoView — it scrolls the window / wrong ancestors and
    // leaves this overflow container sitting on older messages.
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
    atBottomRef.current = true;
    window.setTimeout(() => {
      pinningRef.current = false;
    }, 80);
  }, []);

  const stickOnSend = useCallback(() => {
    forceRef.current = true;
    pinToLatest();
    for (const t of pinTimersRef.current) window.clearTimeout(t);
    pinTimersRef.current = [0, 50, 150, 320].map((ms) =>
      window.setTimeout(pinToLatest, ms),
    );
  }, [pinToLatest]);

  useEffect(() => {
    return () => {
      for (const t of pinTimersRef.current) window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const shell = shellRef.current;
    const vv = window.visualViewport;
    if (!shell) return;

    const sync = () => {
      if (vv) {
        // Pin to the unobscured visual viewport (keyboard-safe). Avoid
        // transform — it creates a containing block that breaks overflow
        // scrolling of the message list on iOS.
        shell.style.position = "fixed";
        shell.style.left = "0";
        shell.style.right = "0";
        shell.style.width = "100%";
        shell.style.top = `${Math.round(vv.offsetTop)}px`;
        shell.style.height = `${Math.round(vv.height)}px`;
        shell.style.maxHeight = `${Math.round(vv.height)}px`;
        shell.style.margin = "0 auto";
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
      shell.style.position = "";
      shell.style.left = "";
      shell.style.right = "";
      shell.style.width = "";
      shell.style.top = "";
      shell.style.height = "";
      shell.style.maxHeight = "";
      shell.style.margin = "";
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
