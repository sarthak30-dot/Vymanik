/**
 * "Presentation Mode" — an app-wide density toggle for demoing UrjaScan to a
 * prospect without logging out of a team/admin account.
 *
 * THE PROBLEM THIS SOLVES
 * ------------------------
 * The permission matrix in permissions.ts already keeps a *client* account
 * clean: CLIENT_NAV never links to /team or /admin, AnomalyCsvImport only
 * renders inside team.tsx, and editAnomaly/manageUsers/etc. are false for
 * "client". None of that helps the far more common demo scenario: a Vymanik
 * salesperson showing the platform to a prospect while logged in as *themselves*
 * (team or admin), because their own account legitimately carries the Inspector
 * Portal link, the CSV importer, and the pipeline-stage jargon a prospect has no
 * use for. Logging into a separate client account mid-call is the actual
 * workaround today, and it is exactly the friction this exists to remove.
 *
 * WHAT IT IS NOT
 * --------------
 * A security boundary. Presenting is a client-side display preference stored in
 * sessionStorage, not a server-issued scope — the session token and role are
 * unchanged, and a team/admin user can flip it off at any moment. Nothing that
 * genuinely needs protecting (write endpoints, the API's own role checks) may
 * ever be gated on this. What it legitimately buys is routing and layout
 * hygiene: which nav links render, and which routes a stray click or bookmark
 * can land on while a demo is in progress. See route-guards.ts.
 *
 * WHY sessionStorage AND NOT React CONTEXT
 * -----------------------------------------
 * `beforeLoad` on a TanStack Router route runs before any component mounts, so
 * it cannot read a React context — it can only read something synchronous and
 * global, which is exactly how auth.ts's isAuthenticated() already works. This
 * module follows the same shape on purpose: a plain read/write pair over
 * storage, with components subscribing via the hook in hooks/use-presentation.ts.
 *
 * sessionStorage rather than localStorage is deliberate too: a demo session
 * should not silently carry over to tomorrow because nobody remembered to turn
 * it off, and it should not follow the user to a different browser tab where
 * they may be doing real work. Tab-scoped, gone on close, is the right default
 * for something whose entire purpose is temporary.
 */

import type { Role } from "./permissions";

const KEY = "urjascan_presenting";
/** Fired on every change so same-tab subscribers can react — the native
 *  `storage` event only fires in *other* tabs, never the one that wrote it. */
export const PRESENTATION_EVENT = "urjascan:presentation-change";

export function isPresenting(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(KEY) === "1";
}

export function setPresenting(on: boolean): void {
  if (typeof sessionStorage === "undefined") return;
  if (on) sessionStorage.setItem(KEY, "1");
  else sessionStorage.removeItem(KEY);
  window.dispatchEvent(new Event(PRESENTATION_EVENT));
}

/** team/admin only — a client is already at "prospect" density permanently
 *  and has nothing to toggle. */
export function canTogglePresentation(role: Role | null | undefined): boolean {
  return role === "team" || role === "admin";
}

export type ViewDensity = "prospect" | "operator";

/**
 * The single source of truth for "how much chrome does this viewer see".
 *
 * A client (or a signed-out visitor) is always "prospect" — there is no
 * operator density to opt into, so presenting is irrelevant for them. A
 * team/admin viewer is "operator" unless they have explicitly turned
 * presentation mode on, in which case they see exactly what a client would.
 *
 * This governs NAVIGATION AND LAYOUT ONLY — which links render, which section
 * of a page shows. It must never be asked to decide whether an action is
 * allowed; that question belongs to can() in permissions.ts, which reads the
 * real role and does not change when this does.
 */
export function densityFor(role: Role | null | undefined): ViewDensity {
  if (role !== "team" && role !== "admin") return "prospect";
  return isPresenting() ? "prospect" : "operator";
}
