import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { UrjaScanLogo } from "@/components/UrjaScanLogo";
import { useI18n } from "@/lib/i18n";
import { plant } from "@/lib/mock-data";

export function AppHeader() {
  const { lang, setLang } = useI18n();
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-grey-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-12 flex items-center justify-between gap-4">
        <Link to="/dashboard" className="flex items-center">
          <UrjaScanLogo size="sm" />
        </Link>
        <div className="hidden md:flex items-center gap-2 text-sm border border-grey-200 px-3 py-1.5 bg-grey-50 cursor-default select-none">
          <span className="font-medium text-foreground">{plant.name}</span>
          <span className="mono text-muted-foreground">— {plant.capacityMW} MW</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1"
          >
            {lang === "en" ? "EN | हिं" : "हिं | EN"}
          </button>
          <button className="relative p-2 hover:bg-grey-50 min-w-[36px] min-h-[36px] flex items-center justify-center">
            <Bell size={18} className="text-foreground" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-critical" style={{ borderRadius: "50%" }} />
          </button>
          <div className="w-8 h-8 bg-primary text-white flex items-center justify-center font-semibold text-sm">
            <span className="sr-only">User</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          </div>
        </div>
      </div>
    </header>
  );
}
