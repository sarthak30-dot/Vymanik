import { SEVERITY_LABEL, type Severity, type Status } from "@/lib/mock-data";

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

export function SeverityBadge({ severity, size = "sm" }: { severity: Severity; size?: "sm" | "lg" }) {
  const sz = size === "lg" ? "text-xs px-3 py-1.5" : "text-[11px] px-2 py-1";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold tracking-widest border border-grey-200 bg-grey-25 ${sz}`}
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
      {SEVERITY_LABEL[severity]}
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
