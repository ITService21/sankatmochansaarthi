import { RefObject, useEffect, useState } from "react";

/**
 * Best-effort deterrents for the secure viewer. IMPORTANT: a web page cannot truly prevent screenshots or
 * screen recording (the OS captures pixels outside the page's control). These measures make casual copying
 * harder, and every page also carries a per-user watermark so leaked captures can be traced.
 *
 * While mounted it: blocks right-click, drag, copy/cut and text selection inside `ref`; blocks Ctrl/Cmd +
 * S / P / C / U; clears the clipboard on PrintScreen; and hides the content ("obscured") while the tab is hidden
 * and briefly after a screenshot shortcut.
 * @returns `{ obscured }` — render an overlay when true
 */
export function useContentProtection(ref: RefObject<HTMLElement>, enabled = true) {
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    const stop = (e: Event) => e.preventDefault();
    const events = ["contextmenu", "dragstart", "copy", "cut", "selectstart"] as const;
    events.forEach((ev) => el?.addEventListener(ev, stop));

    let timer: number | undefined;
    const hideBriefly = () => { setObscured(true); window.clearTimeout(timer); timer = window.setTimeout(() => setObscured(document.visibilityState === "hidden"), 1500); };
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && ["s", "p", "c", "u"].includes(e.key.toLowerCase())) e.preventDefault();
      // macOS screenshot chords (Cmd+Shift+3/4/5) are normally swallowed by the OS, but hide just in case.
      if (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key)) hideBriefly();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") { void navigator.clipboard?.writeText(" ").catch(() => undefined); hideBriefly(); }
    };
    // Only a hidden tab (switched away / minimised) obscures the page. Plain window blur is NOT used: it also fires
    // when the user clicks the address bar, DevTools or another pane while still looking at the note, which
    // wrongly showed "Content is hidden" over a visible page.
    const onVisibility = () => setObscured(document.visibilityState === "hidden");
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility(); // sync with the current state so the overlay can never be left stuck on
    return () => {
      events.forEach((ev) => el?.removeEventListener(ev, stop));
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
    };
  }, [ref, enabled]);

  return { obscured: enabled && obscured };
}
