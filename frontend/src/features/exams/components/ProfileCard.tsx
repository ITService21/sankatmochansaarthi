import { useEffect, useState } from "react";
import { http } from "../../../shared/api/http-client";
import { AppButton, AppSelect, useToast } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { useTaxonomyOptions } from "../../academic/components/useTaxonomyOptions";

interface Profile { board_id: number | null; class_id: number | null; stream: string | null; subject_ids: number[] }

/** The student's board / class / stream / subjects. Teachers use the class to assign tests, so keeping it filled in matters. */
export function ProfileCard() {
  const { data, reload } = useAsync(() => http.get<Profile>("/students/me/profile"), []);
  const [v, setV] = useState({ board_id: "", class_id: "", stream: "", subject: "" });
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const board = useTaxonomyOptions("boards"); const cls = useTaxonomyOptions("classes"); const subject = useTaxonomyOptions("subjects");
  useEffect(() => { if (data) setV({ board_id: String(data.board_id ?? ""), class_id: String(data.class_id ?? ""), stream: data.stream ?? "", subject: String(data.subject_ids[0] ?? "") }); }, [data]);
  const save = useMutation(async () => { await http.put("/students/me/profile", { board_id: v.board_id ? +v.board_id : null, class_id: v.class_id ? +v.class_id : null, stream: v.stream || null, subject_ids: v.subject ? [+v.subject] : [] }); toast.success("Profile saved"); setOpen(false); reload(); });
  const label = (o: { value: string | number; label: string }[], id: string) => o.find((x) => String(x.value) === id)?.label;
  const filled = data?.board_id && data?.class_id;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate-700"><b>My profile:</b> {filled ? `${label(board.options, v.board_id)} · ${label(cls.options, v.class_id)}${v.stream ? ` · ${v.stream}` : ""}` : "Choose your board and class so your teacher can assign tests."}</p><AppButton variant="secondary" onClick={() => setOpen(!open)}>{open ? "Close" : "Edit"}</AppButton></div>
      {open && <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><AppSelect label="Board" placeholder="Select…" options={board.options} value={v.board_id} onChange={(x) => setV({ ...v, board_id: x })} /><AppSelect label="Class" placeholder="Select…" options={cls.options} value={v.class_id} onChange={(x) => setV({ ...v, class_id: x })} />
        <AppSelect label="Stream" placeholder="Select…" options={[{ value: "science", label: "Science" }, { value: "commerce", label: "Commerce" }, { value: "general", label: "General" }]} value={v.stream} onChange={(x) => setV({ ...v, stream: x })} /><AppSelect label="Main subject" placeholder="Select…" options={subject.options} value={v.subject} onChange={(x) => setV({ ...v, subject: x })} />
        <div className="flex items-end"><AppButton loading={save.loading} onClick={() => void save.run()}>Save</AppButton></div></div>}
    </div>
  );
}
