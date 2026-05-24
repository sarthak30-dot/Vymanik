import { Sun } from "lucide-react";

export function UrjaScanLogo({ size = "md", className = "" }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const text = size === "lg" ? "text-4xl" : size === "sm" ? "text-lg" : "text-2xl";
  const icon = size === "lg" ? 32 : size === "sm" ? 18 : 24;
  return (
    <div className={`inline-flex items-center gap-1.5 font-bold ${text} ${className}`}>
      <Sun size={icon} className="text-ochre" strokeWidth={2} />
      <span>
        <span className="text-ochre">Urja</span>
        <span className="text-foreground font-light">Scan</span>
      </span>
    </div>
  );
}
