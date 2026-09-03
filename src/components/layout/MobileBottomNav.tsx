import { Link, useLocation } from "@tanstack/react-router";
import { Home, Map, ClipboardList, FileBarChart, Layers, Shield, Users, Plane, Settings } from "lucide-react";
import { getUser } from "@/lib/auth";
import { useDensity } from "@/hooks/use-presentation";

// `tour` ids match AppHeader's CLIENT_NAV exactly — see the comment there.
// GuidedTour resolves whichever of the two is actually rendered at the current
// viewport width, so mobile and desktop can share one step list.
const CLIENT_ITEMS = [
  { to: "/dashboard", icon: Home,          label: "Home" },
  { to: "/map",       icon: Map,           label: "Map", tour: "nav-map" },
  { to: "/anomalies", icon: ClipboardList, label: "Anomalies" },
  { to: "/reports",   icon: FileBarChart,  label: "Reports", tour: "nav-reports" },
  { to: "/services",  icon: Layers,        label: "Services" },
] as const;

const TEAM_ITEMS = [
  { to: "/team",      icon: Plane,         label: "Inspector" },
  { to: "/anomalies", icon: ClipboardList, label: "Anomalies" },
  { to: "/reports",   icon: FileBarChart,  label: "Reports" },
  { to: "/services",  icon: Layers,        label: "Services" },
  { to: "/settings",  icon: Settings,      label: "Settings" },
] as const;

const ADMIN_ITEMS = [
  { to: "/admin",     icon: Shield,        label: "Control" },
  { to: "/dashboard", icon: Home,          label: "Plants" },
  { to: "/team",      icon: Users,         label: "Team" },
  { to: "/services",  icon: Layers,        label: "Services" },
  { to: "/settings",  icon: Settings,      label: "Settings" },
] as const;

export function MobileBottomNav() {
  const loc = useLocation();
  const user = getUser();
  // Same density rule as AppHeader — Presentation Mode collapses an
  // admin/team viewer onto CLIENT_ITEMS here too, so switching apps mid-demo
  // between desktop and a phone doesn't reveal the mismatch.
  const showOperatorChrome = useDensity(user?.role) === "operator";
  const items = !showOperatorChrome ? CLIENT_ITEMS
    : user?.role === "admin" ? ADMIN_ITEMS
    : TEAM_ITEMS;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-border">
      <div className="grid grid-cols-5 h-14">
        {items.map(({ to, icon: Icon, label, ...rest }) => {
          const active =
            loc.pathname === to ||
            (to !== "/dashboard" && to !== "/admin" && to !== "/team" && loc.pathname.startsWith(to));
          const tour = "tour" in rest ? rest.tour : undefined;
          return (
            <Link
              key={to}
              to={to}
              data-tour={tour}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${
                active ? "text-ochre" : "text-muted-foreground"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              <span className={active ? "font-semibold" : ""}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
