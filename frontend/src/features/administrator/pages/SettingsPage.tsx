import { useState } from "react";
import { AppButton, AppInput, ErrorState, LoadingState } from "../../../shared/components";
import { useAsync } from "../../../shared/hooks/useAsync";
import { useMutation } from "../../../shared/hooks/useMutation";
import { Setting } from "../../../shared/types";
import { adminApi } from "../api/api-hit-logs.api";
import { SiteContactForm } from "../components/SiteContactForm";

/** Administrator runtime settings: log retention days (default 90 ≈ 3 months) and preview page limit. */
export function SettingsPage() {
  const { data, error, loading, reload } = useAsync(() => adminApi.settings(), []);
  if (loading) return <LoadingState />;
  if (error != null) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
      <div className="space-y-4">{data!.map((s) => <SettingRow key={s.key} setting={s} onSaved={reload} />)}<SiteContactForm /></div>
    </div>
  );
}

function SettingRow({ setting, onSaved }: { setting: Setting; onSaved: () => void }) {
  const [value, setValue] = useState(String(setting.value));
  const [saved, setSaved] = useState(false);
  const n = Number(value);
  const err = !/^\d+$/.test(value) || n < setting.min || n > setting.max ? `Enter a whole number between ${setting.min} and ${setting.max}` : undefined;
  const save = useMutation(async () => { await adminApi.updateSetting(setting.key, n); setSaved(true); onSaved(); });
  return (
    <div className="rounded-lg border bg-white p-4">
      <h2 className="font-medium">{setting.key.replace(/_/g, " ")}</h2>
      <p className="mb-3 text-sm text-slate-600">{setting.description} Default: {setting.default_value}.</p>
      <div className="flex items-end gap-3">
        <AppInput className="w-40" label="Value" inputMode="numeric" value={value} onChange={(e) => { setValue(e.target.value); setSaved(false); }} error={err} />
        <AppButton disabled={!!err || n === setting.value} loading={save.loading} onClick={() => void save.run()}>Save</AppButton>
        {saved && <span className="pb-2 text-sm text-green-700">Saved</span>}
      </div>
      {save.error != null && <div className="mt-3"><ErrorState error={save.error} /></div>}
    </div>
  );
}
