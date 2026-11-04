import { http } from "../../../shared/api/http-client";
import { ApiLog, Setting } from "../../../shared/types";

type Query = Record<string, string | number | boolean | undefined | null>;

export const adminApi = {
  /** Log search: every filter is a query parameter. */
  logs: (query: Query) => http.list<ApiLog>("/admin/api-hit-logs", query),
  log: (id: number) => http.get<ApiLog>(`/admin/api-hit-logs/${id}`),
  settings: () => http.get<Setting[]>("/admin/settings"),
  updateSetting: (key: string, value: number) => http.put<Setting>(`/admin/settings/${key}`, { value }),
};
