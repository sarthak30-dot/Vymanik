/**
 * Shared `beforeLoad` guard for the operator-only routes (/team, /admin).
 *
 * TWO SEPARATE REASONS A REDIRECT CAN FIRE HERE, AND THEY MUST STAY SEPARATE
 * ---------------------------------------------------------------------------
 * 1. WRONG ROLE. Before this guard existed, _app.tsx's beforeLoad only checked
 *    isAuthenticated() — it never checked role. AppHeader and MobileBottomNav
 *    hide the Inspector Portal / Control Center *links* from a client account,
 *    but hiding a link is not a guard: typing /team or /admin into the address
 *    bar, or opening an old bookmark, loaded the route anyway. That is the
 *    literal thing this task's brief calls "mixes high-level client review
 *    needs with raw operational debugging flows" — a client landing on the
 *    pipeline-stage/CSV-import screen because nothing stopped them.
 *
 * 2. PRESENTING. A team/admin user who has turned on Presentation Mode (see
 *    lib/presentation.ts) is demoing the platform and does not want a stray
 *    click — their own, on a shared screen — to land the room on the
 *    Inspector Portal mid-pitch. This one is self-imposed and reversible: it
 *    only ever applies to the operator's own account, and they can turn it off
 *    from the header at any time.
 *
 * Keeping both checks in one function (rather than duplicating a role check in
 * every operator route and a presenting check somewhere else) is what makes it
 * safe to add the next operator-only route later without re-deriving either
 * rule from scratch.
 */
import { redirect } from "@tanstack/react-router";
import { getUser } from "./auth";
import { isPresenting } from "./presentation";
import type { Role } from "./permissions";

export function requireOperatorRoute(allowed: readonly Role[]): void {
  const user = getUser();
  if (!user || !allowed.includes(user.role) || isPresenting()) {
    throw redirect({ to: "/dashboard" });
  }
}
