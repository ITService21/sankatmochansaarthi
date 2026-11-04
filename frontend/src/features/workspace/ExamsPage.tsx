import { useWorkspaceBase } from "./useWorkspaceBase";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { AppButton, AppInput, AppModal, AppSelect, AppTable, ErrorState, MultiCheckList, useToast } from "../../shared/components";
import { AppCheckbox } from "../../shared/components/AppCheckbox";
import { useAsync } from "../../shared/hooks/useAsync";
import { useMutation } from "../../shared/hooks/useMutation";
import { useTaxonomyOptions } from "../academic/components/useTaxonomyOptions";
import { ExamRow, examsApi } from "../exams/api/exams.api";
import { PageHeader, Pill, when } from "../exams/components/ui";
import { useAuth } from "../../shared/auth/AuthContext";

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** Exams the user runs: schedule new ones (online or offline), assign them, open an exam to monitor and review. */
export function ExamsPage() {
  const base = useWorkspaceBase();
  const list = useAsync(() => examsApi.exams(), []);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<ExamRow | null>(null);
  return (
    <div>
      <PageHeader title="Exams" sub="Schedule published papers, assign them to students, and track submissions."><AppButton onClick={() => setCreating(true)}>+ Schedule exam</AppButton></PageHeader>
      {list.error != null ? <ErrorState error={list.error} /> : (
        <AppTable loading={list.loading} rows={list.data ?? []} rowKey={(e) => e.id} emptyMessage="No exams scheduled yet."
          columns={[
            { key: "name", header: "Exam", render: (e) => <Link className="font-medium text-indigo-700 hover:underline" to={`${base}/exams/${e.id}`}>{e.name}</Link> },
            { key: "mode", header: "Mode", render: (e) => <Pill tone={e.mode === "online" ? "blue" : "amber"}>{e.mode}</Pill> },
            { key: "starts_at", header: "Window", render: (e) => <span className="text-xs">{when(e.starts_at)}<br />→ {when(e.ends_at)}</span> },
            { key: "assigned", header: "Assigned" }, { key: "attempts", header: "Attempts" }, { key: "to_review", header: "To review", render: (e) => (e.to_review ? <Pill tone="amber">{e.to_review}</Pill> : 0) },
            { key: "actions", header: "", render: (e) => <AppButton variant="secondary" onClick={() => setAssigning(e)}>Assign</AppButton> },
          ]} />
      )}
      {creating && <ScheduleExam onClose={() => setCreating(false)} onSaved={() => { setCreating(false); list.reload(); }} />}
      {assigning && <AssignExam exam={assigning} onClose={() => { setAssigning(null); list.reload(); }} />}
    </div>
  );
}

function ScheduleExam({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const papers = useAsync(() => examsApi.papers(), []);
  const now = new Date();
  const [v, setV] = useState({ paper_id: "", name: "", description: "", mode: "online", starts_at: localInput(new Date(now.getTime() + 3_600_000)), ends_at: localInput(new Date(now.getTime() + 4 * 3_600_000)), duration_minutes: "", max_attempts: "1", negative_marking: "0", allow_review: true, requires_teacher_review: true, price: "0", is_public: false });
  const [touched, setTouched] = useState(false);
  const err = !v.paper_id ? "Choose a published paper" : v.name.trim().length < 2 ? "Name the exam" : new Date(v.ends_at) <= new Date(v.starts_at) ? "The end must be after the start" : "";
  const save = useMutation(async () => {
    await examsApi.createExam({ paper_id: +v.paper_id, name: v.name.trim(), description: v.description.trim() || null, mode: v.mode, starts_at: new Date(v.starts_at).toISOString(), ends_at: new Date(v.ends_at).toISOString(), ...(v.duration_minutes ? { duration_minutes: +v.duration_minutes } : {}),
      max_attempts: +v.max_attempts || 1, negative_marking: Number(v.negative_marking) || 0, allow_review: v.allow_review, requires_teacher_review: v.requires_teacher_review, price_minor_units: Math.round((Number(v.price) || 0) * 100), is_public: v.is_public });
    onSaved();
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!err) void save.run(); };
  const published = (papers.data ?? []).filter((p) => p.status === "published").map((p) => ({ value: p.id, label: `${p.title} (${p.total_marks} marks)` }));
  return (
    <AppModal open title="Schedule exam" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <AppSelect required label="Question paper" placeholder="Select…" options={published} value={v.paper_id} onChange={(x) => setV({ ...v, paper_id: x })} hint={published.length ? undefined : "No published papers yet. Publish one in Question Papers first."} />
        <div className="grid gap-3 sm:grid-cols-2">
          <AppInput required label="Exam name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <AppSelect label="Mode" options={[{ value: "online", label: "Online (on the website)" }, { value: "offline", label: "Offline (paper + answer-sheet upload)" }]} value={v.mode} onChange={(x) => setV({ ...v, mode: x })} />
          <AppInput required label="Starts" type="datetime-local" value={v.starts_at} onChange={(e) => setV({ ...v, starts_at: e.target.value })} />
          <AppInput required label={v.mode === "offline" ? "Upload deadline" : "Ends"} type="datetime-local" value={v.ends_at} onChange={(e) => setV({ ...v, ends_at: e.target.value })} />
          {v.mode === "online" && <AppInput label="Duration (minutes; blank = paper's)" inputMode="numeric" value={v.duration_minutes} onChange={(e) => setV({ ...v, duration_minutes: e.target.value })} />}
          <AppInput label="Maximum attempts" inputMode="numeric" value={v.max_attempts} onChange={(e) => setV({ ...v, max_attempts: e.target.value })} />
          <AppInput label="Negative marking (0–1 of the marks)" inputMode="decimal" value={v.negative_marking} onChange={(e) => setV({ ...v, negative_marking: e.target.value })} hint="0.25 = a wrong MCQ loses a quarter of its marks." />
          <AppInput label="Price (₹, 0 = free)" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
        </div>
        <AppInput label="Description (shown in the catalogue)" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        <div className="space-y-1"><AppCheckbox label="Students may review answers after results" checked={v.allow_review} onChange={(e) => setV({ ...v, allow_review: e.target.checked })} />
          <AppCheckbox label="A teacher must approve marks before students see them" checked={v.requires_teacher_review} onChange={(e) => setV({ ...v, requires_teacher_review: e.target.checked })} />
          <AppCheckbox label="List in the public test catalogue (students can find and buy it)" checked={v.is_public} onChange={(e) => setV({ ...v, is_public: e.target.checked })} /></div>
        {touched && err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        {save.error != null && <ErrorState error={save.error} />}
        <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton type="submit" loading={save.loading}>Schedule</AppButton></div>
      </form>
    </AppModal>
  );
}

/** Assign to individual students, a class (by student profile), a batch, or the whole organisation. */
export function AssignExam({ exam, onClose }: { exam: { id: number; name: string }; onClose: () => void }) {
  const { user } = useAuth();
  const org = user?.role === "Organisation" || user?.role === "Teacher";
  const students = useAsync(() => (org ? examsApi.members("student") : Promise.resolve([])), []);
  const batches = useAsync(() => (user?.role === "Organisation" ? examsApi.batches() : Promise.resolve([])), []);
  const classes = useTaxonomyOptions("classes");
  const [ids, setIds] = useState<number[]>([]); const [classId, setClassId] = useState(""); const [batchId, setBatchId] = useState(""); const [whole, setWhole] = useState(false);
  const toast = useToast();
  const save = useMutation(async () => {
    const r = await examsApi.assign(exam.id, { ...(ids.length ? { student_ids: ids } : {}), ...(classId ? { class_id: +classId } : {}), ...(batchId ? { batch_id: +batchId } : {}), ...(whole ? { whole_organisation: true } : {}) });
    toast.success(`${r.assigned} student(s) assigned · ${r.newly_assigned} notified`); onClose();
  });
  return (
    <AppModal open title={`Assign: ${exam.name}`} onClose={onClose}>
      <div className="space-y-3">
        <AppCheckbox label="Whole organisation (every student)" checked={whole} onChange={(e) => setWhole(e.target.checked)} />
        <AppSelect label="Class (students whose profile has this class)" placeholder="None" options={classes.options} value={classId} onChange={setClassId} />
        {(batches.data ?? []).length > 0 && <AppSelect label="Batch" placeholder="None" options={(batches.data ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b.students})` }))} value={batchId} onChange={setBatchId} />}
        {(students.data ?? []).length > 0 && <MultiCheckList label="Individual students" options={(students.data ?? []).map((s) => ({ id: s.id, label: s.full_name || s.username }))} value={ids} onChange={setIds} />}
        {save.error != null && <ErrorState error={save.error} />}
        <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton loading={save.loading} disabled={!whole && !classId && !batchId && !ids.length} onClick={() => void save.run()}>Assign</AppButton></div>
      </div>
    </AppModal>
  );
}
