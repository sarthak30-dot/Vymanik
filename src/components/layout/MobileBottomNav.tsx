import { Link, useLocation } from "@tanstack/react-router";
import { Home, Map, ClipboardList, FileBarChart, Layers, Shield, Users, Plane, Settings } from "lucide-react";
import { getUser } from "@/lib/auth";

const CLIENT_ITEMS = [
  { to: "/dashboard", icon: Home,          label: "Home" },
  { to: "/map",       icon: Map,           label: "Map" },
  { to: "/anomalies", icon: ClipboardList, label: "Anomalies" },
  { to: "/reports",   icon: FileBarChart,  label: "Reports" },
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
  const items =
    user?.role === "admin" ? ADMIN_ITEMS
    : user?.role === "team" ? TEAM_ITEMS
    : CLIENT_ITEMS;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-border">
      <div className="grid grid-cols-5 h-14">
        {items.map(({ to, icon: Icon, label }) => {
          const active =
            loc.pathname === to ||
            (to !== "/dashboard" && to !== "/admin" && to !== "/team" && loc.pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
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
