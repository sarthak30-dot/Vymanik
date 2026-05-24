import { createFileRoute, Link } from "@tanstack/react-router";
import { LogOut, Bell, Globe, Building2 } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — UrjaScan" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      <div className="bg-white border border-grey-200 divide-y divide-grey-200">
        {[
          { icon: Building2, label: "Account", value: "Rajpur Solar Plant — Client" },
          { icon: Globe, label: "Language", value: "English" },
          { icon: Bell, label: "Notifications", value: "Email + WhatsApp" },
        ].map(r => (
          <div key={r.label} className="flex items-center gap-4 p-4">
            <div className="w-9 h-9 bg-grey-50 border border-grey-200 flex items-center justify-center"><r.icon size={16} className="text-grey-400" /></div>
            <div className="flex-1">
              <p className="font-medium text-sm">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.value}</p>
            </div>
            <button className="text-xs text-ochre font-medium hover:underline">Edit</button>
          </div>
        ))}
      </div>

      <Link to="/" className="w-full h-10 bg-grey-900 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-grey-900/90">
        <LogOut size={16} /> Sign Out
      </Link>

      <p className="text-xs text-center text-muted-foreground pt-4">
        UrjaScan · v1.0 · © 2026 Vymanik Aerospace Technologies Pvt. Ltd.
      </p>
    </div>
  );
}
