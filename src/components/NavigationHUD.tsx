import { useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  Compass,
  Mountain,
  Keyboard,
  X,
  SkipBack,
  SkipForward,
  ArrowUp,
} from "lucide-react";
import { SHORTCUT_MATRIX, type Cardinal } from "@/lib/map-camera";

/**
 * The bottom-right navigation cluster: cardinal pan, pitch/elevation steppers,
 * a north-reset compass, the defect stepper, and the keyboard-shortcut legend.
 *
 * PURE PRESENTATIONAL ON PURPOSE
 * -------------------------------
 * Every action here is a callback prop — this component knows nothing about
 * mapRef, easeTo, or how a pan step is sized in metres (see lib/map-camera.ts
 * for that). That split is what keeps map.tsx's job to "wire this to the map"
 * rather than "also lay out and style a HUD," and it is what makes the
 * positioning logic below auditable in one place against this task's own
 * guardrail: a fixed floating overlay that must never sit under the defect
 * drawer or the mobile bottom nav.
 *
 * WHY IT MOVES INSTEAD OF JUST RAISING ITS z-index
 * ---------------------------------------------------
 * The detail drawer (map.tsx) is `w-full sm:w-[400px]`, docked to the right
 * edge of the *entire viewport* — not just the map pane — so a HUD sitting at
 * a fixed `right-4` would end up rendered underneath it the moment a defect is
 * selected, which is exactly the overlap this task exists to prevent. A
 * z-index fix would leave the HUD floating uselessly on top of the drawer's
 * own content instead. So instead: at `sm` and up, the HUD shifts left by the
 * drawer's own 400px + margin so both stay usable side by side; below `sm`,
 * where the drawer is full width and there is nowhere to shift to, the HUD
 * hides outright rather than fight the drawer for space that does not exist.
 *
 * The vertical offset (`bottom-20` under `md`, `bottom-4` at and above it) is
 * the same accommodation for MobileBottomNav, which is a fixed 56px bar the
 * HUD must clear on phones and does not need to on desktop, where that nav
 * does not render at all.
 *
 * TASK 6'S MOBILE SHEET GETS A HARDER HIDE, NOT A SHIFT
 * -----------------------------------------------------------
 * `mobileSheetOpen` (InspectionSheet, below `md`) is a BOTTOM sheet, not a
 * right-side one — it can grow to 88% of the viewport height, so there is no
 * horizontal shift that keeps it clear the way there is for the desktop
 * drawer. Below `md` with a selection open, the HUD hides outright at every
 * width, full stop, rather than reuse `sm:right-[416px]`'s "shift, don't
 * hide" compromise, which assumes horizontal space this overlay does not
 * leave free.
 */
export function NavigationHUD({
  onPan,
  onPitch,
  onZoom,
  onResetNorth,
  drawerOpen,
  mobileSheetOpen,
  pitchEnabled = true,
  stepper,
}: {
  onPan: (dir: Cardinal) => void;
  onPitch: (sign: 1 | -1) => void;
  onZoom: (sign: 1 | -1) => void;
  onResetNorth: () => void;
  /** The desktop right-side drawer is open — see the module docblock. */
  drawerOpen: boolean;
  /** Task 6's mobile bottom sheet is open — see "TASK 6'S MOBILE SHEET..."
   *  above for why this hides rather than shifts. */
  mobileSheetOpen: boolean;
  /** Task 6: off for the mobile 2D fallback, where the map itself has pitch
   *  gestures disabled (map.tsx's low-memory-mode effect) — a stepper for a
   *  camera move the map won't perform is worse than no stepper, since
   *  tapping it and seeing nothing happen reads as broken, not as absent. */
  pitchEnabled?: boolean;
  stepper: {
    label: string;
    position: string | null;
    onPrev: () => void;
    onNext: () => void;
    disabled: boolean;
  };
}) {
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <div
      className={
        "absolute z-20 flex flex-col-reverse items-end gap-2 bottom-20 md:bottom-4 " +
        (mobileSheetOpen ? "hidden" : drawerOpen ? "hidden sm:flex sm:right-[416px]" : "right-4")
      }
    >
      {/* ── Main cluster ── */}
      <div className="bg-card/95 border border-border shadow-lg backdrop-blur-sm p-2.5 w-[152px]">
        <HudRow
          label="Elevation"
          icon={<Mountain size={12} />}
          onDown={() => onZoom(-1)}
          onUp={() => onZoom(1)}
          downTitle="Zoom out (lower)"
          upTitle="Zoom in (closer)"
        />
        {pitchEnabled && (
          <HudRow
            label="Pitch"
            icon={<ArrowUp size={12} className="rotate-45" />}
            onDown={() => onPitch(-1)}
            onUp={() => onPitch(1)}
            downTitle="Tilt down"
            upTitle="Tilt up"
          />
        )}

        {/* Cardinal d-pad, north reset in the centre cell. */}
        <div className="grid grid-cols-3 grid-rows-3 gap-1 mt-2.5 w-full aspect-square">
          <div />
          <PadButton title="Pan north" onClick={() => onPan("N")}>
            <ChevronUp size={15} />
          </PadButton>
          <div />
          <PadButton title="Pan west" onClick={() => onPan("W")}>
            <ChevronUp size={15} className="-rotate-90" />
          </PadButton>
          <PadButton title="Reset heading to north (N)" onClick={onResetNorth} accent>
            <Compass size={16} />
          </PadButton>
          <PadButton title="Pan east" onClick={() => onPan("E")}>
            <ChevronUp size={15} className="rotate-90" />
          </PadButton>
          <div />
          <PadButton title="Pan south" onClick={() => onPan("S")}>
            <ChevronDown size={15} />
          </PadButton>
          <div />
        </div>

        {/* Keyboard legend toggle — meaningless without a physical keyboard,
            so it does not render at all below md rather than sit there dead. */}
        <button
          onClick={() => setLegendOpen((v) => !v)}
          title="Keyboard shortcuts"
          aria-pressed={legendOpen}
          className={`hidden md:flex mt-2.5 w-full h-6 items-center justify-center gap-1.5 text-[10px] font-medium border transition ${
            legendOpen
              ? "bg-ochre text-ochre-fg border-ochre"
              : "text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          <Keyboard size={11} /> Shortcuts
        </button>
      </div>

      {/* ── Defect stepper ── */}
      <div className="bg-card/95 border border-border shadow-lg backdrop-blur-sm flex items-center h-9 text-xs">
        <button
          onClick={stepper.onPrev}
          disabled={stepper.disabled}
          title="Previous flagged panel ([)"
          className="h-full px-2 flex items-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
        >
          <SkipBack size={13} />
        </button>
        <div className="px-2 flex flex-col items-center justify-center leading-none border-x border-border min-w-[84px]">
          <span className="font-semibold text-foreground truncate max-w-[110px]">
            {stepper.label}
          </span>
          {stepper.position && (
            <span className="text-[10px] text-muted-foreground mt-0.5">{stepper.position}</span>
          )}
        </div>
        <button
          onClick={stepper.onNext}
          disabled={stepper.disabled}
          title="Next flagged panel (])"
          className="h-full px-2 flex items-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
        >
          <SkipForward size={13} />
        </button>
      </div>

      {/* ── Keyboard shortcut legend ── */}
      {legendOpen && (
        <div className="bg-card/97 border border-border shadow-lg backdrop-blur-sm p-3 w-56 text-xs">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-widest text-grey-400 font-semibold">
              Keyboard
            </p>
            <button
              onClick={() => setLegendOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>
          <div className="space-y-1.5">
            {SHORTCUT_MATRIX.map((row) => (
              <div key={row.keys} className="flex items-center justify-between gap-3">
                <kbd className="mono text-[10px] px-1.5 py-0.5 bg-grey-100 border border-grey-200 whitespace-nowrap">
                  {row.keys}
                </kbd>
                <span className="text-muted-foreground text-right">{row.label}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-grey-400 mt-2.5 pt-2 border-t border-border">
            Shortcuts are off while typing in a field, aligning an overlay, or comparing layers.
          </p>
        </div>
      )}
    </div>
  );
}

function HudRow({
  label,
  icon,
  onDown,
  onUp,
  downTitle,
  upTitle,
}: {
  label: string;
  icon: React.ReactNode;
  onDown: () => void;
  onUp: () => void;
  downTitle: string;
  upTitle: string;
}) {
  return (
    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
      <span className="flex items-center gap-1">
        {icon}
        {label}
      </span>
      <div className="flex border border-border">
        <button
          onClick={onDown}
          title={downTitle}
          className="w-6 h-6 flex items-center justify-center hover:bg-muted text-foreground"
        >
          <ChevronDown size={12} />
        </button>
        <button
          onClick={onUp}
          title={upTitle}
          className="w-6 h-6 flex items-center justify-center hover:bg-muted text-foreground border-l border-border"
        >
          <ChevronUp size={12} />
        </button>
      </div>
    </div>
  );
}

function PadButton({
  children,
  onClick,
  title,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center border transition ${
        accent
          ? "bg-ochre text-ochre-fg border-ochre hover:bg-ochre-light"
          : "bg-grey-50 text-foreground border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
