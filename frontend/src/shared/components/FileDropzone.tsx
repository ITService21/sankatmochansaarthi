import { useRef, useState } from "react";
import { FieldLabel } from "./FieldLabel";
import { formatFileSize } from "../utils/format-file-size";

/** Shared drag-and-drop file picker. Validates extension client-side (server validates for real). */
export function FileDropzone({ file, onFile, accept = "application/pdf", label = "PDF file", error, required }: {
  file: File | null; onFile: (f: File | null) => void; accept?: string; label?: string; error?: string; required?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0] ?? null); }}
        className={`cursor-pointer rounded-md border-2 border-dashed px-4 py-6 text-center text-sm ${over ? "border-indigo-500 bg-indigo-50" : error ? "border-red-400" : "border-slate-300"}`}
      >
        {file ? <span>{file.name} <span className="text-slate-500">({formatFileSize(file.size)})</span></span> : <span className="text-slate-500">Drop a PDF here or click to choose</span>}
        <input ref={input} type="file" accept={accept} className="hidden" aria-label={label} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
