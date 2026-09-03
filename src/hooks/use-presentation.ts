import { useSyncExternalStore } from "react";
import {
  isPresenting,
  setPresenting as setPresentingRaw,
  densityFor,
  PRESENTATION_EVENT,
  type ViewDensity,
} from "@/lib/presentation";
import type { Role } from "@/lib/permissions";

/**
 * React binding for lib/presentation.ts.
 *
 * useSyncExternalStore rather than useState+useEffect: presentation mode is
 * genuinely external state (sessionStorage), shared across every component
 * that cares about it, and can be flipped by a route guard or another
 * component entirely — a plain useState copy would only ever see the value it
 * was initialised with. This is the same reason useTheme (hooks/use-theme.tsx)
 * exists rather than each consumer keeping its own copy.
 */
function subscribe(callback: () => void) {
  window.addEventListener(PRESENTATION_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(PRESENTATION_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function usePresenting(): [boolean, (on: boolean) => void] {
  const presenting = useSyncExternalStore(subscribe, isPresenting, () => false);
  return [presenting, setPresentingRaw];
}

/**
 * Subscribed version of densityFor() — use this in any component, not the
 * plain function.
 *
 * lib/presentation.ts's densityFor() is a plain synchronous read, correct at
 * the instant it's called but with no way to notice a *later* change: React
 * only re-renders a component when something it's subscribed to changes, and a
 * bare function call subscribes to nothing. AppHeader toggling Presentation
 * Mode re-renders AppHeader (it owns the toggle, so it's already subscribed via
 * usePresenting above) but nothing tells a sibling — Dashboard,
 * MobileBottomNav — to re-render too, so a raw `densityFor(role)` call in
 * either of those would keep showing the pre-toggle density until something
 * unrelated happened to re-render them. Wiring this through
 * useSyncExternalStore is what makes flipping the header toggle update every
 * consumer in the same frame instead of on the next incidental re-render.
 */
export function useDensity(role: Role | null | undefined): ViewDensity {
  useSyncExternalStore(subscribe, isPresenting, () => false);
  return densityFor(role);
}
