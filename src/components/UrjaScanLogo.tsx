interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function UrjaScanLogo({ size = "md", className = "" }: Props) {
  const iconPx = size === "lg" ? 56 : size === "sm" ? 28 : 40;
  const textCls =
    size === "lg"
      ? "text-4xl tracking-tight"
      : size === "sm"
      ? "text-lg tracking-tight"
      : "text-2xl tracking-tight";

  return (
    <div className={`inline-flex items-center gap-2 font-bold ${textCls} ${className}`}>
      {/* UrjaScan half-sun icon — currentColor inherits text-ochre so the login white override works */}
      <span className="text-ochre inline-flex"><svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/*
          Left arc — the sun body. Centre (38, 50), radius 26.
          Drawn counter-clockwise from top to bottom = left-facing half-circle.
        */}
        <path
          d="M 38,24 A 26,26 0 0,0 38,76"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />

        {/* Rays emanating from centre (38, 50) — angles 0° … 180° rightward fan */}

        {/* 0° — horizontal (longest, most prominent) */}
        <line x1="38" y1="50" x2="90" y2="50"  stroke="currentColor" strokeWidth="7" strokeLinecap="round" />

        {/* 27° above horizontal */}
        <line x1="38" y1="50" x2="84" y2="26"  stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" />

        {/* 54° above horizontal */}
        <line x1="38" y1="50" x2="66" y2="12"  stroke="currentColor" strokeWidth="6" strokeLinecap="round" />

        {/* 81° above horizontal (near vertical-up) */}
        <line x1="38" y1="50" x2="42" y2="6"   stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />

        {/* 108° above horizontal (upper-left, exits past arc) */}
        <line x1="38" y1="50" x2="16" y2="13"  stroke="currentColor" strokeWidth="5" strokeLinecap="round" />

        {/* 135° — upper-left (short, partly behind arc) */}
        <line x1="38" y1="50" x2="10" y2="32"  stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />

        {/* 27° below horizontal */}
        <line x1="38" y1="50" x2="84" y2="74"  stroke="currentColor" strokeWidth="6.5" strokeLinecap="round" />

        {/* 54° below horizontal */}
        <line x1="38" y1="50" x2="66" y2="88"  stroke="currentColor" strokeWidth="6" strokeLinecap="round" />

        {/* 81° below horizontal */}
        <line x1="38" y1="50" x2="42" y2="94"  stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />

        {/* 108° below horizontal */}
        <line x1="38" y1="50" x2="16" y2="87"  stroke="currentColor" strokeWidth="5" strokeLinecap="round" />

        {/* 135° below horizontal */}
        <line x1="38" y1="50" x2="10" y2="68"  stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      </svg></span>

      {/* Brand name */}
      <span>
        <span className="text-ochre">Urja</span>
        <span className="text-foreground font-light">Scan</span>
      </span>
    </div>
  );
}
