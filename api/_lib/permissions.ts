import type { Role } from "../../packages/types/src/index";

/**
 * Server-side mirror of src/lib/permissions.ts (Section 6 permission matrix).
 * Duplicated rather than shared because the frontend never imports
 * packages/types directly (see src/lib/permissions.ts for why) — this is the
 * enforcement boundary that actually matters, since the client-side check is
 * only a UI convenience.
 */
export type Action = "editAnomaly" | "qcReview" | "manageUsers" | "manageLayout";

const MATRIX: Record<Role, Record<Action, boolean>> = {
  admin: { editAnomaly: true, qcReview: true, manageUsers: true, manageLayout: true },
  team:  { editAnomaly: true, qcReview: false, manageUsers: false, manageLayout: false },
  client: { editAnomaly: false, qcReview: false, manageUsers: false, manageLayout: false },
};

export function can(role: string | null | undefined, action: Action): boolean {
  if (role !== "admin" && role !== "team" && role !== "client") return false;
  return MATRIX[role][action];
}
