// Matches the Role union used throughout src/lib/auth.ts and src/lib/api.ts
// (frontend doesn't import packages/types directly — see api/_lib/mappers.ts
// for the backend counterpart).
export type Role = "client" | "team" | "admin";

/**
 * Section 6 permission matrix from the UrjaScan Portal change spec.
 * Single source of truth — both UI (hide, not just disable) and API routes
 * should check against this instead of hand-rolling role checks per file.
 */
export type Action =
  | "viewDashboard"
  | "uploadData"
  | "editAnomaly"
  | "qcReview"
  | "manageUsers"
  | "manageLayout"
  | "exportReports";

const MATRIX: Record<Role, Record<Action, boolean>> = {
  admin: {
    viewDashboard: true,
    uploadData: true,
    editAnomaly: true,
    qcReview: true,
    manageUsers: true,
    manageLayout: true,
    exportReports: true,
  },
  team: {
    // "team" role = Inspector in the spec's naming
    viewDashboard: true,
    uploadData: true,
    editAnomaly: true,
    qcReview: false,
    manageUsers: false,
    manageLayout: false,
    exportReports: true,
  },
  client: {
    // "client" role = Client Access / Plant Owner — read-only reporting view
    viewDashboard: true,
    uploadData: false,
    editAnomaly: false,
    qcReview: false,
    manageUsers: false,
    manageLayout: false,
    exportReports: true, // read-only report export only
  },
};

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return MATRIX[role]?.[action] ?? false;
}
