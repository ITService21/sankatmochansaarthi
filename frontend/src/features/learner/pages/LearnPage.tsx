import { GraduationCap, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { AppButton, AppPagination, EmptyState, ErrorState, LoadingState } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { TaxonomyItem } from "../../../shared/types";
import { classLabel } from "../../../shared/utils/roman";
import { academicApi } from "../../academic/api/academic.api";
import { publicApi } from "../../site/api/public.api";
import { materialsApi } from "../../study-materials/api/study-materials.api";
import { HierarchyBar } from "../components/HierarchyBar";
import { NoteCard } from "../components/NoteCard";
import { NotePreviewPane } from "../components/NotePreviewPane";
import { useLearnerClass } from "../components/useLearnerClass";
import { WorkspaceSidebar } from "../components/WorkspaceSidebar";

type ChapterItem = TaxonomyItem & { board_id: number; class_id: number; subject_id: number };
type TopicItem = TaxonomyItem & { chapter_id: number };

const CASCADE: Record<string, string[]> = {
  board_id: ["subject_id", "chapter_id", "topic_id"], class_id: ["subject_id", "chapter_id", "topic_id"],
  subject_id: ["chapter_id", "topic_id"], chapter_id: ["topic_id"], topic_id: [],
};

/**
 * Learning workspace. Selection lives in the URL (?board_id&class_id&subject_id&chapter_id&topic_id&q&page&note) so any view is
 * shareable. Hierarchy: Board › Class › Subject › Chapter › Topic — each choice narrows the next and the notes list.
 */
export function LearnPage() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const [learnerClass, setLearnerClass] = useLearnerClass();
  const [showNav, setShowNav] = useState(true);
  const [focus, setFocus] = useState(false);

  const patch = (changes: Record<string, string>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) { if (v) next.set(k, v); else next.delete(k); }
    setParams(next, { replace });
  };
  /**
   * Handles a selection in the hierarchy bar.
   * - Picking a TOPIC or CHAPTER fills its chapter / subject / class / board automatically (they are fixed by the data).
   * - Picking a SUBJECT or CLASS fills the class / board only when there is exactly one possibility.
   * - Changing a higher level clears the levels below it, as before.
   */
  const choose = (key: string, value: string) => {
    const base = { page: "", note: "" };
    if (value && key === "topic_id") {
      const t = allTopics.find((x) => String(x.id) === value);
      const ch = t && allChapters.find((c) => c.id === t.chapter_id);
      if (t && ch) { patch({ ...base, topic_id: value, chapter_id: String(ch.id), subject_id: String(ch.subject_id), class_id: String(ch.class_id), board_id: String(ch.board_id) }); rememberClass(String(ch.class_id)); return; }
    }
    if (value && key === "chapter_id") {
      const ch = allChapters.find((c) => String(c.id) === value);
      if (ch) { patch({ ...base, chapter_id: value, topic_id: "", subject_id: String(ch.subject_id), class_id: String(ch.class_id), board_id: String(ch.board_id) }); rememberClass(String(ch.class_id)); return; }
    }
    const reset = Object.fromEntries((CASCADE[key] ?? []).map((k) => [k, ""]));
    const fill: Record<string, string> = {};
    if (value && (key === "subject_id" || key === "class_id")) {
      const pool = allChapters.filter((c) => openClassIds.has(c.class_id)
        && (key === "subject_id" ? String(c.subject_id) === value : String(c.class_id) === value)
        && (key === "subject_id" ? (!classId || String(c.class_id) === classId) : (!subjectId || String(c.subject_id) === subjectId))
        && (!boardId || String(c.board_id) === boardId));
      const only = (ids: Array<number | undefined>) => { const u = [...new Set(ids)]; return u.length === 1 && u[0] !== undefined ? String(u[0]) : ""; };
      if (key === "subject_id" && !classId) fill.class_id = only(pool.map((c) => c.class_id));
      if (!boardId) fill.board_id = only(pool.map((c) => c.board_id));
    }
    // keep a subject across a class change only if we are not clearing it
    patch({ [key]: value, ...(key === "class_id" || key === "board_id" ? { subject_id: "", chapter_id: "", topic_id: "" } : reset), ...fill, ...base });
    if (key === "class_id") rememberClass(value);
  };
  const rememberClass = (id: string) => { const c = (classesQ.data ?? []).find((x) => String(x.id) === id); if (c) setLearnerClass({ id: c.id, number: c.class_number ?? null, name: c.name }); };

  const boardsQ = useAsync(() => academicApi.options("boards"), []);
  const classesQ = useAsync(() => academicApi.options("classes"), []);
  const subjectsQ = useAsync(() => academicApi.options("subjects"), []);
  const chaptersQ = useAsync(() => academicApi.options("chapters"), []);
  const topicsQ = useAsync(() => academicApi.options("topics"), []);
  const coursesQ = useAsync(() => publicApi.courses(), []);
  const boardId = get("board_id"), classId = get("class_id"), subjectId = get("subject_id"), chapterId = get("chapter_id"), topicId = get("topic_id");

  const allClasses = classesQ.data ?? [];
  const classes = useMemo(() => allClasses.filter((c) => !c.coming_soon), [allClasses]);
  const openClassIds = useMemo(() => new Set(classes.map((c) => c.id)), [classes]);
  const allChapters = useMemo(() => (chaptersQ.data ?? []) as ChapterItem[], [chaptersQ.data]);
  const allTopics = useMemo(() => (topicsQ.data ?? []) as TopicItem[], [topicsQ.data]);
  const nameOf = (list: Array<{ id: number; name: string }> | null | undefined, id: number | undefined) => list?.find((x) => x.id === id)?.name ?? "";
  const className = (id: number | undefined) => { const c = allClasses.find((x) => x.id === id); return c ? classLabel({ class_number: c.class_number ?? null, name: c.name }) : ""; };

  // Sensible default ONLY when nothing is selected at all (never fights a deep link or an auto-filled selection).
  useEffect(() => {
    if (boardId || classId || subjectId || chapterId || topicId || noteId0() || !classes.length || !coursesQ.data) return;
    const withNotes = classes.find((c) => (coursesQ.data!.find((x) => x.id === c.id)?.subject_count ?? 0) > 0);
    patch({ class_id: String((classes.find((c) => c.id === learnerClass?.id) ?? withNotes ?? classes[0]).id) }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, coursesQ.data]);
  function noteId0() { return get("note"); }

  /** Chapters that match the current board / class / subject selection (and belong to an open class). */
  const visibleChapters = allChapters.filter((c) => openClassIds.has(c.class_id) && (!boardId || String(c.board_id) === boardId) && (!classId || String(c.class_id) === classId) && (!subjectId || String(c.subject_id) === subjectId));
  const subjectIds = new Set(allChapters.filter((c) => openClassIds.has(c.class_id) && (!boardId || String(c.board_id) === boardId) && (!classId || String(c.class_id) === classId)).map((c) => c.subject_id));
  const subjectOptions = (subjectsQ.data ?? []).filter((s) => subjectIds.has(s.id)).map((s) => ({ value: s.id, label: s.name }));
  /** Lower levels show where an item lives ("Polynomials — Mathematics · Class XII · CBSE") for whichever parents are not yet chosen, so you can search by any of them. */
  const ctx = (c: { subject_id?: number; class_id?: number; board_id?: number }) =>
    [!subjectId && nameOf(subjectsQ.data, c.subject_id), !classId && className(c.class_id), !boardId && nameOf(boardsQ.data, c.board_id)].filter(Boolean).join(" · ");
  const chapterOptions = visibleChapters.map((c) => ({ value: c.id, label: ctx(c) ? `${c.name} — ${ctx(c)}` : c.name }));
  const visibleChapterIds = new Set(visibleChapters.map((c) => c.id));
  const topicList = allTopics.filter((t) => (chapterId ? String(t.chapter_id) === chapterId : visibleChapterIds.has(t.chapter_id)));
  const topicOptions = topicList.map((t) => {
    const ch = allChapters.find((c) => c.id === t.chapter_id);
    return { value: t.id, label: chapterId || !ch ? t.name : `${t.name} — ${ch.name}${ctx(ch) ? ` · ${ctx(ch)}` : ""}` };
  });
  const ready = true;

  const q = get("q"), page = get("page"), noteId = get("note");
  const typesQ = useAsync(() => academicApi.options("material-types"), []);
  const types = typesQ.data ?? [];
  const typeId = get("type") && types.some((t) => String(t.id) === get("type")) ? get("type") : String(types[0]?.id ?? "");
  const typeName = types.find((t) => String(t.id) === typeId)?.name ?? "Notes";
  const notes = useAsync(
    () => (typeId ? materialsApi.list({ board_id: boardId || undefined, class_id: classId || undefined, subject_id: subjectId || undefined, chapter_id: chapterId || undefined, topic_id: topicId || undefined, q: q || undefined, page: page || undefined, material_type_id: typeId, page_size: 6, sort_by: "title", sort_order: "asc" }) : Promise.resolve(null)),
    [boardId, classId, subjectId, chapterId, topicId, q, page, typeId],
  );

  const subject = nameOf(subjectsQ.data, subjectId ? Number(subjectId) : undefined);
  const chapter = nameOf(allChapters, chapterId ? Number(chapterId) : undefined);
  const topic = nameOf(allTopics, topicId ? Number(topicId) : undefined);
  const cls = allClasses.find((c) => String(c.id) === classId);
  const boardName = nameOf(boardsQ.data, boardId ? Number(boardId) : undefined);
  const title = topic || chapter || subject || "All notes";

  const levels = [
    { key: "board_id", label: "Board", options: (boardsQ.data ?? []).map((b) => ({ value: b.id, label: b.name })), value: boardId, placeholder: "All boards" },
    { key: "class_id", label: "Class", options: classes.map((c) => ({ value: c.id, label: classLabel({ class_number: c.class_number ?? null, name: c.name }) })), value: classId, placeholder: "All classes" },
    { key: "subject_id", label: "Subject", options: subjectOptions, value: subjectId, placeholder: "All subjects" },
    { key: "chapter_id", label: "Chapter", options: chapterOptions, value: chapterId, placeholder: "All chapters" },
    { key: "topic_id", label: "Topic", options: topicOptions, value: topicId, placeholder: "All topics" },
  ];

  /** The notes list or the full-width preview — rendered inside the normal layout or the full-screen focus overlay. */
  const mainContent = (
    <>
          {noteId ? (
            <NotePreviewPane noteId={Number(noteId)} onBack={() => patch({ note: "" })} onChanged={notes.reload} />
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold uppercase text-orange-800">{typeName}</span>
                  <span className="text-slate-600">{[boardName, cls && classLabel({ class_number: cls.class_number ?? null, name: cls.name }), subject].filter(Boolean).join(" • ")}</span>
                </div>
                <h2 className="font-display mt-2 text-4xl font-bold text-slate-900">{title}</h2>
                {chapter && topic && <p className="mt-1 text-sm font-medium text-orange-700">Chapter: {chapter}</p>}
                <div className="relative mt-4 max-w-md">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input aria-label="Search notes" value={q} onChange={(e) => patch({ q: e.target.value, page: "" }, true)} placeholder="Search in these notes…" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {notes.error != null ? <ErrorState error={notes.error} onRetry={notes.reload} />
                : !ready || !typeId || (notes.loading && !notes.data) ? <LoadingState />
                : !notes.data || notes.data.data.length === 0 ? <EmptyState message={q ? "No notes match your search." : `No ${typeName.toLowerCase()} are available for this selection yet. Try another subject, chapter or topic.`} />
                : <>
                    <div className="space-y-4">{notes.data.data.map((m) => <NoteCard key={m.id} m={m} onPreview={(x) => patch({ note: String(x.id) })} onChanged={notes.reload} />)}</div>
                    <AppPagination pagination={notes.data.pagination} onPage={(p) => patch({ page: String(p) })} />
                  </>}
            </>
          )}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><GraduationCap size={22} /></span>
          <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">Saarthi Learning Hub</p><h1 className="font-display text-2xl font-bold text-slate-900">My Learning Workspace</h1></div>
        </div>
        <div className="flex gap-2">
          <AppButton variant="secondary" onClick={() => setShowNav((s) => !s)} disabled={focus}>{showNav ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}{showNav ? "Hide navigation" : "Show navigation"}</AppButton>
          <AppButton variant="secondary" onClick={() => setFocus((f) => !f)}>{focus ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{focus ? "Exit focus" : "Focus on content"}</AppButton>
        </div>
      </div>

      {!focus && <HierarchyBar levels={levels} onChange={choose} />}

      <div className={`grid gap-4 ${showNav && !focus ? "lg:grid-cols-[300px_minmax(0,1fr)]" : ""}`}>
        {showNav && !focus && <WorkspaceSidebar topics={allTopics.filter((t) => String(t.chapter_id) === chapterId)} hasChapter={!!chapterId} topicId={topicId} onTopic={(id) => choose("topic_id", id)} types={types} typeId={typeId} onType={(id) => patch({ type: id === String(types[0]?.id) ? "" : id, note: "", page: "" })} />}
        {!focus && <section className="min-w-0 space-y-4">{mainContent}</section>}
      </div>
      {focus && createPortal(
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#eef1f8] p-3 md:p-4" role="dialog" aria-label="Focus mode">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-card">
            <p className="truncate text-sm font-semibold text-slate-800">{title}<span className="ml-2 font-normal text-slate-500">{[boardName, cls && classLabel({ class_number: cls.class_number ?? null, name: cls.name }), subject].filter(Boolean).join(" • ")}</span></p>
            <AppButton variant="secondary" size="sm" onClick={() => setFocus(false)}><Minimize2 size={15} />Exit focus</AppButton>
          </div>
          <div className="space-y-4">{mainContent}</div>
        </div>,
        document.body,
      )}
    </div>
  );
}
