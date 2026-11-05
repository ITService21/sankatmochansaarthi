import { http, API_BASE } from "../../../shared/api/http-client";

/** Types mirror the backend DTOs for the examination platform. */
export type QType = "mcq" | "short" | "medium" | "long";
export type Difficulty = "easy" | "medium" | "hard";
export interface QOption { id?: number; body: string; is_correct: boolean }
export interface Question {
  id: number; board_id: number; class_id: number; subject_id: number; chapter_id: number; topic_id: number | null; question_type: QType; difficulty: Difficulty; marks: number; body: string;
  multiple_correct: boolean; explanation: string | null; expected_answer: string | null; reference_answer: string | null; keywords: string | null; rubric: string | null; version: number; options: QOption[]; chapter_name?: string; subject_name?: string;
}
export type QuestionInput = Omit<Question, "id" | "version" | "chapter_name" | "subject_name" | "options"> & { options: QOption[] };
export interface PaperQuestion { position: number; question_id: number; version: number; marks: number; question_type: QType; difficulty: Difficulty; body: string; chapter_name: string; options: QOption[]; expected_answer: string | null }
export interface Paper { id: number; title: string; exam_name: string; institute_name: string | null; board_id: number; class_id: number; subject_id: number; duration_minutes: number; instructions: string | null; exam_date: string | null; status: "draft" | "published"; total_marks: number; sets: { label: string; total_marks: number; questions: PaperQuestion[] }[] }
export interface PaperRow { id: number; title: string; exam_name: string; status: "draft" | "published"; total_marks: string; duration_minutes: number; sets: number; questions: number }
export interface PatternRow { question_type: QType; count: number; marks?: number; difficulty?: Difficulty }

export interface ExamRow { id: number; name: string; mode: "online" | "offline"; status: string; starts_at: string; ends_at: string; duration_minutes: number; paper_id: number; assigned: number; attempts: number; to_review: number }
export interface MyExam { id: number; name: string; mode: "online" | "offline"; starts_at: string; ends_at: string; duration_minutes: number; max_attempts: number; price_minor_units: number; owned: boolean; total_marks: number; attempts_used: number; phase: "upcoming" | "open" | "closed" | "cancelled"; latest_attempt: { id: number; status: string; score?: number; total_marks?: number; percentage?: number } | null }
export interface CatalogExam { id: number; name: string; description: string | null; mode: string; starts_at: string; ends_at: string; duration_minutes: number; price_minor_units: number; currency: string; total_marks: number; subject: string; is_free: boolean; owned: boolean }
export interface AttemptState {
  id: number; mode: "online" | "offline"; exam_id: number; exam_name: string; status: string; set_label: string; started_at: string; deadline_at: string; server_now: string; submitted_at: string | null; auto_submitted: boolean;
  questions?: { question_id: number; position: number; question_type: QType; body: string; marks: number; multiple_correct: boolean; options: { id: number; body: string }[] }[];
  answers?: { question_id: number; selected_option_ids: number[]; answer_text: string }[];
  sheets?: Sheet[];
}
export interface Sheet { id: number; page_no: number; mime_type: string; size_bytes: number; original_name: string }
export interface SheetStatus { attempt_id: number; exam_id: number; status: string; deadline_at: string; sheets: Sheet[] }
export interface ReviewQuestion { position: number; question_id: number; question_type: QType; body: string; options: QOption[]; expected_answer: string | null; student_answer: string | null; selected_option_ids: number[]; marks_awarded: number | null; max_marks: number; is_correct: boolean | null; feedback: string | null; marked_by: string | null; ai_marks: number | null; ai_feedback: string | null; confidence: number | null; needs_review: boolean }
export interface Review { attempt: { id: number; status: string; score: number | null; total_marks: number | null; percentage: number | null }; exam: { id: number; name: string; mode: string }; sheets: Sheet[]; questions: ReviewQuestion[] }
export interface AttemptRow { id: number; student_user_id: number; username: string; full_name: string | null; attempt_no: number; status: string; score: string | null; total_marks: string | null; percentage: string | null; submitted_at: string | null; auto_submitted: number; flagged: number }
export interface Result { attempt_id: number; exam_name: string; score: number; total_marks: number; percentage: number; questions: { question_id: number; position: number; body: string; question_type: QType; max_marks: number; marks_awarded: number | null; is_correct: boolean | null; feedback: string | null; your_answer: string | null; selected_option_ids: number[]; options?: QOption[]; expected_answer?: string | null; explanation?: string | null }[] }
export interface Notification { id: number; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }
export interface Member { id: number; username: string; full_name: string | null; email: string | null; is_active: number; assignments?: { class_id: number; subject_id: number }[] }
export interface OrgRow { id: number; name: string; org_type: string; is_active: number; owner_username: string | null; owner_name: string | null; email: string | null; phone: string | null; address: string | null; teachers: number; students: number; created_at: string }

export const examsApi = {
  // question bank
  questions: (q: Record<string, string | number | undefined>) => http.list<Question>("/question-bank/questions", q),
  createQuestion: (b: QuestionInput) => http.post<Question>("/question-bank/questions", b),
  updateQuestion: (id: number, b: QuestionInput) => http.put<Question>(`/question-bank/questions/${id}`, b),
  deleteQuestion: (id: number) => http.delete(`/question-bank/questions/${id}`),
  importQuestions: (questions: unknown[]) => http.post<{ created: number; duplicates: number; errors: number; results: { row: number; status: string; message?: string }[] }>("/question-bank/questions/import", { questions }),
  // papers
  papers: () => http.get<PaperRow[]>("/papers"),
  paper: (id: number) => http.get<Paper>(`/papers/${id}`),
  createPaper: (b: Record<string, unknown>) => http.post<Paper>("/papers", b),
  autoSelect: (id: number, b: { pattern: PatternRow[]; chapter_ids?: number[]; sets?: number }) => http.post<Paper>(`/papers/${id}/auto-select`, b),
  setQuestions: (id: number, label: string, items: { question_id: number; marks?: number }[]) => http.put<Paper>(`/papers/${id}/sets/${label}`, { items }),
  addCustom: (id: number, label: string, q: QuestionInput) => http.post<Paper>(`/papers/${id}/sets/${label}/custom`, q),
  publishPaper: (id: number) => http.post<Paper>(`/papers/${id}/publish`),
  deletePaper: (id: number) => http.delete(`/papers/${id}`),
  paperPdf: (id: number, set: string, key: boolean) => http.blob(`/papers/${id}/pdf?set=${set}&key=${key}`),
  // exams (teacher)
  exams: () => http.get<ExamRow[]>("/exams"),
  exam: (id: number) => http.get<ExamRow & { paper_id: number }>(`/exams/${id}`),
  createExam: (b: Record<string, unknown>) => http.post<ExamRow>("/exams", b),
  cancelExam: (id: number) => http.post(`/exams/${id}/cancel`),
  assign: (id: number, b: Record<string, unknown>) => http.post<{ assigned: number; newly_assigned: number }>(`/exams/${id}/assign`, b),
  examAttempts: (id: number) => http.get<AttemptRow[]>(`/exams/${id}/attempts`),
  publishAll: (id: number) => http.post<{ published: number; skipped: number[] }>(`/exams/${id}/publish-all`),
  review: (id: number) => http.get<Review>(`/attempts/${id}/review`),
  saveReview: (id: number, items: { question_id: number; marks_awarded: number; feedback?: string | null }[]) => http.put<Review>(`/attempts/${id}/review`, { items }),
  publishAttempt: (id: number) => http.post(`/attempts/${id}/publish`),
  evaluate: (id: number) => http.post<{ status: string; error?: string }>(`/attempts/${id}/evaluate?wait=true`),
  sheetFile: (attemptId: number, sheetId: number) => http.blob(`/attempts/${attemptId}/sheets/${sheetId}/file`),
  // students
  myExams: () => http.get<MyExam[]>("/exams/mine"),
  catalog: () => http.get<CatalogExam[]>("/exams/catalog"),
  start: (id: number) => http.post<AttemptState>(`/exams/${id}/start`),
  attempt: (id: number) => http.get<AttemptState>(`/attempts/${id}`),
  saveAnswers: (id: number, answers: { question_id: number; selected_option_ids?: number[]; answer_text?: string }[]) => http.put<{ saved: number; server_now: string; deadline_at: string }>(`/attempts/${id}/answers`, { answers }),
  submit: (id: number) => http.post<AttemptState>(`/attempts/${id}/submit`),
  result: (id: number) => http.get<Result>(`/attempts/${id}/result`),
  sheetStatus: (attemptId: number) => http.get<SheetStatus>(`/attempts/${attemptId}/sheets`),
  removeSheet: (attemptId: number, sheetId: number) => http.delete<SheetStatus>(`/attempts/${attemptId}/sheets/${sheetId}`),
  finalizeSheet: (attemptId: number) => http.post<SheetStatus>(`/attempts/${attemptId}/sheets/finalize`),
  // organisation
  members: (type: "teacher" | "student") => http.get<Member[]>(`/organisations/members?type=${type}`),
  addMember: (b: Record<string, unknown>) => http.post("/organisations/members", b),
  removeMember: (id: number) => http.delete(`/organisations/members/${id}`),
  assignTeacher: (id: number, assignments: { class_id: number; subject_id: number }[]) => http.put(`/organisations/teachers/${id}/assignments`, { assignments }),
  batches: () => http.get<{ id: number; name: string; students: number }[]>("/organisations/batches"),
  createBatch: (b: { name: string; student_ids: number[] }) => http.post("/organisations/batches", b),
  organisations: () => http.get<OrgRow[]>("/organisations"),
  createOrganisation: (b: Record<string, unknown>) => http.post<{ id: number; name: string; owner_user_id: number | null; temporary_password?: string }>("/organisations", b),
  updateOrganisation: (id: number, b: Record<string, unknown>) => http.patch<{ id: number; name: string }>(`/organisations/${id}`, b),
  addOrganisationOwner: (id: number, b: { email: string; password?: string; full_name?: string }) => http.post<{ temporary_password?: string }>(`/organisations/${id}/owner`, b),
  // reports, notifications, profile
  dashboard: () => http.get<Record<string, any>>("/reports/dashboard"),
  examReport: (id: number) => http.get<Record<string, any>>(`/reports/exams/${id}`),
  progress: () => http.get<Record<string, any>>("/reports/me/progress"),
  overview: (from?: string, to?: string) => http.get<Record<string, any>>(`/reports/admin/overview${from || to ? `?${[from && `from=${from}`, to && `to=${to}`].filter(Boolean).join("&")}` : ""}`),
  overviewCsv: (from?: string, to?: string) => http.blob(`/reports/admin/overview?format=csv${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`),
  notifications: () => http.get<{ items: Notification[]; unread: number }>("/notifications"),
  markAllRead: () => http.post("/notifications/read"),
  syllabi: () => http.get<{ id: number; name: string; academic_year: string; version: string; chapters: number }[]>("/syllabi"),
};

/** Uploads answer-sheet pages with progress (fetch cannot report upload progress, so XHR is used here only). */
export function uploadSheets(examId: number, files: File[], replace: boolean, token: string | null, onProgress: (pct: number) => void): Promise<SheetStatus> {
  return new Promise((resolve, reject) => {
    const form = new FormData(); files.forEach((f) => form.append("files", f)); if (replace) form.append("replace", "true");
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/exams/${examId}/sheets`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onerror = () => reject(new Error("Couldn't reach the server. Check your connection and try again."));
    xhr.onload = () => {
      let body: any = null; try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body.data); else reject(new Error(body?.error?.message ?? `Upload failed (${xhr.status})`));
    };
    xhr.send(form);
  });
}
