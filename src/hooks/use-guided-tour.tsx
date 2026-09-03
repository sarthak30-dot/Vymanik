import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface TourStep {
  /** Matches a `data-tour="…"` attribute somewhere in the DOM. */
  target: string;
  title: string;
  body: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Find the rendered element for a tour step.
 *
 * A step id can legitimately match MORE than one element — AppHeader's desktop
 * nav and MobileBottomNav both carry `data-tour="nav-map"` so one step list
 * works at every viewport width (see the comment on CLIENT_NAV in
 * AppHeader.tsx). This picks whichever copy actually has on-screen size;
 * `offsetParent` is not used for that check because it is null for `position:
 * fixed` elements (MobileBottomNav) in most browsers regardless of visibility,
 * which would make the mobile nav item read as "not rendered" even when it is
 * the one on screen.
 */
function resolveTarget(id: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`);
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const MARGIN = 12;
const GAP = 14;
/** Tooltip card footprint, used to keep it on-screen — matches the CSS below. */
const CARD_W = 320;
const CARD_H = 168;

function placeTooltip(hole: Rect): { top: number; left: number; arrow: "top" | "bottom" } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - (hole.top + hole.height);
  const spaceAbove = hole.top;
  const below = spaceBelow >= CARD_H + GAP || spaceBelow >= spaceAbove;

  const top = below
    ? Math.min(hole.top + hole.height + GAP, vh - CARD_H - MARGIN)
    : Math.max(hole.top - CARD_H - GAP, MARGIN);

  const idealLeft = hole.left + hole.width / 2 - CARD_W / 2;
  const left = Math.min(Math.max(idealLeft, MARGIN), vw - CARD_W - MARGIN);

  return { top, left, arrow: below ? "top" : "bottom" };
}

export interface UseGuidedTourResult {
  active: boolean;
  start: () => void;
  /** Render this once, anywhere in the tree — every element it renders is
   *  `position: fixed`, so where it sits in the DOM doesn't matter. */
  Overlay: () => React.ReactNode;
}

/**
 * A lightweight spotlight-and-tooltip walkthrough.
 *
 * WHY NOT A LIBRARY (react-joyride etc.)
 * ---------------------------------------
 * The brief asked for a "lightweight walkthrough tooltip sequence," and every
 * off-the-shelf tour library brings a scroll-lock/portal/step-schema system
 * sized for arbitrary apps. This one is under 150 lines because it only has to
 * do five things: find an element, dim around it, show a card, step forward,
 * and remember it ran. Reaching for a dependency to do less than that is a
 * worse trade for a codebase this size than owning the code.
 *
 * WHY THE OVERLAY IS pointer-events: none
 * -----------------------------------------
 * This is a coachmark, not a modal — nothing about a tour should be able to
 * trap someone on a page they're trying to leave. Only the tooltip card itself
 * (Next/Back/Skip/X) captures clicks; the dimming layer and the highlight ring
 * do not, so clicking the highlighted element, or anywhere else on the page,
 * still works exactly as it would with the tour closed.
 *
 * WHY A rAF LOOP WHILE A STEP IS SHOWING
 * -----------------------------------------
 * The highlighted rect has to track its target through scroll, resize, and —
 * for the two nav steps — a viewport crossing the md breakpoint that swaps
 * which of the two `data-tour`-matching elements is actually on screen mid-step.
 * A resize/scroll listener pair would cover most of that, but re-deriving "is
 * this rect still right" every frame while a step is active is simpler to
 * reason about and costs nothing a five-step overlay will ever notice.
 */
export function useGuidedTour(steps: TourStep[], storageKey: string): UseGuidedTourResult {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const rafRef = useRef<number | null>(null);

  const finish = useCallback(() => {
    setActive(false);
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // Private mode / quota — the tour just won't remember it ran, which is a
      // fine degradation for a once-per-session nicety.
    }
  }, [storageKey]);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  // Resolve + track the current step's target every frame. Skips forward past
  // any step whose element isn't in the DOM right now, and ends the tour
  // cleanly if none of the remaining steps resolve — a missing element is not
  // an error state the user should have to dismiss.
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const track = () => {
      if (cancelled) return;
      let idx = stepIndex;
      let el = resolveTarget(steps[idx]?.target ?? "");
      while (!el && idx < steps.length - 1) {
        idx += 1;
        el = resolveTarget(steps[idx].target);
      }
      if (!el) {
        finish();
        return;
      }
      if (idx !== stepIndex) setStepIndex(idx);
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      rafRef.current = requestAnimationFrame(track);
    };
    rafRef.current = requestAnimationFrame(track);

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, steps.length, finish]);

  const next = useCallback(() => {
    if (stepIndex >= steps.length - 1) finish();
    else setStepIndex((i) => i + 1);
  }, [stepIndex, steps.length, finish]);

  const back = useCallback(() => setStepIndex((i) => Math.max(0, i - 1)), []);

  const Overlay = useCallback((): React.ReactNode => {
    if (!active || !rect) return null;
    const step = steps[stepIndex];
    if (!step) return null;

    const pad = 6;
    const hole: Rect = {
      top: rect.top - pad,
      left: rect.left - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    };
    const { top, left, arrow } = placeTooltip(hole);
    const arrowLeft = Math.min(Math.max(hole.left + hole.width / 2 - left, 16), CARD_W - 16);

    return (
      <>
        {/* Dim-with-a-hole: a small rect whose gigantic box-shadow paints
            everything else in view. Cheaper than an SVG mask for one hole and
            needs no extra element for the "outside" region. */}
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            borderRadius: 8,
            boxShadow: "0 0 0 9999px rgba(10,10,14,0.72)",
            border: "2px solid var(--ochre)",
            pointerEvents: "none",
            zIndex: 70,
            transition:
              "top 120ms ease-out, left 120ms ease-out, width 120ms ease-out, height 120ms ease-out",
          }}
        />
        <div
          role="dialog"
          aria-label="Guided tour"
          style={{ position: "fixed", top, left, width: CARD_W, zIndex: 71 }}
          className="bg-card border border-border shadow-lg text-sm"
        >
          <div className="flex items-start justify-between gap-2 px-4 pt-3">
            <p className="text-[10px] uppercase tracking-widest text-grey-400 font-semibold">
              Step {stepIndex + 1} of {steps.length}
            </p>
            <button
              onClick={finish}
              aria-label="Close tour"
              className="text-muted-foreground hover:text-foreground -mt-1 -mr-1 p-1"
            >
              <X size={14} />
            </button>
          </div>
          <p className="px-4 mt-1.5 font-semibold text-foreground">{step.title}</p>
          <p className="px-4 mt-1 text-muted-foreground text-xs leading-relaxed">{step.body}</p>
          <div className="flex items-center justify-between px-4 py-3 mt-2">
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className="block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: i === stepIndex ? "var(--ochre)" : "var(--grey-200)" }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  onClick={back}
                  className="p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft size={14} />
                </button>
              )}
              <button
                onClick={next}
                className="h-7 px-3 bg-ochre hover:bg-ochre-light text-ochre-fg text-xs font-semibold inline-flex items-center gap-1"
              >
                {stepIndex >= steps.length - 1 ? "Done" : "Next"}
                {stepIndex < steps.length - 1 && <ChevronRight size={12} />}
              </button>
            </div>
          </div>
          {/* Arrow — points at the highlighted element from whichever edge the
              card is anchored to. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              [arrow === "top" ? "top" : "bottom"]: -6,
              left: arrowLeft,
              width: 10,
              height: 10,
              transform: "rotate(45deg)",
              background: "var(--card)",
              borderTop: arrow === "top" ? "1px solid var(--border)" : undefined,
              borderLeft: arrow === "top" ? "1px solid var(--border)" : undefined,
              borderBottom: arrow === "bottom" ? "1px solid var(--border)" : undefined,
              borderRight: arrow === "bottom" ? "1px solid var(--border)" : undefined,
            }}
          />
        </div>
      </>
    );
  }, [active, rect, stepIndex, steps, finish, next, back]);

  return { active, start, Overlay };
}

/** Has this tour already run (or been skipped) once this session? */
export function hasTourRun(storageKey: string): boolean {
  try {
    return sessionStorage.getItem(storageKey) === "1";
  } catch {
    return true; // fail closed: don't auto-launch if storage is unreadable
  }
}
