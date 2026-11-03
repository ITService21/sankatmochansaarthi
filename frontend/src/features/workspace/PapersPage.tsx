import { useWorkspaceBase } from "./useWorkspaceBase";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppButton, AppInput, AppModal, AppTable, AppTextarea, ConfirmDialog, ErrorState } from "../../shared/components";
import { useAsync } from "../../shared/hooks/useAsync";
import { useMutation } from "../../shared/hooks/useMutation";
import { PaperRow, examsApi } from "../exams/api/exams.api";
import { TaxonomyPicker, TaxonomyValue, emptyTaxonomy } from "../exams/components/TaxonomyPicker";
import { PageHeader, Pill } from "../exams/components/ui";

/** All question papers the user may see, with a "New paper" dialog (header details), then the builder opens. */
export function PapersPage() {
  const base = useWorkspaceBase();
  const list = useAsync(() => examsApi.papers(), []);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PaperRow | null>(null);
  const del = useMutation(async () => { await examsApi.deletePaper(deleting!.id); setDeleting(null); list.reload(); });
  return (
    <div>
      <PageHeader title="Question papers" sub="Build papers from the question bank, automatically or by hand, then download the PDF."><AppButton onClick={() => setCreating(true)}>+ New paper</AppButton></PageHeader>
      {list.error != null ? <ErrorState error={list.error} /> : (
        <AppTable loading={list.loading} rows={list.data ?? []} rowKey={(p) => p.id} emptyMessage="No papers yet."
          columns={[
            { key: "title", header: "Paper", render: (p) => <Link className="font-medium text-indigo-700 hover:underline" to={`${base}/papers/${p.id}`}>{p.title}</Link> },
            { key: "status", header: "Status", render: (p) => <Pill tone={p.status === "published" ? "green" : "amber"}>{p.status}</Pill> },
            { key: "questions", header: "Questions (Set A)" }, { key: "sets", header: "Sets" }, { key: "total_marks", header: "Marks" }, { key: "duration_minutes", header: "Minutes" },
            { key: "actions", header: "", render: (p) => <AppButton variant="secondary" onClick={() => setDeleting(p)}>Delete</AppButton> },
          ]} />
      )}
      {creating && <NewPaper onClose={() => setCreating(false)} />}
      <ConfirmDialog open={!!deleting} title="Delete paper?" message="Papers used by an exam cannot be deleted." confirmLabel="Delete" loading={del.loading} error={del.error} onConfirm={() => void del.run()} onCancel={() => setDeleting(null)} />
    </div>
  );
}

function NewPaper({ onClose }: { onClose: () => void }) {
  const base = useWorkspaceBase();
  const nav = useNavigate();
  const [tax, setTax] = useState<TaxonomyValue>(emptyTaxonomy());
  const [v, setV] = useState({ title: "", exam_name: "", institute_name: "", duration_minutes: "60", exam_date: "", instructions: "Answer all questions." });
  const [touched, setTouched] = useState(false);
  const err = !tax.board_id || !tax.class_id || !tax.subject_id ? "Choose board, class and subject" : v.title.trim().length < 2 ? "Give the paper a title" : v.exam_name.trim().length < 2 ? "Enter the examination name" : "";
  const save = useMutation(async () => {
    const p = await examsApi.createPaper({ title: v.title.trim(), exam_name: v.exam_name.trim(), institute_name: v.institute_name.trim() || null, board_id: +tax.board_id, class_id: +tax.class_id, subject_id: +tax.subject_id, duration_minutes: Number(v.duration_minutes) || 60, exam_date: v.exam_date || null, instructions: v.instructions.trim() || null });
    nav(`${base}/papers/${p.id}`);
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!err) void save.run(); };
  return (
    <AppModal open title="New question paper" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2"><TaxonomyPicker value={tax} onChange={setTax} withChapter={false} required />
          <AppInput required label="Paper title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /><AppInput required label="Examination name" value={v.exam_name} onChange={(e) => setV({ ...v, exam_name: e.target.value })} />
          <AppInput label="Institute name" value={v.institute_name} onChange={(e) => setV({ ...v, institute_name: e.target.value })} /><AppInput label="Duration (minutes)" inputMode="numeric" value={v.duration_minutes} onChange={(e) => setV({ ...v, duration_minutes: e.target.value })} />
          <AppInput label="Examination date" type="date" value={v.exam_date} onChange={(e) => setV({ ...v, exam_date: e.target.value })} /></div>
        <AppTextarea label="Student instructions" rows={3} value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} />
        {touched && err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        {save.error != null && <ErrorState error={save.error} />}
        <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton type="submit" loading={save.loading}>Create & build</AppButton></div>
      </form>
    </AppModal>
  );
}
