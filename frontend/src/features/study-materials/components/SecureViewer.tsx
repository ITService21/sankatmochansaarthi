import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Lock, Maximize, Minimize, RotateCw, RotateCcw, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../../shared/api/http-client";
import { useAuth } from "../../../shared/auth/AuthContext";
import { AppButton, LoadingState } from "../../../shared/components";
import { useContentProtection } from "./useContentProtection";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

/** Optional per-user watermark (off by default; enable with VITE_VIEWER_WATERMARK=true to make leaked captures traceable). */
const WATERMARK_ENABLED = import.meta.env.VITE_VIEWER_WATERMARK === "true";
const MIN_ZOOM = 0.5, MAX_ZOOM = 3, ZOOM_STEP = 0.25;

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, dpr: number) {
  ctx.save();
  ctx.globalAlpha = 0.11;
  ctx.fillStyle = "#1e293b";
  ctx.font = `600 ${13 * dpr}px Inter, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.rotate((-28 * Math.PI) / 180);
  const stepX = 400 * dpr, stepY = 130 * dpr;
  for (let y = -h; y < h * 2; y += stepY) for (let x = -w; x < w * 2; x += stepX) ctx.fillText(text, x + ((y / stepY) % 2) * (stepX / 2), y);
  ctx.restore();
}

/** One PDF page rendered to a canvas, lazily (only near the viewport) and re-rendered when width or rotation change. */
function PageCanvas({ doc, pageNumber, width, rotation, watermark }: { doc: pdfjs.PDFDocumentProxy; pageNumber: number; width: number; rotation: number; watermark: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 2);
  const [ratio, setRatio] = useState(1.414);

  useEffect(() => {
    if (visible || !holder.current) return;
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: "800px" });
    io.observe(holder.current);
    return () => io.disconnect();
  }, [visible]);

  // Renders on the same <canvas> must never overlap (pdf.js throws), so each run waits for the previous one to finish/cancel.
  const chain = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!visible || !canvas.current || width < 50) return;
    let task: pdfjs.RenderTask | null = null;
    let cancelled = false;
    const prev = chain.current;
    chain.current = (async () => {
      await prev.catch(() => undefined);
      if (cancelled) return;
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const turn = (page.rotate + rotation) % 360;
      const base = page.getViewport({ scale: 1, rotation: turn });
      const viewport = page.getViewport({ scale: width / base.width, rotation: turn });
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.current!;
      c.width = Math.floor(viewport.width * dpr);
      c.height = Math.floor(viewport.height * dpr);
      setRatio(viewport.height / viewport.width);
      const ctx = c.getContext("2d")!;
      task = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      await task.promise;
      if (!cancelled && watermark) drawWatermark(ctx, c.width, c.height, watermark, dpr);
    })().catch((e) => { if (e?.name !== "RenderingCancelledException") console.error("[viewer] render failed", e); });
    return () => { cancelled = true; task?.cancel(); };
  }, [visible, doc, pageNumber, width, rotation, watermark]);

  return (
    <div ref={holder} style={{ width, height: width * ratio }} className="relative mx-auto mb-3 overflow-hidden bg-white shadow-md ring-1 ring-slate-300">
      <canvas ref={canvas} style={{ width: "100%", height: "100%" }} aria-label={`Page ${pageNumber}`} />
    </div>
  );
}

const friendly = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error && /password|invalid pdf|missing pdf/i.test(e.message) ? "This file could not be opened." : "Something went wrong while opening this note.";

const toolBtn = "flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent";

/**
 * In-app PDF reader. The PDF is fetched with the user's session and drawn to <canvas> pages by pdf.js, so there is no
 * native viewer toolbar with Save/Print and it is never turned into a downloadable link. Pages fill the full width of
 * the container. Toolbar: zoom out / in / fit, rotate left / right, fullscreen. See useContentProtection for the
 * (best-effort) capture deterrents.
 * @param load returns the PDF bytes (preview or full file, authorised by the server)
 * @param protect set false to disable deterrents
 */
export function SecureViewer({ load, title, protect = true, className = "" }: { load: () => Promise<Blob>; title: string; protect?: boolean; className?: string }) {
  const { user } = useAuth();
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fitWidth, setFitWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const { obscured } = useContentProtection(root, protect);
  const watermark = WATERMARK_ENABLED ? `${user?.username ?? "guest"} • ID ${user?.id ?? "-"} • Sankatmochan Saarthi • ${new Date().toLocaleDateString()}` : null;

  useEffect(() => {
    let live = true;
    let loaded: pdfjs.PDFDocumentProxy | null = null;
    setDoc(null); setError(null);
    load().then(async (blob) => {
      const data = new Uint8Array(await blob.arrayBuffer());
      loaded = await pdfjs.getDocument({ data }).promise;
      if (live) setDoc(loaded); else void loaded.destroy();
    }).catch((e) => { if (live) setError(friendly(e)); });
    return () => { live = false; void loaded?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Pages fill the whole container (minus a thin 8px gutter); zoom multiplies that "fit width".
  const measure = useCallback(() => { if (area.current) setFitWidth(Math.max(200, area.current.clientWidth - 16)); }, []);
  useEffect(() => {
    measure();
    if (!area.current) return;
    const ro = new ResizeObserver(measure);
    ro.observe(area.current);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void root.current?.requestFullscreen?.(); };
  const zoomBy = (d: number) => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + d) * 100) / 100)));

  return (
    <div ref={root} role="document" aria-label={title} className={`secure-viewer relative select-none rounded-xl bg-slate-200 ${fullscreen ? "flex h-screen flex-col overflow-hidden rounded-none" : ""} ${className}`} style={{ WebkitUserSelect: "none" }}>
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1 rounded-t-xl bg-slate-900 px-3 py-2" role="toolbar" aria-label="Viewer controls">
        <button className={toolBtn} aria-label="Zoom out" title="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => zoomBy(-ZOOM_STEP)}><ZoomOut size={18} /></button>
        <span className="w-14 text-center text-sm font-semibold tabular-nums text-white" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button className={toolBtn} aria-label="Zoom in" title="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => zoomBy(ZOOM_STEP)}><ZoomIn size={18} /></button>
        <button className="mx-1 rounded-lg px-3 py-2 text-xs font-semibold text-white hover:bg-white/15" title="Fit to width" onClick={() => setZoom(1)}>Fit</button>
        <span className="mx-1 h-5 w-px bg-white/25" aria-hidden />
        <button className={toolBtn} aria-label="Rotate left" title="Rotate left" onClick={() => setRotation((r) => (r + 270) % 360)}><RotateCcw size={18} /></button>
        <button className={toolBtn} aria-label="Rotate right" title="Rotate right" onClick={() => setRotation((r) => (r + 90) % 360)}><RotateCw size={18} /></button>
        <span className="ml-auto mr-2 hidden text-xs text-slate-300 sm:inline">{doc ? `${doc.numPages} page${doc.numPages === 1 ? "" : "s"}` : ""}</span>
        <button className={toolBtn} aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
      </div>

      <div ref={area} className={`overflow-auto p-2 ${fullscreen ? "flex-1" : ""}`}>
        {error ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="max-w-sm text-sm text-slate-700">{error}</p>
            <AppButton variant="secondary" onClick={() => setAttempt((a) => a + 1)}><RefreshCw size={16} />Try again</AppButton>
          </div>
        ) : !doc ? <LoadingState message="Opening your note…" /> : (
          <div style={{ width: fitWidth * zoom, margin: "0 auto" }}>
            {Array.from({ length: doc.numPages }, (_, i) => <PageCanvas key={i} doc={doc} pageNumber={i + 1} width={fitWidth * zoom} rotation={rotation} watermark={watermark} />)}
          </div>
        )}
      </div>

      {obscured && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-900/90 text-center text-white backdrop-blur-md">
          <Lock size={28} /><p className="max-w-xs text-sm">Content is hidden while this window is inactive. Click back here to continue reading.</p>
        </div>
      )}
    </div>
  );
}
