import { SEVERITY_LABEL, SEVERITY_LABEL_FULL, type Severity, type Status } from "@/lib/mock-data";
import { SEVERITY, RESOLVED, tokenFor } from "@/lib/severity-tokens";
import { SeverityShape } from "@/components/SeverityShape";

const NODATA_TOKEN = { vivid: "var(--grey-400)", text: "var(--grey-400)", shape: "circle" as const };

function tokenForSeverity(severity: Severity) {
  return severity === "nodata" ? NODATA_TOKEN : SEVERITY[severity];
}

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
  const token = tokenForSeverity(severity);
  // Letter-spacing is tuned per label shape: wide spacing suits a 4-char code,
  // but stretches a mixed-case phrase into something that reads like a banner.
  const tracking = badgeLabel(severity, size).includes(" ") ? "tracking-wide" : "tracking-widest";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold ${tracking} border border-grey-200 bg-grey-25 ${sz}`}
      style={{ borderRadius: "0.125rem", color: token.text }}
    >
      {/* Shape + anti-camouflage ring, not just a coloured dot — a badge is
          small enough that colour alone (especially Minor's yellow, see
          lib/severity-tokens.ts) can wash out against a light card in bright
          light, and the shape is what a colour-blind reader has left. Size 10
          keeps a visible fill core after the two 1.5px rings eat into it —
          the SeverityShape docblock has the ring-width mechanics. */}
      <SeverityShape shape={token.shape} fill={token.vivid} size={10} pulse={severity === "critical"} />
      {badgeLabel(severity, size)}
    </span>
  );
}

const STATUS_BORDER: Record<Status, string> = {
  New:          "var(--critical)",
  Acknowledged: "var(--medium)",
  "In Repair":  "var(--primary-light)",
  Closed:       "var(--resolved)",
};

export function StatusBadge({ status, severity }: { status: Status; severity?: Severity }) {
  // "Resolved / Inspected" only applies once the underlying finding is
  // actually closed — an Acknowledged or In-Repair critical still shows its
  // severity's own colour deliberately, so a defect on the way to being
  // fixed never reads as already safe. See tokenFor() in lib/severity-tokens.ts.
  const resolvedToken = severity && severity !== "nodata" ? tokenFor(severity, status) : null;
  const showResolvedMark = status === "Closed" && resolvedToken === RESOLVED;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 bg-transparent text-foreground"
      style={{ borderRadius: "0.125rem", borderLeft: `2px solid ${STATUS_BORDER[status]}`, paddingLeft: 6 }}
    >
      {showResolvedMark && <SeverityShape shape={RESOLVED.shape} fill={RESOLVED.vivid} size={9} />}
      {status}
    </span>
  );
}
