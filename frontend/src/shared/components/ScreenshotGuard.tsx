import { useEffect, useState } from "react";
import { Lock } from "lucide-react";

/**
 * Whether the site-wide screenshot deterrent is active. Set `VITE_SCREENSHOT_PROTECTION=true|false` to force it;
 * when unset it is ON in production builds and OFF in the dev server, so local debugging (and automated browser
 * checks) are never blocked while the live site is protected.
 */
export const SCREENSHOT_PROTECTION: boolean = (() => {
  const flag = import.meta.env.VITE_SCREENSHOT_PROTECTION as string | undefined;
  return flag === undefined || flag === "" ? import.meta.env.PROD : flag.toLowerCase() === "true";
})();

/**
 * Best-effort screenshot deterrent for the WHOLE site. IMPORTANT: a web page cannot truly stop the operating
 * system from capturing the screen (phones, another device's camera, OS tools). What this does is cover the page
 * with an opaque panel at the moments a capture is attempted, so the usual shortcuts record only the cover:
 *  - capture shortcuts (Mac Cmd+Shift+3/4/5; Windows PrintScreen, Win+Shift+S, Win+G Game Bar, Win+Alt+R recording):
 *    the cover appears as soon as the shortcut's modifiers are held and goes away again if the next key shows it was
 *    an ordinary shortcut; the clipboard is cleared when PrintScreen is released;
 *  - printing / "Save as PDF" (Ctrl/Cmd+P): the page is hidden by a print stylesheet and the cover;
 *  - the tab being hidden or minimised.
 * Per-user watermarks in the secure viewer remain the way to trace a leaked capture. Renders nothing when disabled.
 */
export function ScreenshotGuard() {
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    if (!SCREENSHOT_PROTECTION) return;
    let timer: number | undefined;
    /** Keep the cover up for `ms` after a capture shortcut (the OS grabs the frame slightly after the key press). */
    const holdCover = (ms: number) => { setCovered(true); window.clearTimeout(timer); timer = window.setTimeout(() => setCovered(document.visibilityState === "hidden"), ms); };
    // The OS swallows the final key of its capture shortcuts, so the page mostly sees only the modifiers and covers
    // itself as soon as they are held: Cmd+Shift on Mac (Cmd+Shift+3/4/5), the Windows key on Windows/Linux
    // (Win+Shift+S Snip, Win+G Game Bar, Win+Alt+R record, Win+Alt+PrintScreen). If the NEXT key is not a capture key the
    // cover is dropped again, so ordinary shortcuts (Cmd+Shift+R, Win+E...) only flicker. PrintScreen always covers.
    const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
    const MODIFIERS = ["Meta", "Shift", "Control", "Alt", "OS"];
    const CAPTURE_KEYS = ["3", "4", "5", "#", "$", "%", "s", "S", "g", "G", "r", "R", "PrintScreen"];
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") return holdCover(2500);
      const armed = isMac ? e.metaKey && e.shiftKey : e.metaKey;
      if (!armed) return;
      if (MODIFIERS.includes(e.key) || CAPTURE_KEYS.includes(e.key)) holdCover(2500);
      else { window.clearTimeout(timer); setCovered(document.visibilityState === "hidden"); }
    };
    // Releasing the arming keys without a capture key ends the cover early.
    const onModifierUp = (e: KeyboardEvent) => { if (e.key === "Meta" || e.key === "Shift") { window.clearTimeout(timer); timer = window.setTimeout(() => setCovered(document.visibilityState === "hidden"), 1500); } };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") { void navigator.clipboard?.writeText(" ").catch(() => undefined); holdCover(2500); }
    };
    const onVisibility = () => setCovered(document.visibilityState === "hidden");
    const onBeforePrint = () => setCovered(true);
    const onAfterPrint = () => setCovered(false);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("keyup", onModifierUp, true);
    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("keyup", onModifierUp, true);
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timer);
    };
  }, []);

  if (!SCREENSHOT_PROTECTION) return null;
  return (
    <>
      {/* Nothing of the page is printed, even if the cover cannot be painted in time. */}
      <style>{"@media print { body { display: none !important; } }"}</style>
      {covered && (
        <div role="alert" className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-2 bg-slate-950 text-center text-white">
          <Lock size={32} /><p className="max-w-xs text-sm">Screenshots and screen recording are not allowed on this site.</p>
        </div>
      )}
    </>
  );
}
