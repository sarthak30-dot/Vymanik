import { SEVERITY_LABEL, SEVERITY_LABEL_FULL, type Severity, type Status } from "@/lib/mock-data";

const DOT_COLOR: Record<Severity, string> = {
  critical: "var(--critical)",
  medium:   "var(--medium)",
  normal:   "var(--normal)",
  nodata:   "var(--grey-400)",
};

const TEXT_COLOR: Record<Severity, string> = {
  critical: "var(--critical)",
  medium:   "var(--medium)",
  normal:   "var(--normal)",
  nodata:   "var(--grey-400)",
};

/**
 * Which spelling of the severity taxonomy this badge shows.
 *
 * `sm` is the dense population — a cell in the 9-column anomaly table, a slot in
 * the dashboard's 4-up grid, the corner of a mobile card. `lg` is used in exactly
 * three places, all of them detail-page headers with room to spare.
 *
 * So the size prop already carries the density signal: the dense population keeps
 * the bare code that fits its column, and the roomy one spells the label out for
 * a client who would otherwise have to be taught what COA3 means.
 */
function badgeLabel(severity: Severity, size: "sm" | "lg"): string {
  return size === "lg"
    ? SEVERITY_LABEL_FULL[severity]
    : SEVERITY_LABEL[severity];
}

export function SeverityBadge({ severity, size = "sm" }: { severity: Severity; size?: "sm" | "lg" }) {
  const sz = size === "lg" ? "text-xs px-3 py-1.5" : "text-[11px] px-2 py-1";
  // Letter-spacing is tuned per label shape: wide spacing suits a 4-char code,
  // but stretches a mixed-case phrase into something that reads like a banner.
  const tracking = badgeLabel(severity, size).includes(" ") ? "tracking-wide" : "tracking-widest";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold ${tracking} border border-grey-200 bg-grey-25 ${sz}`}
      style={{ borderRadius: "0.125rem", color: TEXT_COLOR[severity] }}
    >
      <span
        aria-hidden
        style={{
          display:         "inline-block",
          width:           6,
          height:          6,
          borderRadius:    "50%",
          backgroundColor: DOT_COLOR[severity],
          flexShrink:      0,
        }}
      />
      {badgeLabel(severity, size)}
    </span>
  );
}

const STATUS_BORDER: Record<Status, string> = {
  New:          "var(--critical)",
  Acknowledged: "var(--medium)",
  "In Repair":  "var(--primary-light)",
  Closed:       "var(--normal)",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 bg-transparent text-foreground"
      style={{ borderRadius: "0.125rem", borderLeft: `2px solid ${STATUS_BORDER[status]}`, paddingLeft: 6 }}
    >
      {status}
    </span>
  );
}
