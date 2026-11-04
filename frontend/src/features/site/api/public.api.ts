import { http } from "../../../shared/api/http-client";
import { Course, SiteContact, SiteStats, TrendingNote } from "../../../shared/types";

export interface CallbackInput { name: string; phone: string; class_label?: string; city?: string; message?: string; website?: string }

/** Unauthenticated endpoints used by the landing page, courses page and callback form. */
export const publicApi = {
  trending: () => http.get<TrendingNote[]>("/public/trending"),
  contact: () => http.get<SiteContact>("/public/contact"),
  stats: () => http.get<SiteStats>("/public/stats"),
  courses: () => http.get<Course[]>("/public/courses"),
  requestCallback: (input: CallbackInput) => http.post<{ received: boolean }>("/public/callback-requests", input),
};
