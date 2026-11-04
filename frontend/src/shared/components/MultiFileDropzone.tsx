import { FileText, Image as ImageIcon, X } from "lucide-react";
import { useRef, useState } from "react";
import { FieldLabel } from "./FieldLabel";
import { formatFileSize } from "../utils/format-file-size";

const iconFor = (name: string) => (/\.(jpe?g|png)$/i.test(name) ? ImageIcon : FileText);

/** Drag-and-drop picker for several files at once, with a removable list. The server re-checks every file's real type. */
export function MultiFileDropzone({ files, onFiles, accept, label, hint, max, error, required }: {
  files: File[]; onFiles: (f: File[]) => void; accept: string; label: string; hint?: string; max: number; error?: string; required?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const add = (list: FileList | null) => {
    if (!list?.length) return;
    const key = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;
    const seen = new Set(files.map(key));
    onFiles([...files, ...[...list].filter((f) => !seen.has(key(f)))].slice(0, max));
  };
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm ${over ? "border-indigo-500 bg-indigo-50" : error ? "border-red-400" : "border-slate-300"}`}>
        <span className="font-medium text-slate-700">Drop files here or click to choose</span>
        {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
        <input ref={input} type="file" multiple accept={accept} className="hidden" aria-label={label} onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {files.length > 0 && (
        <ul className="mt-2 divide-y rounded-xl border bg-white">
          {files.map((f, i) => {
            const Icon = iconFor(f.name);
            return (
              <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Icon size={18} className="shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-slate-500">{formatFileSize(f.size)}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onFiles(files.filter((_, j) => j !== i))} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"><X size={16} /></button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
