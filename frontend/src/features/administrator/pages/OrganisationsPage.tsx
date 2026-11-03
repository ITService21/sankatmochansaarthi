import { FormEvent, useState } from "react";
import { useAuth } from "../../../shared/auth/AuthContext";
import { AppButton, AppInput, AppModal, AppTable, ErrorState } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { examsApi, OrgRow } from "../../exams/api/exams.api";
import { PageHeader, Pill, when } from "../../exams/components/ui";

/** Staff: every organisation with its headcounts. An organisation is identified by its id; the name is a label only the Super Admin can change. */
export function OrganisationsPage() {
  const { user } = useAuth();
  const isSuper = user?.role === "Administrator";
  const list = useAsync(() => examsApi.organisations(), []);
  const [adding, setAdding] = useState(false); const [renaming, setRenaming] = useState<OrgRow | null>(null); const [ownerFor, setOwnerFor] = useState<OrgRow | null>(null);
  const [secret, setSecret] = useState<{ title: string; login: string; password: string } | null>(null);
  const reload = () => list.reload();
  return (
    <div>
      <PageHeader title="Organisations" sub="Schools and coaching institutes. Everything is linked by Organisation ID, so renaming never breaks anything."><AppButton onClick={() => setAdding(true)}>+ Add organisation</AppButton></PageHeader>
      {list.error != null ? <ErrorState error={list.error} /> : <AppTable loading={list.loading} rows={list.data ?? []} rowKey={(o) => o.id} emptyMessage="No organisations yet."
        columns={[
          { key: "id", header: "Org ID", render: (o) => <span className="font-mono text-xs font-semibold text-slate-700">ORG-{String(o.id).padStart(4, "0")}</span> },
          { key: "name", header: "Organisation" }, { key: "org_type", header: "Type", render: (o) => <Pill tone="blue">{o.org_type}</Pill> },
          { key: "owner_username", header: "Owner login", render: (o) => o.owner_username ? <span>{o.owner_username}{o.owner_name ? <span className="text-slate-500"> · {o.owner_name}</span> : null}</span> : <span className="text-slate-400">No owner yet</span> },
          { key: "teachers", header: "Teachers" }, { key: "students", header: "Students" }, { key: "created_at", header: "Created", render: (o) => when(o.created_at) },
          { key: "actions", header: "", render: (o) => <div className="flex gap-2">{isSuper && <AppButton size="sm" variant="secondary" onClick={() => setRenaming(o)}>Edit details</AppButton>}{!o.owner_username && <AppButton size="sm" variant="secondary" onClick={() => setOwnerFor(o)}>Add owner</AppButton>}</div> },
        ]} />}
      {adding && <AddOrg onClose={() => setAdding(false)} onSaved={(r, login) => { setAdding(false); reload(); if (r.temporary_password) setSecret({ title: `${r.name} created`, login, password: r.temporary_password }); }} />}
      {renaming && <RenameOrg org={renaming} onClose={() => setRenaming(null)} onSaved={() => { setRenaming(null); reload(); }} />}
      {ownerFor && <AddOwner org={ownerFor} onClose={() => setOwnerFor(null)} onSaved={(login, password) => { setOwnerFor(null); reload(); if (password) setSecret({ title: "Owner added", login, password }); }} />}
      {secret && <AppModal open title={secret.title} onClose={() => setSecret(null)}>
        <p className="text-sm text-slate-700">Share these login details with the owner. The password is shown only once and must be changed at first login.</p>
        <p className="mt-3 rounded-lg bg-slate-50 p-3 font-mono text-sm">Login: {secret.login}<br />Temporary password: {secret.password}</p>
        <div className="mt-4 flex justify-end"><AppButton onClick={() => setSecret(null)}>Done</AppButton></div>
      </AppModal>}
    </div>
  );
}

const EMAIL = /^\S+@\S+\.\S+$/;

function AddOrg({ onClose, onSaved }: { onClose: () => void; onSaved: (r: { name: string; temporary_password?: string }, login: string) => void }) {
  const [v, setV] = useState({ name: "", full_name: "", email: "", password: "" }); const [touched, setTouched] = useState(false);
  const email = v.email.trim();
  const err = v.name.trim().length < 2 ? "Enter the organisation name" : email && (!EMAIL.test(email) || email.length > 64) ? "That email doesn't look right" : v.password && !email ? "Add the owner's email, or leave the password empty" : v.password && v.password.length < 8 ? "Password must be at least 8 characters" : "";
  const save = useMutation(async () => {
    const r = await examsApi.createOrganisation({ organisation: { name: v.name.trim() }, ...(email ? { owner: { email, ...(v.full_name.trim() ? { full_name: v.full_name.trim() } : {}), ...(v.password ? { password: v.password } : {}) } } : {}) });
    onSaved({ name: v.name.trim(), temporary_password: r.temporary_password }, email.toLowerCase());
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setTouched(true); if (!err) void save.run(); };
  return (
    <AppModal open title="Add organisation" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <AppInput required label="Organisation name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <p className="text-xs text-slate-500">Owner details are optional. Add the owner's email to create their login now (the email is the login); leave blank to add an owner later.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <AppInput label="Owner name (optional)" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} />
          <AppInput label="Owner email (optional)" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          {email && <AppInput label="Owner password (optional)" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} className="sm:col-span-2" />}
        </div>
        {email && !v.password && <p className="text-xs text-slate-500">No password entered: a temporary one will be generated for you to share.</p>}
        {touched && err && <p role="alert" className="text-sm text-red-600">{err}</p>}{save.error != null && <ErrorState error={save.error} />}
        <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton type="submit" loading={save.loading}>Create</AppButton></div>
      </form>
    </AppModal>
  );
}

function RenameOrg({ org, onClose, onSaved }: { org: OrgRow; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: org.name, email: org.email ?? "", phone: org.phone ?? "", address: org.address ?? "" });
  const save = useMutation(async () => { await examsApi.updateOrganisation(org.id, { name: v.name.trim(), email: v.email.trim() || null, phone: v.phone.trim() || null, address: v.address.trim() || null }); onSaved(); });
  const bad = v.name.trim().length < 2 || (!!v.email.trim() && !EMAIL.test(v.email.trim()));
  return (
    <AppModal open title="Edit organisation" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (!bad) void save.run(); }} className="space-y-3">
        <p className="text-sm text-slate-600">Organisation ID <span className="font-mono font-semibold">ORG-{String(org.id).padStart(4, "0")}</span> never changes. Only the Super Admin can edit organisation details.</p>
        <AppInput required label="Organisation name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2"><AppInput label="Email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /><AppInput label="Phone" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
        <AppInput label="Address" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} />
        {save.error != null && <ErrorState error={save.error} />}
        <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton type="submit" loading={save.loading} disabled={bad}>Save</AppButton></div>
      </form>
    </AppModal>
  );
}

function AddOwner({ org, onClose, onSaved }: { org: OrgRow; onClose: () => void; onSaved: (login: string, password?: string) => void }) {
  const [v, setV] = useState({ full_name: "", email: "", password: "" });
  const email = v.email.trim(); const bad = !EMAIL.test(email) || email.length > 64 || (!!v.password && v.password.length < 8);
  const save = useMutation(async () => { const r = await examsApi.addOrganisationOwner(org.id, { email, ...(v.full_name.trim() ? { full_name: v.full_name.trim() } : {}), ...(v.password ? { password: v.password } : {}) }); onSaved(email.toLowerCase(), r.temporary_password); });
  return (
    <AppModal open title={`Add owner · ${org.name}`} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (!bad) void save.run(); }} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2"><AppInput required label="Owner email (login)" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /><AppInput label="Owner name (optional)" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /><AppInput label="Password (optional)" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} className="sm:col-span-2" /></div>
        {save.error != null && <ErrorState error={save.error} />}
        <div className="flex justify-end gap-2"><AppButton variant="secondary" onClick={onClose}>Close</AppButton><AppButton type="submit" loading={save.loading} disabled={bad}>Add owner</AppButton></div>
      </form>
    </AppModal>
  );
}
