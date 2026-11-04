import { SecureViewer } from "./SecureViewer";

/** Thin alias kept for existing callers: every preview now goes through the secure canvas viewer. */
export function PdfPreview({ load, title, className = "" }: { load: () => Promise<Blob>; title: string; className?: string }) {
  return <SecureViewer load={load} title={title} className={className} />;
}
