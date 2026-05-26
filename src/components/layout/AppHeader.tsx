import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { Bell, X } from "lucide-react";
import { useState } from "react";
import { UrjaScanLogo } from "@/components/UrjaScanLogo";
import { useI18n } from "@/lib/i18n";
import { plant } from "@/lib/mock-data";
import { getUser, clearAuth } from "@/lib/auth";

const MOCK_NOTIFICATIONS = [
  { id: "1", title: "Critical: R14-M07 Multi Hotspot", body: "ΔT +47°C · Immediate action required", time: "2h ago", unread: true },
  { id: "2", title: "Critical: R08-M03 String Open Circuit", body: "ΔT +61°C · Junction box lid open", time: "2h ago", unread: true },
  { id: "3", title: "Inspection report ready", body: "3 May 2026 IEC 62446-3 certified report published", time: "3 days ago", unread: false },
];

const CLIENT_NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/map",       label: "Map" },
  { to: "/anomalies", label: "Anomalies" },
  { to: "/reports",   label: "Reports" },
  { to: "/services",  label: "Services" },
] as const;

const TEAM_NAV = [
  { to: "/team",      label: "Inspector Portal" },
  { to: "/anomalies", label: "Anomalies" },
  { to: "/reports",   label: "Reports" },
  { to: "/services",  label: "Services" },
] as const;

const ADMIN_NAV = [
  { to: "/admin",     label: "Control Center" },
  { to: "/dashboard", label: "Plants" },
  { to: "/team",      label: "Team" },
  { to: "/services",  label: "Services" },
] as const;

export function AppHeader() {
  const { lang, setLang } = useI18n();
  const navigate = useNavigate();
  const loc = useLocation();
  const user = getUser();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const initials = user
    ? user.role === "admin" ? "CC" : user.role === "team" ? "IN" : "PO"
    : "?";

  const roleLabel = user
    ? user.role === "admin" ? "Control Center" : user.role === "team" ? "Inspector" : "Plant Owner"
    : "";

  function handleSignOut() {
    clearAuth();
    navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-grey-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-12 flex items-center justify-between gap-4">
        <Link to="/dashboard" className="flex items-center">
          <UrjaScanLogo size="sm" />
        </Link>

        {user?.role !== "admin" && (
          <div className="hidden md:flex items-center gap-2 text-sm border border-grey-200 px-3 py-1.5 bg-grey-50 cursor-default select-none shrink-0">
            <span className="font-medium text-foreground">{plant.name}</span>
            <span className="mono text-muted-foreground">— {plant.capacityMW} MW</span>
          </div>
        )}

        {/* Desktop navigation */}
        <nav className="hidden md:flex items-center gap-0.5">
          {(user?.role === "admin" ? ADMIN_NAV : user?.role === "team" ? TEAM_NAV : CLIENT_NAV).map(({ to, label }) => {
            const active = loc.pathname === to || (to !== "/dashboard" && to !== "/admin" && to !== "/team" && loc.pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  active ? "text-ochre border-b-2 border-ochre" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setLang(lang === "en" ? "hi" : "en")}
            className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1"
          >
            {lang === "en" ? "EN | हिं" : "हिं | EN"}
          </button>

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => { setShowNotifications(v => !v); setShowUserMenu(false); }}
              className="relative p-2 hover:bg-grey-50 min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <Bell size={18} className="text-foreground" />
              <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-critical" style={{ borderRadius: "50%" }} />
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-1 w-80 bg-white border border-grey-200 shadow-lg z-50">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-grey-200">
                  <p className="font-semibold text-sm">Notifications</p>
                  <button onClick={() => setShowNotifications(false)} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>
                <div className="divide-y divide-grey-200 max-h-72 overflow-y-auto">
                  {MOCK_NOTIFICATIONS.map(n => (
                    <div key={n.id} className={`px-4 py-3 ${n.unread ? "bg-ochre-muted" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground leading-snug">{n.title}</p>
                        {n.unread && <span className="w-1.5 h-1.5 bg-critical rounded-full shrink-0 mt-1" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{n.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* User avatar + dropdown */}
          <div className="relative">
            <button
              onClick={() => { setShowUserMenu(v => !v); setShowNotifications(false); }}
              className="w-8 h-8 bg-primary text-white flex items-center justify-center font-semibold text-xs hover:bg-primary/90"
            >
              {initials}
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-grey-200 shadow-lg z-50">
                <div className="px-4 py-3 border-b border-grey-200">
                  <p className="text-xs font-semibold text-foreground">{roleLabel}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{user?.userId ?? ""}</p>
                </div>
                <div className="py-1">
                  <Link to="/settings" onClick={() => setShowUserMenu(false)} className="block px-4 py-2 text-xs text-foreground hover:bg-grey-50">
                    Settings
                  </Link>
                  {user?.role === "admin" && (
                    <Link to="/admin" onClick={() => setShowUserMenu(false)} className="block px-4 py-2 text-xs text-foreground hover:bg-grey-50">
                      Control Center
                    </Link>
                  )}
                  {(user?.role === "team" || user?.role === "admin") && (
                    <Link to="/team" onClick={() => setShowUserMenu(false)} className="block px-4 py-2 text-xs text-foreground hover:bg-grey-50">
                      Inspector Portal
                    </Link>
                  )}
                  <button onClick={handleSignOut} className="w-full text-left px-4 py-2 text-xs text-critical hover:bg-grey-50">
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
