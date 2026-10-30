import { http } from "../../../shared/api/http-client";
import { Plan, Subscription } from "../../../shared/types";

export const subscriptionsApi = {
  plans: () => http.get<Plan[]>("/subscription-plans"),
  mine: () => http.get<Subscription[]>("/subscriptions/me"),
  cancel: (id: number) => http.post<{ id: number; status: string }>(`/subscriptions/${id}/cancel`),
};
