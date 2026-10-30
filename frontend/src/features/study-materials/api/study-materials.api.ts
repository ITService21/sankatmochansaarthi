import { http } from "../../../shared/api/http-client";
import { Material } from "../../../shared/types";

type Query = Record<string, string | number | boolean | undefined | null>;
const base = "/study-materials";

/** All study-material calls. List filters are query parameters; writes use JSON or multipart. */
export const materialsApi = {
  list: (query: Query) => http.list<Material>(base, query),
  get: (id: number) => http.get<Material>(`${base}/${id}`),
  create: (form: FormData) => http.postForm<Material>(base, form),
  update: (id: number, body: Record<string, unknown>) => http.patch<Material>(`${base}/${id}`, body),
  replaceFile: (id: number, form: FormData) => http.putForm<Material>(`${base}/${id}/file`, form),
  publish: (id: number) => http.post<Material>(`${base}/${id}/publish`),
  unpublish: (id: number) => http.post<Material>(`${base}/${id}/unpublish`),
  regeneratePreview: (id: number) => http.post<Material>(`${base}/${id}/preview/regenerate`),
  remove: (id: number) => http.delete<{ id: number; deleted: boolean }>(`${base}/${id}`),
  previewBlob: (id: number) => http.blob(`${base}/${id}/preview`),
  /** Full file bytes for the in-app secure reader (never saved to the device). */
  downloadBlob: (id: number) => http.blob(`${base}/${id}/download`),
  /** Adds a note to My Downloads (in-app library). */
  addDownload: (id: number) => http.post<{ material_id: number; is_downloaded: boolean }>("/downloads", { material_id: id }),
  /** Removes a note from My Downloads (soft delete). */
  removeDownload: (id: number) => http.delete<{ material_id: number; is_downloaded: boolean }>(`/downloads/${id}`),
};
