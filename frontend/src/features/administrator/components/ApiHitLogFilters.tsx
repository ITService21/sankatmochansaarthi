import { AppButton, AppInput, AppSelect } from "../../../shared/components";

export const LOG_FILTER_KEYS = ["q", "from", "to", "method", "status_code", "success", "role", "username", "path_contains", "request_id", "error_code", "latency_min", "latency_max"] as const;
export type LogFilters = Partial<Record<(typeof LOG_FILTER_KEYS)[number], string>>;

/** Filter bar for the API hit log. Values are stored in the URL by the page and sent as query parameters. */
export function ApiHitLogFilters({ values, onChange, onReset }: { values: LogFilters; onChange: (k: keyof LogFilters, v: string) => void; onReset: () => void }) {
  const v = (k: keyof LogFilters) => values[k] ?? "";
  return (
    <div className="mb-4 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
      <AppInput className="lg:col-span-2" label="Search any column" placeholder="path, status, user, error, payload…" value={v("q")} onChange={(e) => onChange("q", e.target.value)} />
      <AppInput label="From" type="date" value={v("from")} onChange={(e) => onChange("from", e.target.value)} />
      <AppInput label="To" type="date" value={v("to")} onChange={(e) => onChange("to", e.target.value)} />
      <AppSelect label="Result" placeholder="All" value={v("success")} onChange={(x) => onChange("success", x)} options={[{ value: "true", label: "Success" }, { value: "false", label: "Failure" }]} />
      <AppSelect label="Method" placeholder="All" value={v("method")} onChange={(x) => onChange("method", x)} options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }))} />
      <AppInput label="Status code" inputMode="numeric" value={v("status_code")} onChange={(e) => onChange("status_code", e.target.value)} />
      <AppSelect label="Role" placeholder="All" value={v("role")} onChange={(x) => onChange("role", x)} options={["Administrator", "Student", "Teacher"].map((r) => ({ value: r, label: r }))} />
      <AppInput label="Username" value={v("username")} onChange={(e) => onChange("username", e.target.value)} />
      <AppInput label="API path contains" value={v("path_contains")} onChange={(e) => onChange("path_contains", e.target.value)} />
      <AppInput label="Request ID" value={v("request_id")} onChange={(e) => onChange("request_id", e.target.value)} />
      <AppInput label="Error code" value={v("error_code")} onChange={(e) => onChange("error_code", e.target.value)} />
      <AppInput label="Min latency (ms)" inputMode="numeric" value={v("latency_min")} onChange={(e) => onChange("latency_min", e.target.value)} />
      <AppInput label="Max latency (ms)" inputMode="numeric" value={v("latency_max")} onChange={(e) => onChange("latency_max", e.target.value)} />
      <div className="flex items-end"><AppButton variant="secondary" onClick={onReset}>Reset filters</AppButton></div>
    </div>
  );
}
