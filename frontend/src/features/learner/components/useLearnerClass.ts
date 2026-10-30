import { usePersistentState } from "../../../shared/hooks/usePersistentState";

export interface LearnerClass { id: number; number: number | null; name: string }

/** The class the learner is studying (chosen on Courses / the workspace); shown in the header chip and used as the default. */
export function useLearnerClass() {
  return usePersistentState<LearnerClass | null>("learner.class", null);
}
