import { useEffect, useRef, useState } from "react";
import { Thermometer, Camera, Wifi } from "lucide-react";

/**
 * Task 6's "Dual-Band Image Switcher" — swipe (or tap) between a defect's RGB
 * and thermal-IR frames, with the thumbnail-then-full progressive load the
 * same task's "Low-Memory Rendering Optimization" deliverable asks for.
 *
 * BUILT AGAINST THE REAL DATA, NOT THE BRIEF'S ASSUMPTION
 * ---------------------------------------------------------
 * The brief's example is "swipe between standard RGB and false-color thermal
 * infrared module captures," as if every defect has both. The March 2026
 * survey does not: it flew radiometric-thermal only, so every anomaly has a
 * `rgbNote` pointing at an IronRed frame and nothing else — see
 * lib/defect-image.ts and routes/_app/anomalies/$id.tsx's own RgbImage, which
 * already documents this gap rather than faking a visual image. `rgbSrc` is a
 * real, independent prop here (not hard-coded away) so the swiper activates
 * itself the moment a future survey delivers paired imagery; today, with
 * `rgbSrc` always null, it falls back to a single-band view that says so
 * instead of presenting a dead swipe gesture for a second frame that does
 * not exist.
 *
 * PROGRESSIVE LOAD
 * -----------------
 * `thumbSrc` (a few KB, from scripts/generate_defect_thumbnails.py) paints
 * immediately, softened with a blur to own the fact it is not the real
 * resolution. The full frame (`src`, ~75KB) loads in the background unless
 * `deferFull` is set (see hooks/use-mobile.tsx's useConstrainedConnection),
 * in which case it waits for an explicit tap — a field technician on a
 * signal-starved plant should decide when to spend that 75KB, not have it
 * spent for them per marker they glance at.
 */

export interface ImageBand {
  /** Full-resolution src, or null if this band has no imagery at all. */
  src: string | null;
  /** Fast-paint thumbnail for this band, or null to skip straight to `src`. */
  thumbSrc: string | null;
  label: string;
}

export function DualBandImageSwitcher({
  thermal,
  rgb,
  deferFull,
  className = "",
}: {
  thermal: ImageBand;
  rgb: ImageBand;
  /** True on a constrained connection/device — see useConstrainedConnection. */
  deferFull: boolean;
  className?: string;
}) {
  const hasBoth = !!thermal.src && !!rgb.src;
  const [band, setBand] = useState<"thermal" | "rgb">(thermal.src ? "thermal" : "rgb");
  const active = band === "thermal" ? thermal : rgb;

  return (
    <div className={className}>
      {hasBoth && (
        <div
          role="tablist"
          aria-label="Image band"
          className="flex border border-border border-b-0 text-xs font-semibold"
        >
          <BandTab
            active={band === "thermal"}
            onClick={() => setBand("thermal")}
            icon={<Thermometer size={12} />}
            label={thermal.label}
          />
          <BandTab
            active={band === "rgb"}
            onClick={() => setBand("rgb")}
            icon={<Camera size={12} />}
            label={rgb.label}
          />
        </div>
      )}
      <SwipeFrame hasBoth={hasBoth} onSwipe={(dir) => setBand(dir === "left" ? "rgb" : "thermal")}>
        <BandImage band={active} deferFull={deferFull} />
        {!hasBoth && (thermal.src || rgb.src) && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] mono px-2 py-0.5">
            {thermal.src ? "Thermal only — no RGB captured this survey" : "RGB only"}
          </div>
        )}
      </SwipeFrame>
    </div>
  );
}

function BandTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 h-8 flex items-center justify-center gap-1.5 transition ${
        active ? "bg-ochre text-ochre-fg" : "bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon} {label}
    </button>
  );
}

/** Minimum horizontal drag, in px, before a touch gesture counts as a swipe
 *  rather than an incidental finger wobble mid-tap. */
const SWIPE_THRESHOLD_PX = 40;

function SwipeFrame({
  hasBoth,
  onSwipe,
  children,
}: {
  hasBoth: boolean;
  onSwipe: (dir: "left" | "right") => void;
  children: React.ReactNode;
}) {
  const startX = useRef<number | null>(null);

  return (
    <div
      className="relative aspect-video bg-black overflow-hidden border border-border select-none touch-pan-y"
      onTouchStart={
        hasBoth
          ? (e) => {
              startX.current = e.touches[0].clientX;
            }
          : undefined
      }
      onTouchEnd={
        hasBoth
          ? (e) => {
              if (startX.current === null) return;
              const dx = e.changedTouches[0].clientX - startX.current;
              startX.current = null;
              if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
              onSwipe(dx < 0 ? "left" : "right");
            }
          : undefined
      }
    >
      {children}
      {hasBoth && (
        <div className="absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1 pointer-events-none">
          <span className="text-[9px] text-white/60 mono">◂ swipe ▸</span>
        </div>
      )}
    </div>
  );
}

function BandImage({ band, deferFull }: { band: ImageBand; deferFull: boolean }) {
  const [fullRequested, setFullRequested] = useState(!deferFull);
  const [fullLoaded, setFullLoaded] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);

  // A band switch (thermal <-> rgb) or a defer setting change lands on a
  // different image entirely — start that image's own load sequence fresh
  // rather than showing the previous band's "loaded" state on new pixels.
  useEffect(() => {
    setFullRequested(!deferFull);
    setFullLoaded(false);
    setThumbLoaded(false);
  }, [band.src, deferFull]);

  if (!band.src)
    return <NoImagery label={`No ${band.label.toLowerCase()} imagery for this defect`} />;

  return (
    <>
      {band.thumbSrc && (
        <img
          key={`thumb-${band.thumbSrc}`}
          src={band.thumbSrc}
          alt=""
          aria-hidden
          className={`absolute inset-0 w-full h-full object-cover blur-[3px] scale-105 transition-opacity duration-200 ${
            fullLoaded ? "opacity-0" : thumbLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setThumbLoaded(true)}
        />
      )}
      {fullRequested && (
        <img
          key={`full-${band.src}`}
          src={band.src}
          alt={`${band.label} defect image`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${fullLoaded ? "opacity-100" : "opacity-0"}`}
          style={{ filter: "saturate(1.1) contrast(1.05)" }}
          onLoad={() => setFullLoaded(true)}
        />
      )}
      {!fullRequested && (
        <button
          onClick={() => setFullRequested(true)}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/40 text-white text-xs font-medium"
        >
          <Wifi size={18} className="text-white/80" />
          Tap to load full resolution
          <span className="text-[10px] text-white/60 font-normal">~75KB · data saver is on</span>
        </button>
      )}
      {fullRequested && !fullLoaded && !thumbLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </>
  );
}

function NoImagery({ label = "No imagery for this defect" }: { label?: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-grey-50">
      <p className="text-xs text-muted-foreground px-4 text-center">{label}</p>
    </div>
  );
}
