import { useEffect, useRef, useState } from "react";

/**
 * A generic, draggable bottom sheet — Task 6's mobile replacement for the
 * desktop right-side detail drawer. Deliberately content-agnostic (header +
 * children render props, no idea what a "defect" is) so it can be reused
 * anywhere else a touch-first drawer beats a full-screen route change; the
 * field-inspector specifics (panel status, GPS, quick actions) live in
 * InspectionSheet, which wraps this.
 *
 * THREE SNAP POINTS, DRAGGED VIA POINTER EVENTS
 * ------------------------------------------------
 * `peek` (just the header — enough to see what's selected without losing the
 * map), `half` (roughly half the viewport), `full` (nearly the whole
 * viewport, for reading the image/data without the map as a distraction).
 * Pointer events rather than separate touch/mouse handlers: one code path
 * that works with a finger on a phone and a mouse when this is exercised at a
 * narrow desktop viewport (dev tools device mode, or this session's own
 * verification harness) — `setPointerCapture` keeps the drag tracking even if
 * the pointer leaves the handle's small hit area mid-gesture.
 *
 * Dragging updates a live pixel offset for immediate visual feedback, and
 * only resolves to one of the three snap heights on release — snapping
 * *during* the drag would fight the user's finger.
 */

export type SheetSnap = "peek" | "half" | "full";

const SNAP_VH: Record<SheetSnap, number> = { peek: 0, half: 50, full: 88 };
/** Used only until the header's real height is measured on first paint — see
 *  the `peekHeight` state below. Close enough to avoid a visible jump. */
const INITIAL_PEEK_PX = 96;
const GRIP_STRIP_PX = 26;
/** Below this much net height change, a pointer-down/up on the grip counts
 *  as a tap (cycle snap) rather than a drag (go to the released height). */
const TAP_SLOP_PX = 6;

export function BottomSheet({
  open,
  snap,
  onSnapChange,
  onClose,
  header,
  children,
}: {
  open: boolean;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  onClose: () => void;
  /** Always visible, including at `peek` — the drag handle lives above it.
   *  `peek`'s height is measured from this content's real rendered height
   *  (plus the grip strip), not a hardcoded constant, so it never clips
   *  whatever a consumer puts here. */
  header: React.ReactNode;
  /** Body content — clipped to nothing at `peek`, scrollable at `half`/`full`. */
  children: React.ReactNode;
}) {
  const [dragPx, setDragPx] = useState<number | null>(null);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);
  const headerRef = useRef<HTMLDivElement>(null);
  const [peekHeight, setPeekHeight] = useState(INITIAL_PEEK_PX);

  // Snapping to a new selection should always land on a state that shows the
  // header at minimum — never resume a stale mid-drag offset from whatever
  // the previous selection was left at.
  useEffect(() => {
    setDragPx(null);
  }, [open]);

  // Re-measure whenever the header's own content changes shape (a longer
  // panel ID wrapping to a second line, a badge appearing) rather than only
  // on mount — a stale measurement is a peek state that either clips content
  // or leaves dead space, both wrong for a snap point whose whole point is
  // "exactly the header, nothing more."
  useEffect(() => {
    const el = headerRef.current;
    if (!el || !open) return;
    const measure = () => setPeekHeight(el.getBoundingClientRect().height + GRIP_STRIP_PX);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  if (!open) return null;

  const vh = (pct: number) => (window.innerHeight * pct) / 100;
  const heightForSnap = (s: SheetSnap) => (s === "peek" ? peekHeight : vh(SNAP_VH[s]));
  const currentHeight = dragPx ?? heightForSnap(snap);

  const onPointerDown = (e: React.PointerEvent) => {
    // Can throw ("no active pointer with the given id") for a pointerId the
    // browser doesn't recognize as a live session — genuine touch/mouse input
    // always has one, but a dropped/already-released pointer occasionally
    // doesn't. Uncaught, that exception aborts this handler before the drag
    // state below is ever set, silently freezing the sheet's drag/tap gesture
    // until the component remounts — worth catching even though capture
    // itself is best-effort (dragging still tracks via the move handler
    // below without it, just less robustly against the pointer leaving the
    // grip's small hit area mid-gesture).
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // best-effort; see comment above
    }
    dragStartY.current = e.clientY;
    dragStartHeight.current = heightForSnap(snap);
    setDragPx(dragStartHeight.current);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragPx === null) return;
    const delta = dragStartY.current - e.clientY; // drag up = positive = taller
    const max = vh(SNAP_VH.full);
    setDragPx(Math.min(max, Math.max(0, dragStartHeight.current + delta)));
  };
  const onPointerUp = () => {
    if (dragPx === null) return;
    // A tap (negligible movement) cycles to the next snap rather than
    // resolving to "nearest," which would just be the state it already was
    // in — a no-op that makes the handle look broken to anyone who taps
    // instead of drags before discovering the drag gesture exists.
    if (Math.abs(dragPx - dragStartHeight.current) < TAP_SLOP_PX) {
      const order: SheetSnap[] = ["peek", "half", "full"];
      onSnapChange(order[(order.indexOf(snap) + 1) % order.length]);
      setDragPx(null);
      return;
    }
    // Nearest snap by height, with peek's "closed enough" reading dominant
    // near the bottom — a drag that ends 20px above peek should not resolve
    // to closing on its own; only a deliberate downward flight past peek's
    // own height does (see the threshold below).
    if (dragPx < peekHeight * 0.5) {
      setDragPx(null);
      onClose();
      return;
    }
    const distances: [SheetSnap, number][] = (["peek", "half", "full"] as SheetSnap[]).map((s) => [
      s,
      Math.abs(heightForSnap(s) - dragPx),
    ]);
    distances.sort((a, b) => a[1] - b[1]);
    onSnapChange(distances[0][0]);
    setDragPx(null);
  };

  return (
    <div className="md:hidden fixed inset-0 z-40 pointer-events-none">
      {snap !== "peek" && (
        <div
          className="absolute inset-0 bg-black/30 pointer-events-auto animate-in fade-in"
          onClick={onClose}
        />
      )}
      <div
        className="absolute inset-x-0 bottom-0 bg-card border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.15)] pointer-events-auto flex flex-col"
        style={{
          height: currentHeight,
          transition: dragPx === null ? "height 220ms ease-out" : "none",
        }}
      >
        {/* Only this strip captures the drag — full-width and generously tall
            despite the thin grip pill it shows, so it is an easy target, but
            deliberately NOT the whole header: `header` renders interactive
            content (close button, badges) that needs its own taps to reach
            their own handlers rather than being interpreted as a drag. */}
        <div
          className="shrink-0 touch-none cursor-grab active:cursor-grabbing flex justify-center pt-2 pb-1.5"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="w-10 h-1 rounded-full bg-grey-200" />
        </div>
        <div ref={headerRef} className="shrink-0">
          {header}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
