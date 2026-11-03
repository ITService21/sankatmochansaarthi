import { FormEvent, useState } from "react";
import { AppButton, AppInput, AppModal, AppSelect, AppTable, ErrorState, MultiCheckList, TabBar, useToast } from "../../shared/components";
import { useAsync } from "../../shared/hooks/useAsync";
import { useMutation } from "../../shared/hooks/useMutation";
import { useTaxonomyOptions } from "../academic/components/useTaxonomyOptions";
import { Member, examsApi } from "../exams/api/exams.api";
import { PageHeader, Pill } from "../exams/components/ui";

/** Organisation owner: teachers (with class + subject assignment), students, and batches. New people get a temporary password and must change it on first login. */
export function PeoplePage() {
  const [tab, setTab] = useState<"teacher" | "student" | "batches">("teacher");
  const people = useAsync(() => (tab === "batches" ? Promise.resolve([] as Member[]) : examsApi.members(tab)), [tab]);
  const batches = useAsync(() => examsApi.batches(), []);
  const students = useAsync(() => examsApi.members("student"), []);
  const [adding, setAdding] = useState(false); const [assigning, setAssigning] = useState<Member | null>(null); const [batching, setBatching] = useState(false);
  const toast = useToast();
  const classes = useTaxonomyOptions("classes"); const subjects = useTaxonomyOptions("subjects");
  const name = (o: { value: string | number; label: string }[], id: number) => o.find((x) => x.value === id)?.label ?? id;
  return (
    <div>
      <PageHeader title="Teachers & students" sub="Add your people, assign teachers to classes and subjects, and group students into batches.">
        {tab === "batches" ? <AppButton onClick={() => setBatching(true)}>+ New batch</AppButton> : <AppButton onClick={() => setAdding(true)}>+ Add {tab}</AppButton>}
      </PageHeader>
      <TabBar tabs={[{ key: "teacher", label: "Teachers" }, { key: "student", label: "Students" }, { key: "batches", label: "Batches" }]} active={tab} onChange={(k) => setTab(k as typeof tab)} />
      <div className="mt-4">
        {tab === "batches" ? <AppTable loading={batches.loading} rows={batches.data ?? []} rowKey={(b) => b.id} emptyMessage="No batches yet." columns={[{ key: "name", header: "Batch" }, { key: "students", header: "Students" }]} /> :
          people.error != null ? <ErrorState error={people.error} /> : <AppTable loading={people.loading} rows={people.data ?? []} rowKey={(m) => m.id} emptyMessage={`No ${tab}s yet.`}
            columns={[{ key: "username", header: "Login", render: (m) => <div><p className="font-medium">{m.full_name || m.username}</p><p className="text-xs text-slate-500">{m.username}</p></div> },
              ...(tab === "teacher" ? [{ key: "assignments", header: "Teaches", render: (m: Member) => (m.assignments?.length ? <div className="flex flex-wrap gap-1">{m.assignments.map((a) => <Pill key={`${a.class_id}${a.subject_id}`} tone="blue">{name(classes.options, a.class_id)} · {name(subjects.options, a.subject_id)}</Pill>)}</div> : <span className="text-slate-400">Not assigned</span>) }] : []),
              { key: "actions", header: "", render: (m: Member) => <div className="flex gap-2">{tab === "teacher" && <AppButton variant="secondary" onClick={() => setAssigning(m)}>Assign</AppButton>}<AppButton variant="secondary" onClick={async () => { try { await examsApi.removeMember(m.id); toast.success("Removed from your organisation"); people.reload(); } catch (e) { toast.error((e as Error).message); } }}>Remove</AppButton></div> }]} />}
      </div>
      {adding && <AddMember type={tab === "student" ? "student" : "teacher"} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); people.reload(); students.reload(); }} />}
      {assigning && <AssignTeacher teacher={assigning} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); people.reload(); }} />}
      {batching && <NewBatch students={students.data ?? []} onClose={() => setBatching(false)} onSaved={() => { setBatching(false); batches.reload(); }} />}
    </div>
  );
}

function AddMember({ type, onClose, onSaved }: { type: "teacher" | "student"; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ username: "", password: "", full_name: "", email: "" }); const [touched, setTouched] = useState(false);
  const err = !/^[A-Za-z0-9._-]{3,64}$/.test(v.username) ? "Username: 3+ letters, numbers, dot, dash or underscore (no spaces)" : v.password.length < 8 ? "Temporary password must be at least 8 characters" : "";
  const save = useMutation(async () => { await examsApi.addMember({ member_type: type, username: v.username, password: v.password, ...(v.full_name ? { full_name: v.full_name } : {}), ...(v.email ? { email: v.email } : {}) }); onSaved(); });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!err) void save.run(); };
  return (
    <AppModal open compact title={`Add ${type}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <AppInput required label="Username" value={v.username} onChange={(e) => setV({ ...v, username: e.target.value })} /><AppInput required label="Temporary password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} hint="They are asked to change it at first login." />
        <AppInput label="Full name" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /><AppInput label="Email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        {touched && err && <p role="alert" className="text-sm text-red-600">{err}</p>}{save.error != null && <ErrorState error={save.error} />}
        <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton type="submit" loading={save.loading}>Add</AppButton></div>
      </form>
    </AppModal>
  );
}

function AssignTeacher({ teacher, onClose, onSaved }: { teacher: Member; onClose: () => void; onSaved: () => void }) {
  const classes = useTaxonomyOptions("classes"); const subjects = useTaxonomyOptions("subjects");
  const [pairs, setPairs] = useState<{ class_id: string; subject_id: string }[]>((teacher.assignments ?? []).map((a) => ({ class_id: String(a.class_id), subject_id: String(a.subject_id) })));
  const save = useMutation(async () => { await examsApi.assignTeacher(teacher.id, pairs.filter((p) => p.class_id && p.subject_id).map((p) => ({ class_id: +p.class_id, subject_id: +p.subject_id }))); onSaved(); });
  return (
    <AppModal open title={`Classes & subjects: ${teacher.full_name || teacher.username}`} onClose={onClose}>
      <div className="space-y-2">{pairs.map((p, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"><AppSelect label="Class" placeholder="Select…" options={classes.options} value={p.class_id} onChange={(v) => setPairs(pairs.map((x, n) => (n === i ? { ...x, class_id: v } : x)))} /><AppSelect label="Subject" placeholder="Select…" options={subjects.options} value={p.subject_id} onChange={(v) => setPairs(pairs.map((x, n) => (n === i ? { ...x, subject_id: v } : x)))} /><AppButton variant="secondary" onClick={() => setPairs(pairs.filter((_, n) => n !== i))}>×</AppButton></div>)}
        <AppButton variant="secondary" onClick={() => setPairs([...pairs, { class_id: "", subject_id: "" }])}>+ Add class & subject</AppButton></div>
      {save.error != null && <ErrorState error={save.error} />}
      <div className="mt-3 flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton loading={save.loading} onClick={() => void save.run()}>Save</AppButton></div>
    </AppModal>
  );
}

function NewBatch({ students, onClose, onSaved }: { students: Member[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(""); const [ids, setIds] = useState<number[]>([]);
  const save = useMutation(async () => { await examsApi.createBatch({ name: name.trim(), student_ids: ids }); onSaved(); });
  return (
    <AppModal open compact title="New batch" onClose={onClose}>
      <div className="space-y-3"><AppInput required label="Batch name" value={name} onChange={(e) => setName(e.target.value)} /><MultiCheckList label="Students" options={students.map((s) => ({ id: s.id, label: s.full_name || s.username }))} value={ids} onChange={setIds} />
        {save.error != null && <ErrorState error={save.error} />}<div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton disabled={!name.trim()} loading={save.loading} onClick={() => void save.run()}>Create</AppButton></div></div>
    </AppModal>
  );
}
