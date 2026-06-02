import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import { Bell, X, ChevronDown, Sun, Moon, Monitor } from "lucide-react";
import { useState } from "react";
import { UrjaScanLogo } from "@/components/UrjaScanLogo";
import { useI18n } from "@/lib/i18n";
import { plant, allPlants } from "@/lib/mock-data";
import { getUser, clearAuth } from "@/lib/auth";
import { usePlantContext } from "@/lib/plant-context";
import { useTheme } from "@/hooks/use-theme";
import type { Theme } from "@/hooks/use-theme";

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
  const { selectedPlant, setSelectedPlantId } = usePlantContext();
  const { theme, setTheme } = useTheme();
  const isAdmin = user?.role === "admin";
  const isTeam = user?.role === "team";
  const onControlCenter = loc.pathname === "/admin";
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
    <header className="sticky top-0 z-30 bg-card border-b border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-12 flex items-center justify-between gap-4">
        <Link to="/dashboard" className="flex items-center">
          <UrjaScanLogo size="sm" />
        </Link>

        {/* Plant chip — hidden on Control Center; dropdown for admin/team, static for client */}
        {!onControlCenter && (
          (isAdmin || isTeam) ? (
            <div className="hidden md:flex items-center relative shrink-0">
              <select
                value={selectedPlant.id}
                onChange={e => setSelectedPlantId(e.target.value)}
                className="appearance-none h-8 pl-3 pr-7 border border-grey-200 bg-grey-50 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ochre cursor-pointer"
                title="Switch plant"
              >
                {allPlants.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.capacityMW} MW</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2 text-sm border border-grey-200 px-3 py-1.5 bg-grey-50 cursor-default select-none shrink-0">
              <span className="font-medium text-foreground">{plant.name}</span>
              <span className="mono text-muted-foreground">— {plant.capacityMW} MW</span>
            </div>
          )
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

          {/* Theme toggle — cycles: light → dark → system */}
          <ThemeToggle theme={theme} setTheme={setTheme} />

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
              <div className="absolute right-0 mt-1 w-80 bg-card border border-border shadow-lg z-50">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <p className="font-semibold text-sm">Notifications</p>
                  <button onClick={() => setShowNotifications(false)} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
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
              <div className="absolute right-0 mt-1 w-48 bg-card border border-border shadow-lg z-50">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-semibold text-foreground">{roleLabel}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{user?.userId ?? ""}</p>
                </div>
                <div className="py-1">
                  <Link to="/settings" onClick={() => setShowUserMenu(false)} className="block px-4 py-2 text-xs text-foreground hover:bg-muted">
                    Settings
                  </Link>
                  {user?.role === "admin" && (
                    <Link to="/admin" onClick={() => setShowUserMenu(false)} className="block px-4 py-2 text-xs text-foreground hover:bg-muted">
                      Control Center
                    </Link>
                  )}
                  {(user?.role === "team" || user?.role === "admin") && (
                    <Link to="/team" onClick={() => setShowUserMenu(false)} className="block px-4 py-2 text-xs text-foreground hover:bg-muted">
                      Inspector Portal
                    </Link>
                  )}
                  <button onClick={handleSignOut} className="w-full text-left px-4 py-2 text-xs text-critical hover:bg-muted">
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

const CYCLE: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
const THEME_ICON: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const Icon = THEME_ICON[theme];
  return (
    <button
      onClick={() => setTheme(CYCLE[theme])}
      title={`Theme: ${THEME_LABEL[theme]} (click to cycle)`}
      className="p-2 hover:bg-muted min-w-[36px] min-h-[36px] flex items-center justify-center text-muted-foreground hover:text-foreground transition"
    >
      <Icon size={16} />
    </button>
  );
}
