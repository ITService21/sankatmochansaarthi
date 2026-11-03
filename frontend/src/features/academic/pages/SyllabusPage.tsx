import { FormEvent, useState } from "react";
import { http } from "../../../shared/api/http-client";
import { AppButton, AppCombobox, AppInput, AppModal, AppTable, AppTextarea, ErrorState, useToast } from "../../../shared/components";
import { AppCheckbox } from "../../../shared/components/AppCheckbox";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { TaxonomyPicker, TaxonomyValue, emptyTaxonomy } from "../../exams/components/TaxonomyPicker";
import { PageHeader, Pill } from "../../exams/components/ui";
import { useTaxonomyOptions } from "../components/useTaxonomyOptions";

interface Row { id: number; name: string; academic_year: string; version: string; is_active: number; board_id: number; class_id: number; subject_id: number; chapters: number }
interface Detail extends Row { chapters: any; total_weightage: number }

/** Syllabus management: a syllabus per board + class + subject + year + version, with chapter weightage, topics covered and excluded chapters; plus bulk import. */
export function SyllabusPage() {
  const list = useAsync(() => http.get<Row[]>("/syllabi"), []);
  const [creating, setCreating] = useState(false); const [editing, setEditing] = useState<number | null>(null); const [importing, setImporting] = useState(false);
  return (
    <div>
      <PageHeader title="Syllabus" sub="Which chapters and topics are covered, with weightage, for each academic year and version.">
        <AppButton variant="secondary" onClick={() => setImporting(true)}>Bulk import structure</AppButton><AppButton onClick={() => setCreating(true)}>+ New syllabus</AppButton></PageHeader>
      {list.error != null ? <ErrorState error={list.error} /> : <AppTable loading={list.loading} rows={list.data ?? []} rowKey={(s) => s.id} emptyMessage="No syllabus yet."
        columns={[{ key: "name", header: "Syllabus" }, { key: "academic_year", header: "Year" }, { key: "version", header: "Version" }, { key: "chapters", header: "Chapters" }, { key: "is_active", header: "Status", render: (s) => <Pill tone={s.is_active ? "green" : "slate"}>{s.is_active ? "Active" : "Inactive"}</Pill> },
          { key: "actions", header: "", render: (s) => <AppButton variant="secondary" onClick={() => setEditing(s.id)}>Edit chapters</AppButton> }]} />}
      {creating && <Create onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); list.reload(); setEditing(id); }} />}
      {editing && <Editor id={editing} onClose={() => { setEditing(null); list.reload(); }} />}
      {importing && <Import onClose={() => { setImporting(false); }} />}
    </div>
  );
}

function Create({ onClose, onSaved }: { onClose: () => void; onSaved: (id: number) => void }) {
  const [tax, setTax] = useState<TaxonomyValue>(emptyTaxonomy()); const [v, setV] = useState({ name: "", academic_year: "", version: "1" }); const [touched, setTouched] = useState(false);
  const err = !tax.board_id || !tax.class_id || !tax.subject_id ? "Choose board, class and subject" : v.name.trim().length < 2 ? "Name the syllabus" : !/^\d{4}(-\d{2,4})?$/.test(v.academic_year) ? "Academic year looks like 2026-27" : "";
  const save = useMutation(async () => { const s = await http.post<{ id: number }>("/syllabi", { board_id: +tax.board_id, class_id: +tax.class_id, subject_id: +tax.subject_id, name: v.name.trim(), academic_year: v.academic_year, version: v.version || "1" }); onSaved(s.id); });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!err) void save.run(); };
  return (
    <AppModal open title="New syllabus" onClose={onClose}><form onSubmit={submit} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2"><TaxonomyPicker value={tax} onChange={setTax} withChapter={false} required /><AppInput required label="Name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /><AppInput required label="Academic year" placeholder="2026-27" value={v.academic_year} onChange={(e) => setV({ ...v, academic_year: e.target.value })} /><AppInput label="Version" value={v.version} onChange={(e) => setV({ ...v, version: e.target.value })} /></div>
      {touched && err && <p role="alert" className="text-sm text-red-600">{err}</p>}{save.error != null && <ErrorState error={save.error} />}
      <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton type="submit" loading={save.loading}>Create</AppButton></div></form></AppModal>
  );
}

function Editor({ id, onClose }: { id: number; onClose: () => void }) {
  const d = useAsync(() => http.get<Detail>(`/syllabi/${id}`), [id]);
  const chapters = useTaxonomyOptions("chapters", { board_id: d.data?.board_id, class_id: d.data?.class_id, subject_id: d.data?.subject_id }, !!d.data);
  const [rows, setRows] = useState<{ chapter_id: number; weightage: string; is_active: boolean }[] | null>(null);
  const toast = useToast();
  const cur = rows ?? ((d.data?.chapters as any[]) ?? []).map((c) => ({ chapter_id: c.chapter_id as number, weightage: String(c.weightage), is_active: c.is_active as boolean }));
  const total = cur.filter((r) => r.is_active).reduce((a, r) => a + (Number(r.weightage) || 0), 0);
  const save = useMutation(async () => { await http.put(`/syllabi/${id}/chapters`, { chapters: cur.map((r) => ({ chapter_id: r.chapter_id, weightage: Number(r.weightage) || 0, is_active: r.is_active, topic_ids: [] })) }); toast.success("Syllabus saved"); onClose(); });
  const unused = chapters.options.filter((o) => !cur.some((r) => r.chapter_id === o.value));
  return (
    <AppModal open title={d.data?.name ?? "Syllabus"} onClose={onClose}>
      {d.error != null ? <ErrorState error={d.error} /> : (
        <div className="space-y-2">
          {cur.map((r, i) => <div key={r.chapter_id} className="grid grid-cols-[1fr_90px_auto_auto] items-center gap-2"><span className="truncate text-sm">{chapters.options.find((o) => o.value === r.chapter_id)?.label ?? `Chapter ${r.chapter_id}`}</span>
            <input aria-label="Weightage %" inputMode="decimal" value={r.weightage} onChange={(e) => setRows(cur.map((x, n) => (n === i ? { ...x, weightage: e.target.value } : x)))} className="rounded-lg border border-slate-300 px-2 py-1 text-sm" />
            <AppCheckbox label="Included" checked={r.is_active} onChange={(e) => setRows(cur.map((x, n) => (n === i ? { ...x, is_active: e.target.checked } : x)))} /><button className="text-red-600" aria-label="Remove chapter" onClick={() => setRows(cur.filter((_, n) => n !== i))}>×</button></div>)}
          {unused.length > 0 && <AppCombobox label="Add a chapter" placeholder="Search chapters…" options={unused} value="" onChange={(v) => v && setRows([...cur, { chapter_id: Number(v), weightage: "0", is_active: true }])} />}
          <p className={`text-sm font-semibold ${total > 100 ? "text-red-600" : "text-slate-700"}`}>Total weightage: {total}% {total > 100 && "(cannot exceed 100)"}</p>
          {save.error != null && <ErrorState error={save.error} />}
          <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton disabled={total > 100} loading={save.loading} onClick={() => void save.run()}>Save</AppButton></div>
        </div>)}
    </AppModal>
  );
}

function Import({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('[{"board":"CBSE","class":"Class 10","subject":"Mathematics","chapter":"Real Numbers","topics":["Euclid\'s division lemma"]}]'); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const toast = useToast();
  const run = useMutation(async () => {
    setMsg(null); let rows: unknown;
    try { rows = JSON.parse(text); } catch { setMsg({ ok: false, text: "That is not valid JSON. Check the brackets and quotes." }); return; }
    if (!Array.isArray(rows) || rows.length === 0) { setMsg({ ok: false, text: "Paste a JSON list with at least one row: [ { ... } ]" }); return; }
    const r = await http.post<{ rows: number; created: Record<string, number> }>("/syllabi/import", { rows });
    const made = Object.entries(r.created).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
    const text2 = made.length ? `Imported ${r.rows} row${r.rows === 1 ? "" : "s"}. Newly created: ${made.join(", ")}.` : `Nothing new to add: all ${r.rows} row${r.rows === 1 ? "" : "s"} already exist (boards, classes, subjects, chapters and topics were reused). Edit the rows to import something different.`;
    setMsg({ ok: true, text: text2 }); toast.success(made.length ? "Import complete" : "Already up to date");
  });
  return (
    <AppModal open title="Bulk import academic structure" onClose={onClose}>
      <p className="mb-2 text-sm text-slate-600">One row per chapter, by name: board, class, subject, chapter, optional stream and topics. Missing boards, classes, subjects, chapters and topics are created; existing ones are reused.</p>
      <AppTextarea label="Rows (JSON)" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      {msg && <p role="status" className={`mt-2 rounded-lg p-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}{run.error != null && <ErrorState error={run.error} />}
      <div className="mt-3 flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton loading={run.loading} onClick={() => void run.run()}>Import</AppButton></div>
    </AppModal>
  );
}
