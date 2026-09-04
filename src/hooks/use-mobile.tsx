import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

/**
 * Non-standard, Chromium-only hints — Device Memory API (`navigator.deviceMemory`)
 * and Network Information API (`navigator.connection`) — neither is in TS's DOM
 * lib, and neither exists on Safari/Firefox at all. Declared locally rather than
 * as a global augmentation so an absent API just types as `undefined` instead of
 * silently claiming every `Navigator` in the codebase has these fields.
 */
interface NetworkInformationHint {
  saveData?: boolean;
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}
interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
  connection?: NetworkInformationHint;
}

/**
 * "Is this session worth spending bandwidth/memory on automatically?" — used by
 * Task 6's dual-band image viewer to decide whether the full-resolution frame
 * loads on its own a moment after the thumbnail, or waits for an explicit tap.
 *
 * Three independent signals, any one of which is enough to call it constrained:
 *   - `deviceMemory <= 4` — a device Chrome itself considers low-RAM (the API's
 *     own scale tops out at 8, and 4GB is the modal low end for budget Android
 *     handsets a field technician is plausibly issued)
 *   - `connection.saveData` — the user (or their OS) explicitly asked sites to
 *     use less data; overriding that to auto-fetch a 75KB image per tap is
 *     exactly the behavior the setting exists to prevent
 *   - `connection.effectiveType` of 2G/slow-2G/3G — a real signal loss reading
 *     from a rural plant, not a lab guess
 *
 * Where neither API exists (Safari, Firefox, most desktops), this returns
 * `false` — "unknown" defaults to "assume capable" rather than punishing every
 * non-Chromium visitor with the conservative path for a condition that was
 * never actually detected.
 */
export function useConstrainedConnection(): boolean {
  const [constrained, setConstrained] = React.useState(false);

  React.useEffect(() => {
    const nav = navigator as NavigatorWithHints;
    const read = () => {
      const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
      const conn = nav.connection;
      const slowNetwork =
        !!conn?.saveData ||
        (!!conn?.effectiveType && ["slow-2g", "2g", "3g"].includes(conn.effectiveType));
      setConstrained(lowMemory || slowNetwork);
    };
    read();
    // effectiveType can change mid-session as a technician walks between rows
    // of panels and signal bars change — re-read rather than latching the
    // first reading for the rest of the visit.
    nav.connection?.addEventListener?.("change", read);
    return () => nav.connection?.removeEventListener?.("change", read);
  }, []);

  return constrained;
}
