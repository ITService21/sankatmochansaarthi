import { useWorkspaceBase } from "./useWorkspaceBase";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppButton, AppInput, AppModal, AppSelect, ErrorState, LoadingState, useToast } from "../../shared/components";
import { useAsync } from "../../shared/hooks/useAsync";
import { useMutation } from "../../shared/hooks/useMutation";
import { useTaxonomyOptions } from "../academic/components/useTaxonomyOptions";
import { Paper, PatternRow, QType, examsApi } from "../exams/api/exams.api";
import { PageHeader, Pill, Section, openBlob, marksText } from "../exams/components/ui";
import { QuestionForm } from "./QuestionBankPage";

const TYPES: QType[] = ["mcq", "short", "medium", "long"];

/** Paper builder: automatic selection from a pattern, manual search/reorder/remove/marks, custom questions, sets A–E, publish and PDF download. */
export function PaperBuilderPage() {
  const base = useWorkspaceBase();
  const id = Number(useParams().id);
  const { data: paper, error, loading, reload } = useAsync(() => examsApi.paper(id), [id]);
  const toast = useToast();
  const [setLabel, setSetLabel] = useState("A");
  const [picking, setPicking] = useState(false);
  const [custom, setCustom] = useState(false);
  const [pattern, setPattern] = useState<{ question_type: QType; count: string; marks: string; difficulty: string }[]>([{ question_type: "mcq", count: "10", marks: "1", difficulty: "" }, { question_type: "short", count: "5", marks: "2", difficulty: "" }]);
  const [sets, setSets] = useState("1");
  const chapters = useTaxonomyOptions("chapters", { board_id: paper?.board_id, class_id: paper?.class_id, subject_id: paper?.subject_id }, !!paper);
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const auto = useMutationAuto(paper, pattern, chapterIds, sets, () => { toast.success("Questions selected"); reload(); });
  if (loading && !paper) return <LoadingState />;
  if (error || !paper) return <ErrorState error={error} />;
  const draft = paper.status === "draft";
  const current = paper.sets.find((s) => s.label === setLabel);
  const labels = paper.sets.length ? paper.sets.map((s) => s.label) : ["A"];

  const saveItems = async (items: { question_id: number; marks?: number }[]) => { try { await examsApi.setQuestions(id, setLabel, items); reload(); } catch (e) { toast.error((e as Error).message); } };
  const move = (i: number, d: -1 | 1) => { const a = [...(current?.questions ?? [])]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; void saveItems(a.map((q) => ({ question_id: q.question_id, marks: q.marks }))); };
  const pdf = async (key: boolean) => { try { openBlob(await examsApi.paperPdf(id, setLabel, key), `${paper.title}-set-${setLabel}${key ? "-key" : ""}.pdf`, true); } catch (e) { toast.error((e as Error).message); } };
  const publish = async () => { try { await examsApi.publishPaper(id); toast.success("Paper published: you can now schedule an exam"); reload(); } catch (e) { toast.error((e as Error).message); } };

  return (
    <div>
      <PageHeader title={paper.title} sub={`${paper.exam_name} · ${paper.duration_minutes} min · ${paper.total_marks} marks`}>
        <Link to={`${base}/papers`}><AppButton variant="secondary">← Papers</AppButton></Link>
        <AppButton variant="secondary" onClick={() => void pdf(false)}>Download paper PDF</AppButton>
        <AppButton variant="secondary" onClick={() => void pdf(true)}>Answer key PDF</AppButton>
        {draft ? <AppButton onClick={() => void publish()}>Publish paper</AppButton> : <Pill tone="green">Published</Pill>}
      </PageHeader>

      {draft && <Section title="Automatic selection">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">Define the pattern; the system picks random, non-duplicate questions from the bank. It stops with a clear message if the bank is too small.</p>
          {pattern.map((r, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-5">
              <AppSelect label="Type" options={TYPES.map((t) => ({ value: t, label: t.toUpperCase() }))} value={r.question_type} onChange={(v) => setPattern(pattern.map((x, n) => (n === i ? { ...x, question_type: v as QType } : x)))} />
              <AppInput label="Number" inputMode="numeric" value={r.count} onChange={(e) => setPattern(pattern.map((x, n) => (n === i ? { ...x, count: e.target.value } : x)))} />
              <AppInput label="Marks each" inputMode="decimal" value={r.marks} onChange={(e) => setPattern(pattern.map((x, n) => (n === i ? { ...x, marks: e.target.value } : x)))} />
              <AppSelect label="Difficulty" placeholder="Any" options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} value={r.difficulty} onChange={(v) => setPattern(pattern.map((x, n) => (n === i ? { ...x, difficulty: v } : x)))} />
              <AppButton variant="secondary" onClick={() => setPattern(pattern.filter((_, n) => n !== i))}>Remove</AppButton>
            </div>))}
          <div className="grid gap-3 sm:grid-cols-3">
            <AppSelect label="Chapters (optional)" placeholder="All chapters" options={chapters.options} value={chapterIds[0] ?? ""} onChange={(v) => setChapterIds(v ? [v] : [])} />
            <AppSelect label="Paper sets" options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 1 ? "1 (Set A)" : `${n} (Sets A–${String.fromCharCode(64 + n)})` }))} value={sets} onChange={setSets} />
            <div className="flex items-end gap-2"><AppButton variant="secondary" onClick={() => setPattern([...pattern, { question_type: "mcq", count: "5", marks: "1", difficulty: "" }])}>+ Row</AppButton><AppButton loading={auto.loading} onClick={() => void auto.run()}>Select questions</AppButton></div>
          </div>
          <p className="text-xs text-slate-500">Total: {pattern.reduce((a, r) => a + (Number(r.count) || 0) * (Number(r.marks) || 0), 0)} marks from {pattern.reduce((a, r) => a + (Number(r.count) || 0), 0)} questions</p>
          {auto.error != null && <ErrorState error={auto.error} />}
        </div>
      </Section>}

      <Section title={`Set ${setLabel} questions`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {labels.map((l) => <button key={l} onClick={() => setSetLabel(l)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${l === setLabel ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}`}>Set {l}</button>)}
          {draft && <><AppButton variant="secondary" onClick={() => setPicking(true)}>+ Add from bank</AppButton><AppButton variant="secondary" onClick={() => setCustom(true)}>+ Custom question</AppButton></>}
          <span className="ml-auto text-sm font-semibold text-slate-700">Set total: {current?.total_marks ?? 0} marks</span>
        </div>
        {!current?.questions.length ? <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">No questions in this set yet.</p> : (
          <ol className="space-y-2">
            {current.questions.map((q, i) => (
              <li key={q.question_id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <span className="mt-0.5 w-7 shrink-0 text-center text-sm font-bold text-slate-500">{i + 1}</span>
                <div className="min-w-0 flex-1"><p className="text-sm">{q.body}</p><p className="mt-1 text-xs text-slate-500"><Pill tone="blue">{q.question_type.toUpperCase()}</Pill> {q.difficulty} · {q.chapter_name}</p></div>
                {draft ? <div className="flex shrink-0 items-center gap-1">
                  <input aria-label="Marks" defaultValue={q.marks} onBlur={(e) => { const m = Number(e.target.value); if (m > 0 && m !== q.marks) void saveItems(current.questions.map((x) => ({ question_id: x.question_id, marks: x.question_id === q.question_id ? m : x.marks }))); }} className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-center text-sm" />
                  <button aria-label="Move up" onClick={() => move(i, -1)} className="rounded p-1.5 hover:bg-slate-100"><ArrowUp size={16} /></button><button aria-label="Move down" onClick={() => move(i, 1)} className="rounded p-1.5 hover:bg-slate-100"><ArrowDown size={16} /></button>
                  <button aria-label="Remove" onClick={() => void saveItems(current.questions.filter((x) => x.question_id !== q.question_id).map((x) => ({ question_id: x.question_id, marks: x.marks })))} className="rounded p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button></div> : <Pill>{marksText(q.marks)}</Pill>}
              </li>))}
          </ol>)}
      </Section>

      {picking && <PickFromBank paper={paper} existing={(current?.questions ?? []).map((q) => q.question_id)} onClose={() => setPicking(false)} onAdd={async (ids) => { setPicking(false); await saveItems([...(current?.questions ?? []).map((q) => ({ question_id: q.question_id, marks: q.marks })), ...ids.map((question_id) => ({ question_id }))]); }} />}
      {custom && <QuestionForm question={null} fixed={{ board_id: paper.board_id, class_id: paper.class_id, subject_id: paper.subject_id }} onClose={() => setCustom(false)} onSaved={async (q) => { setCustom(false); await saveItems([...(current?.questions ?? []).map((x) => ({ question_id: x.question_id, marks: x.marks })), { question_id: q.id }]); }} />}
    </div>
  );
}

/** Wraps the auto-select call (kept out of the component body so hooks stay unconditional). */
function useMutationAuto(paper: Paper | null, pattern: { question_type: QType; count: string; marks: string; difficulty: string }[], chapterIds: string[], sets: string, done: () => void) {
  return useMutation(async () => {
    const rows: PatternRow[] = pattern.filter((r) => Number(r.count) > 0).map((r) => ({ question_type: r.question_type, count: Number(r.count), ...(Number(r.marks) > 0 ? { marks: Number(r.marks) } : {}), ...(r.difficulty ? { difficulty: r.difficulty as PatternRow["difficulty"] } : {}) }));
    await examsApi.autoSelect(paper!.id, { pattern: rows, chapter_ids: chapterIds.map(Number), sets: Number(sets) });
    done();
  });
}

/** Search the bank (limited to the paper's board/class/subject) and tick questions to add. */
function PickFromBank({ paper, existing, onClose, onAdd }: { paper: Paper; existing: number[]; onClose: () => void; onAdd: (ids: number[]) => void }) {
  const [q, setQ] = useState(""); const [type, setType] = useState("");
  const [chosen, setChosen] = useState<number[]>([]);
  const list = useAsync(() => examsApi.questions({ board_id: paper.board_id, class_id: paper.class_id, subject_id: paper.subject_id, q, question_type: type, page_size: 50 }), [q, type]);
  return (
    <AppModal open title="Add questions from the bank" onClose={onClose}>
      <div className="mb-2 grid gap-2 sm:grid-cols-2"><AppInput label="Search" value={q} onChange={(e) => setQ(e.target.value)} /><AppSelect label="Type" placeholder="All" options={TYPES.map((t) => ({ value: t, label: t.toUpperCase() }))} value={type} onChange={setType} /></div>
      <div className="max-h-80 space-y-1 overflow-auto">{(list.data?.data ?? []).filter((x) => !existing.includes(x.id)).map((x) => (
        <label key={x.id} className="flex cursor-pointer items-start gap-2 rounded-lg p-2 hover:bg-slate-50"><input type="checkbox" className="mt-1" checked={chosen.includes(x.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, x.id] : chosen.filter((i) => i !== x.id))} /><span className="text-sm">{x.body}<span className="block text-xs text-slate-500">{x.question_type.toUpperCase()} · {x.difficulty} · {x.marks} marks · {x.chapter_name}</span></span></label>))}
        {!list.loading && !(list.data?.data ?? []).length && <p className="p-4 text-center text-sm text-slate-500">No matching questions.</p>}</div>
      <div className="mt-3 flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton disabled={!chosen.length} onClick={() => onAdd(chosen)}>Add {chosen.length || ""} selected</AppButton></div>
    </AppModal>
  );
}
