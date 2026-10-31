import { Ban, KeyRound, Pencil, ShieldCheck, SlidersHorizontal, Trash2, UserCheck, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { http } from "../../../shared/api/http-client";
import { useAuth } from "../../../shared/auth/AuthContext";
import { AppButton, AppCheckbox, AppInput, DraftNotice, AppModal, AppPagination, AppSelect, AppTable, Column, ConfirmDialog, ErrorState, PasswordInput, StatusBadge } from "../../../shared/components";
import { passwordPolicy } from "../../../shared/forms/validation";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useFormDraft } from "../../../shared/hooks/useFormDraft";
import { useMutation } from "../../../shared/hooks/useMutation";
import { formatDateTime } from "../../../shared/utils/format-date";
import { AdminScopes, roleLabel } from "../../../shared/types";
import { Access, AccessEditor, NO_ACCESS } from "../components/AccessEditor";

interface ManagedUser { id: number; username: string; email: string | null; full_name: string | null; role: string; is_active: boolean; must_change_password: boolean; created_at: string; providers: string[]; permissions?: string[]; scopes?: AdminScopes }
const LEARNER_ROLES = [{ value: "Student", label: "Student" }, { value: "Teacher", label: "Teacher" }];
/** The Super Admin may also create Admin accounts. */
const roleOptions = (isSuper: boolean) => (isSuper ? [...LEARNER_ROLES, { value: "Admin", label: "Admin (delegated staff)" }] : LEARNER_ROLES);

/** Same rule as the server: 3–64 characters of letters, digits, dot, underscore or hyphen (no spaces). */
function usernameProblem(v: string): string | undefined {
  const t = v.trim();
  if (!t) return "Username is required";
  if (t.length < 3) return "Username must be at least 3 characters";
  if (t.length > 64) return "Username must be at most 64 characters";
  if (!/^[A-Za-z0-9._-]+$/.test(t)) return "Use letters, digits, . _ - only — no spaces (e.g. admin_3 or admin.3)";
  return undefined;
}

/** "5 features · 2 boards, 1 class" — one-line summary of an Admin's access for the list. */
function accessSummary(u: ManagedUser): string {
  const n = u.permissions?.length ?? 0;
  const sc = u.scopes;
  const parts = [[sc?.board_ids.length, "board"], [sc?.class_ids.length, "class"], [sc?.subject_ids.length, "subject"]].filter(([c]) => c).map(([c, w]) => `${c} ${w}${c === 1 ? "" : w === "class" ? "es" : "s"}`);
  return `${n} feature${n === 1 ? "" : "s"} · ${parts.length ? parts.join(", ") : "all boards, classes & subjects"}`;
}

/**
 * Account management: search/filter, add, edit, block/unblock, reset password, delete (soft).
 * Super Admin also creates Admin accounts and sets what each one may do ("Access"); delegated Admins only see learners.
 */
export function UsersPage() {
  const { isSuper } = useAuth();
  const [q, setQ] = useState(""); const [role, setRole] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => http.list<ManagedUser>("/admin/users", { q: q || undefined, role: role || undefined, status: status || undefined, page, page_size: 15 }), [q, role, status, page]);
  const [modal, setModal] = useState<{ kind: "create" } | { kind: "edit" | "reset" | "delete" | "access"; user: ManagedUser } | null>(null);
  const act = useMutation(async (path: string) => { await http.post(path); reload(); });

  const cols: Column<ManagedUser>[] = [
    { key: "username", header: "User", render: (u) => <div><p className="font-semibold text-slate-900">{u.full_name || u.username}</p><p className="text-xs text-slate-500">@{u.username}{u.email ? ` · ${u.email}` : ""}</p></div> },
    { key: "role", header: "Role", render: (u) => <div><StatusBadge value={u.role === "Administrator" ? "paid" : u.role === "Admin" ? "published" : "draft"} label={roleLabel(u.role)} />{u.role === "Admin" && <p className="mt-1 max-w-[16rem] text-xs text-slate-500">{accessSummary(u)}</p>}</div> },
    { key: "login", header: "Sign-in", render: (u) => <span className="text-xs text-slate-600">{["Password", ...u.providers.map((p) => p[0].toUpperCase() + p.slice(1))].join(" · ")}</span> },
    { key: "status", header: "Status", render: (u) => <StatusBadge value={u.is_active ? "active" : "failed"} label={u.is_active ? "Active" : "Blocked"} /> },
    { key: "created_at", header: "Joined", render: (u) => formatDateTime(u.created_at) },
    { key: "actions", header: "Actions", render: (u) => u.role === "Administrator" ? <span className="inline-flex items-center gap-1 text-xs text-slate-500"><ShieldCheck size={14} />Protected</span> : (
      <div className="flex flex-nowrap gap-1">
        {u.role === "Admin" && isSuper && <AppButton size="sm" onClick={() => setModal({ kind: "access", user: u })}><SlidersHorizontal size={13} />Access</AppButton>}
        <AppButton size="sm" variant="secondary" onClick={() => setModal({ kind: "edit", user: u })}><Pencil size={13} />Edit</AppButton>
        {u.is_active
          ? <AppButton size="sm" variant="secondary" onClick={() => void act.run(`/admin/users/${u.id}/block`)}><Ban size={13} />Block</AppButton>
          : <AppButton size="sm" onClick={() => void act.run(`/admin/users/${u.id}/unblock`)}><UserCheck size={13} />Unblock</AppButton>}
        <AppButton size="sm" variant="secondary" onClick={() => setModal({ kind: "reset", user: u })}><KeyRound size={13} />Password</AppButton>
        <AppButton size="sm" variant="danger" onClick={() => setModal({ kind: "delete", user: u })}><Trash2 size={13} />Delete</AppButton>
      </div>) },
  ];
  const close = () => setModal(null);
  const done = () => { close(); reload(); };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-2xl font-semibold">Users</h1><p className="text-sm text-slate-600">{isSuper ? "Manage students, teachers and Admin accounts. Blocking signs a user out immediately." : "Manage student and teacher accounts. Blocking signs a user out immediately."}</p></div>
        <AppButton onClick={() => setModal({ kind: "create" })}><UserPlus size={16} />Add user</AppButton>
      </div>
      <div className="mb-4 grid gap-3 rounded-2xl border bg-white p-4 shadow-card sm:grid-cols-3">
        <AppInput label="Search" placeholder="Username, email or name" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <AppSelect label="Role" placeholder="All roles" options={roleOptions(isSuper)} value={role} onChange={(v) => { setRole(v); setPage(1); }} />
        <AppSelect label="Status" placeholder="All" options={[{ value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }]} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
      </div>
      {act.error != null && <div className="mb-3"><ErrorState error={act.error} /></div>}
      {error != null ? <ErrorState error={error} onRetry={reload} /> : (
        <>
          <AppTable columns={cols} rows={data?.data ?? []} rowKey={(u) => u.id} loading={loading} emptyMessage="No users match these filters" />
          {data && data.pagination.total_items > 0 && <AppPagination pagination={data.pagination} onPage={setPage} />}
        </>
      )}
      {modal?.kind === "create" && <UserForm onClose={close} onSaved={done} />}
      {modal?.kind === "edit" && <UserForm user={modal.user} onClose={close} onSaved={done} />}
      {modal?.kind === "access" && <AccessForm user={modal.user} onClose={close} onSaved={done} />}
      {modal?.kind === "reset" && <ResetForm user={modal.user} onClose={close} onSaved={done} />}
      {modal?.kind === "delete" && <DeleteConfirm user={modal.user} onClose={close} onDone={done} />}
    </div>
  );
}

function UserForm({ user, onClose, onSaved }: { user?: ManagedUser; onClose: () => void; onSaved: () => void }) {
  const { isSuper } = useAuth();
  // Kept across closing/reopening the dialog (see useFormDraft); erased only after a successful save or "Discard changes".
  const draft = useFormDraft(user ? `user-edit-${user.id}` : "user-create",
    { username: user?.username ?? "", password: "", role: user?.role ?? "Student", email: user?.email ?? "", full_name: user?.full_name ?? "", force: true, access: NO_ACCESS as Access },
    { volatile: ["password"] });
  const f = draft.value;
  const setF = draft.set;
  const access = f.access;
  const setAccess = (a: Access) => setF({ ...f, access: a });
  const [touched, setTouched] = useState(false);
  const errs = { username: user ? undefined : usernameProblem(f.username), password: user ? undefined : passwordPolicy(f.password) };
  const save = useMutation(async () => {
    if (user) await http.patch(`/admin/users/${user.id}`, { ...(user.role === "Admin" ? {} : { role: f.role }), email: f.email || null, full_name: f.full_name || null });
    else await http.post("/admin/users", { username: f.username.trim(), password: f.password, role: f.role, require_password_change: f.force, ...(f.role === "Admin" ? { access } : {}), ...(f.email ? { email: f.email } : {}), ...(f.full_name ? { full_name: f.full_name } : {}) });
    draft.clear();
    onSaved();
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!errs.username && !errs.password) void save.run(); };
  const discard = () => { draft.clear(); onClose(); };
  return (
    <AppModal open wide={f.role === "Admin" && !user} title={user ? `Edit @${user.username}` : f.role === "Admin" ? "Add Admin" : "Add user"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        {!user && <AppInput required label="Username" placeholder="e.g. aarav_sharma" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} error={touched ? errs.username : undefined} />}
        <AppInput label="Full name" placeholder="e.g. Aarav Sharma" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        <AppInput label="Email" type="email" placeholder="name@example.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        {user?.role === "Admin" ? <p className="text-sm text-slate-600">Role: <b>Admin</b> — use the <b>Access</b> button to change what they can do.</p> : <AppSelect required label="Role" options={roleOptions(isSuper)} value={f.role} onChange={(v) => setF({ ...f, role: v })} />}
        {!user && <>
          <PasswordInput required label="Temporary password" placeholder="At least 8 characters, a letter and a digit" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={touched ? errs.password : undefined} />
          <AppCheckbox label="Ask the user to change it at first login" checked={f.force} onChange={(e) => setF({ ...f, force: e.target.checked })} />
        </>}
        {!user && f.role === "Admin" && <div className="border-t pt-4"><AccessEditor value={access} onChange={setAccess} /></div>}
        {save.error != null && <ErrorState error={save.error} />}
        <DraftNotice dirty={draft.dirty} restored={draft.restored} onDiscard={discard} />
        <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton type="submit" loading={save.loading}>{user ? "Save changes" : "Create user"}</AppButton></div>
      </form>
    </AppModal>
  );
}

function ResetForm({ user, onClose, onSaved }: { user: ManagedUser; onClose: () => void; onSaved: () => void }) {
  const draft = useFormDraft(`user-reset-${user.id}`, { pw: "", force: true }, { volatile: ["pw"] }); // password stays in memory only
  const { pw, force } = draft.value;
  const setPw = (v: string) => draft.set({ ...draft.value, pw: v });
  const setForce = (v: boolean) => draft.set({ ...draft.value, force: v });
  const [touched, setTouched] = useState(false);
  const save = useMutation(async () => { await http.post(`/admin/users/${user.id}/reset-password`, { new_password: pw, require_password_change: force }); draft.clear(); onSaved(); });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!passwordPolicy(pw)) void save.run(); };
  return (
    <AppModal open title={`Reset password — @${user.username}`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <PasswordInput required label="New password" placeholder="At least 8 characters, a letter and a digit" value={pw} onChange={(e) => setPw(e.target.value)} error={touched ? passwordPolicy(pw) : undefined} />
        <AppCheckbox label="Ask the user to change it at next login" checked={force} onChange={(e) => setForce(e.target.checked)} />
        {save.error != null && <ErrorState error={save.error} />}
        <DraftNotice dirty={draft.dirty} restored={draft.restored} onDiscard={() => { draft.clear(); onClose(); }} />
        <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton type="submit" loading={save.loading}>Set password</AppButton></div>
      </form>
    </AppModal>
  );
}

function DeleteConfirm({ user, onClose, onDone }: { user: ManagedUser; onClose: () => void; onDone: () => void }) {
  const del = useMutation(async () => { await http.delete(`/admin/users/${user.id}`); onDone(); });
  return <ConfirmDialog open title="Delete user" message={`Delete @${user.username}? They will no longer be able to sign in. Their purchases and history are kept.`} confirmLabel="Delete" loading={del.loading} onCancel={onClose} onConfirm={() => void del.run()} />;
}

/** Super Admin: change an existing Admin's feature checkboxes and board/class/subject scope. Applies on their very next request. */
function AccessForm({ user, onClose, onSaved }: { user: ManagedUser; onClose: () => void; onSaved: () => void }) {
  const draft = useFormDraft(`user-access-${user.id}`, { access: { permissions: user.permissions ?? [], scopes: user.scopes ?? NO_ACCESS.scopes } as Access });
  const access = draft.value.access;
  const setAccess = (a: Access) => draft.set({ access: a });
  const save = useMutation(async () => { await http.put(`/admin/users/${user.id}/access`, access); draft.clear(); onSaved(); });
  return (
    <AppModal open wide title={`Access — @${user.username}`} onClose={onClose}>
      <AccessEditor value={access} onChange={setAccess} />
      {save.error != null && <div className="mt-3"><ErrorState error={save.error} /></div>}
      <div className="mt-3"><DraftNotice dirty={draft.dirty} restored={draft.restored} onDiscard={() => { draft.clear(); onClose(); }} /></div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Changes apply immediately — no need for them to sign in again.</p>
        <div className="flex gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton loading={save.loading} onClick={() => void save.run()}>Save access</AppButton></div>
      </div>
    </AppModal>
  );
}
