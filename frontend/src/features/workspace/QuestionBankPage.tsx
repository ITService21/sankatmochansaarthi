import { FormEvent, useRef, useState } from "react";
import { AppButton, AppCombobox, AppInput, AppModal, AppPagination, AppSelect, AppTable, AppTextarea, ConfirmDialog, ErrorState, FieldLabel, useToast } from "../../shared/components";
import { AppCheckbox } from "../../shared/components/AppCheckbox";
import { useAsync } from "../../shared/hooks/useAsync";
import { useMutation } from "../../shared/hooks/useMutation";
import { useTaxonomyOptions } from "../academic/components/useTaxonomyOptions";
import { Difficulty, QOption, QType, Question, QuestionInput, examsApi } from "../exams/api/exams.api";
import { TaxonomyPicker, TaxonomyValue, emptyTaxonomy } from "../exams/components/TaxonomyPicker";
import { PageHeader, Pill } from "../exams/components/ui";

const TYPES: { value: QType; label: string }[] = [{ value: "mcq", label: "MCQ" }, { value: "short", label: "Short answer" }, { value: "medium", label: "Medium answer" }, { value: "long", label: "Long answer" }];
const DIFFS: { value: Difficulty; label: string }[] = [{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }];

/** Question bank: search + filter by board/class/subject/chapter/difficulty/type, add/edit (MCQ options or descriptive rubric), bulk import and delete. */
export function QuestionBankPage() {
  const [tax, setTax] = useState<TaxonomyValue>(emptyTaxonomy());
  const [f, setF] = useState({ q: "", question_type: "", difficulty: "" });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<Question | null>(null);
  const list = useAsync(() => examsApi.questions({ ...tax, ...f, page, page_size: 20 }), [JSON.stringify(tax), JSON.stringify(f), page]);
  const toast = useToast();
  const del = useMutation(async () => { await examsApi.deleteQuestion(deleting!.id); setDeleting(null); toast.success("Question deleted"); list.reload(); });

  return (
    <div>
      <PageHeader title="Question bank" sub="One central repository of questions, mapped to board, class, subject, chapter and topic.">
        <AppButton variant="secondary" onClick={() => setImporting(true)}>Bulk import</AppButton>
        <AppButton onClick={() => setEditing("new")}>+ Add question</AppButton>
      </PageHeader>
      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <TaxonomyPicker value={tax} onChange={(v) => { setTax(v); setPage(1); }} optional />
        <AppSelect label="Type" placeholder="All" options={TYPES} value={f.question_type} onChange={(v) => { setF({ ...f, question_type: v }); setPage(1); }} />
        <AppSelect label="Difficulty" placeholder="All" options={DIFFS} value={f.difficulty} onChange={(v) => { setF({ ...f, difficulty: v }); setPage(1); }} />
        <AppInput label="Search wording" value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(1); }} />
      </div>
      {list.error != null ? <ErrorState error={list.error} /> : (
        <>
          <AppTable loading={list.loading} rows={list.data?.data ?? []} rowKey={(q) => q.id} emptyMessage="No questions match. Add one or change the filters."
            columns={[
              { key: "body", header: "Question", className: "max-w-xl", render: (q) => <div><p className="line-clamp-2">{q.body}</p><p className="text-xs text-slate-500">{q.subject_name} · {q.chapter_name}</p></div> },
              { key: "question_type", header: "Type", render: (q) => <Pill tone="blue">{q.question_type.toUpperCase()}</Pill> },
              { key: "difficulty", header: "Level", render: (q) => <Pill tone={q.difficulty === "easy" ? "green" : q.difficulty === "hard" ? "red" : "amber"}>{q.difficulty}</Pill> },
              { key: "marks", header: "Marks" }, { key: "version", header: "v" },
              { key: "actions", header: "", render: (q) => <div className="flex gap-2"><AppButton variant="secondary" onClick={() => setEditing(q)}>Edit</AppButton><AppButton variant="secondary" onClick={() => setDeleting(q)}>Delete</AppButton></div> },
            ]} />
          {list.data && <AppPagination pagination={list.data.pagination} onPage={setPage} />}
        </>
      )}
      {editing && <QuestionForm question={editing === "new" ? null : editing} defaults={tax} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => { setImporting(false); list.reload(); }} />}
      <ConfirmDialog open={!!deleting} title="Delete question?" message="It is removed from the bank. Papers that already use it keep their copy." confirmLabel="Delete" loading={del.loading} error={del.error} onConfirm={() => void del.run()} onCancel={() => setDeleting(null)} />
    </div>
  );
}

/** Add/edit form: taxonomy, type, difficulty, marks, wording, MCQ options with correct answer(s), or the descriptive marking guide. */
export function QuestionForm({ question, defaults, onClose, onSaved, fixed }: { question: Question | null; defaults?: TaxonomyValue; onClose: () => void; onSaved: (q: Question) => void; fixed?: { board_id: number; class_id: number; subject_id: number } }) {
  const [tax, setTax] = useState<TaxonomyValue>(question ? { board_id: String(question.board_id), class_id: String(question.class_id), subject_id: String(question.subject_id), chapter_id: String(question.chapter_id) } : fixed ? { board_id: String(fixed.board_id), class_id: String(fixed.class_id), subject_id: String(fixed.subject_id), chapter_id: "" } : { ...(defaults ?? emptyTaxonomy()) });
  const [topic, setTopic] = useState(String(question?.topic_id ?? ""));
  const [v, setV] = useState({ question_type: (question?.question_type ?? "mcq") as QType, difficulty: (question?.difficulty ?? "medium") as Difficulty, marks: String(question?.marks ?? 1), body: question?.body ?? "", multiple_correct: question?.multiple_correct ?? false,
    explanation: question?.explanation ?? "", expected_answer: question?.expected_answer ?? "", keywords: question?.keywords ?? "", rubric: question?.rubric ?? "" });
  const [options, setOptions] = useState<QOption[]>(question?.options?.length ? question.options : [{ body: "", is_correct: true }, { body: "", is_correct: false }, { body: "", is_correct: false }, { body: "", is_correct: false }]);
  const [touched, setTouched] = useState(false);
  const topics = useTaxonomyOptions("topics", { chapter_id: tax.chapter_id }, !!tax.chapter_id);
  const mcq = v.question_type === "mcq";
  const err = !tax.chapter_id ? "Choose board, class, subject and chapter" : v.body.trim().length < 3 ? "Write the question" : !(Number(v.marks) > 0) ? "Marks must be above zero"
    : mcq ? (options.filter((o) => o.body.trim()).length < 2 ? `Fill in at least two options: only ${options.filter((o) => o.body.trim()).length} filled so far` : new Set(options.filter((o) => o.body.trim()).map((o) => o.body.trim().toLowerCase())).size < options.filter((o) => o.body.trim()).length ? "Two options have the same text: make each option different" : !options.some((o) => o.is_correct && o.body.trim()) ? "Mark the correct option" : !v.multiple_correct && options.filter((o) => o.is_correct && o.body.trim()).length > 1 ? "Only one option can be correct (or switch on multiple correct answers)" : "")
    : "";
  const save = useMutation(async () => {
    const body: QuestionInput = { board_id: +tax.board_id, class_id: +tax.class_id, subject_id: +tax.subject_id, chapter_id: +tax.chapter_id, topic_id: topic ? +topic : null, question_type: v.question_type, difficulty: v.difficulty, marks: Number(v.marks), body: v.body.trim(), multiple_correct: v.multiple_correct,
      options: mcq ? options.filter((o) => o.body.trim()).map((o) => ({ body: o.body.trim(), is_correct: o.is_correct })) : [], explanation: v.explanation.trim() || null, expected_answer: mcq ? null : v.expected_answer.trim() || null, reference_answer: null, keywords: v.keywords.trim() || null, rubric: v.rubric.trim() || null };
    onSaved(question ? await examsApi.updateQuestion(question.id, body) : await examsApi.createQuestion(body));
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!err) void save.run(); };
  const setOpt = (i: number, patch: Partial<QOption>) => setOptions(options.map((o, n) => (n === i ? { ...o, ...patch } : !v.multiple_correct && patch.is_correct ? { ...o, is_correct: false } : o)));

  return (
    <AppModal open title={question ? "Edit question" : "Add question"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        {!fixed && <div className="grid gap-3 sm:grid-cols-2"><TaxonomyPicker value={tax} onChange={setTax} required /></div>}
        {fixed && <div className="grid gap-3 sm:grid-cols-2"><TaxonomyPicker value={tax} onChange={(t) => setTax({ ...t, board_id: String(fixed.board_id), class_id: String(fixed.class_id), subject_id: String(fixed.subject_id) })} required /></div>}
        <AppCombobox label="Topic (optional)" placeholder={tax.chapter_id ? "None" : "Choose a chapter first"} options={topics.options} value={topic} onChange={setTopic} disabled={!tax.chapter_id} />
        <div className="grid gap-3 sm:grid-cols-3">
          <AppSelect required label="Type" options={TYPES} value={v.question_type} onChange={(x) => setV({ ...v, question_type: x as QType, marks: x === "mcq" ? "1" : v.marks })} />
          <AppSelect required label="Difficulty" options={DIFFS} value={v.difficulty} onChange={(x) => setV({ ...v, difficulty: x as Difficulty })} />
          <AppInput required label="Marks" inputMode="decimal" value={v.marks} onChange={(e) => setV({ ...v, marks: e.target.value })} />
        </div>
        <AppTextarea required label="Question" rows={3} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />
        {mcq ? (
          <div>
            <FieldLabel required>Options (tick the correct one)</FieldLabel>
            <div className="space-y-2">{options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="checkbox" aria-label={`Option ${i + 1} is correct`} checked={o.is_correct} onChange={(e) => setOpt(i, { is_correct: e.target.checked })} className="h-4 w-4" />
                <input aria-label={`Option ${i + 1}`} value={o.body} onChange={(e) => setOpt(i, { body: e.target.value })} placeholder={`Option ${i + 1}`} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>))}
            </div>
            <div className="mt-2 flex items-center justify-between"><AppButton variant="secondary" onClick={() => options.length < 8 && setOptions([...options, { body: "", is_correct: false }])}>+ Option</AppButton><AppCheckbox label="Multiple correct answers" checked={v.multiple_correct} onChange={(e) => setV({ ...v, multiple_correct: e.target.checked })} /></div>
            <AppTextarea className="mt-2" label="Explanation of the answer" rows={2} value={v.explanation} onChange={(e) => setV({ ...v, explanation: e.target.value })} />
          </div>
        ) : (
          <>
            <AppTextarea label="Expected / reference answer (optional)" rows={3} value={v.expected_answer} onChange={(e) => setV({ ...v, expected_answer: e.target.value })} hint="Optional. If you write one, the AI marks against it. If left empty, the AI marks from its own subject knowledge and the teacher confirms the marks." />
            <AppInput label="Important keywords (comma separated)" value={v.keywords} onChange={(e) => setV({ ...v, keywords: e.target.value })} />
            <AppTextarea label="Marking rubric" rows={2} value={v.rubric} onChange={(e) => setV({ ...v, rubric: e.target.value })} hint="Optional marking guide: how the marks are split. e.g. 1 mark for the definition, 2 marks for the steps, 1 mark for the correct unit. The AI follows it when giving partial marks." />
          </>
        )}
        {touched && err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        {save.error != null && <ErrorState error={save.error} />}
        <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton type="submit" loading={save.loading}>Save question</AppButton></div>
      </form>
    </AppModal>
  );
}

/** Bulk import: paste/upload a JSON array of questions (same fields as the API) and see which rows were created, duplicate or invalid. */
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState<Awaited<ReturnType<typeof examsApi.importQuestions>> | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [parseErr, setParseErr] = useState("");
  const run = useMutation(async () => {
    let rows: unknown;
    try { rows = JSON.parse(text); } catch { setParseErr("That is not valid JSON."); return; }
    if (!Array.isArray(rows) || !rows.length) { setParseErr("Provide a JSON array with at least one question."); return; }
    setParseErr(""); setRes(await examsApi.importQuestions(rows));
  });
  return (
    <AppModal open title="Bulk import questions" onClose={onClose}>
      <p className="mb-2 text-sm text-slate-600">Paste a JSON array. Each item has board_id, class_id, subject_id, chapter_id, question_type, marks, body and options (MCQ) or expected_answer (descriptive). Up to 500 rows; duplicates are skipped.</p>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
      <AppButton variant="secondary" onClick={() => file.current?.click()}>Choose a .json file</AppButton>
      <AppTextarea className="mt-2" label="Questions JSON" rows={8} value={text} onChange={(e) => setText(e.target.value)} error={parseErr} />
      {run.error != null && <ErrorState error={run.error} />}
      {res && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><p><b>{res.created}</b> created · <b>{res.duplicates}</b> duplicates · <b>{res.errors}</b> invalid</p>{res.results.filter((r) => r.status !== "created").slice(0, 8).map((r) => <p key={r.row} className="text-xs text-red-700">Row {r.row}: {r.message}</p>)}</div>}
      <div className="mt-3 flex justify-end gap-2"><AppButton variant="secondary" onClick={res ? onDone : onClose}>{res ? "Done" : "Close"}</AppButton>{!res && <AppButton loading={run.loading} onClick={() => void run.run()}>Import</AppButton>}</div>
    </AppModal>
  );
}
