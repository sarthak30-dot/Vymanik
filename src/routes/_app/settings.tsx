import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Bell, Globe, Building2, X } from "lucide-react";
import { getUser, clearAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { plant } from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — UrjaScan" }] }),
  component: SettingsPage,
});

function EditModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white border border-grey-200 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-grey-200">
          <p className="font-semibold text-sm">{title}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function SettingsPage() {
  const navigate = useNavigate();
  const { lang, setLang, t } = useI18n();
  const user = getUser();
  const [editModal, setEditModal] = useState<"account" | "language" | "notifications" | null>(null);
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifWhatsapp, setNotifWhatsapp] = useState(true);

  const roleLabel = user
    ? user.role === "admin" ? "Control Center" : user.role === "team" ? "Inspector" : "Plant Owner"
    : "Plant Owner";

  const accountValue = `${plant.name} — ${roleLabel}`;
  const langValue = lang === "en" ? "English" : "हिंदी";
  const notifValue = [notifEmail && "Email", notifWhatsapp && "WhatsApp"].filter(Boolean).join(" + ") || "None";

  function handleSignOut() {
    clearAuth();
    navigate({ to: "/" });
  }

  function saveNotifications() {
    toast.success("Notification preferences saved.");
    setEditModal(null);
  }

  function saveLanguage(l: "en" | "hi") {
    setLang(l);
    toast.success(l === "en" ? "Language set to English." : "भाषा हिंदी में बदली गई।");
    setEditModal(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-5">
      <h1 className="text-2xl font-bold text-foreground">
        {lang === "en" ? "Settings" : "सेटिंग्स"}
      </h1>

      <div className="bg-white border border-grey-200 divide-y divide-grey-200">
        {/* Account */}
        <div className="flex items-center gap-4 p-4">
          <div className="w-9 h-9 bg-grey-50 border border-grey-200 flex items-center justify-center">
            <Building2 size={16} className="text-grey-400" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">{lang === "en" ? "Account" : "खाता"}</p>
            <p className="text-xs text-muted-foreground">{accountValue}</p>
          </div>
          <button
            onClick={() => setEditModal("account")}
            className="text-xs text-ochre font-medium hover:underline"
          >
            {lang === "en" ? "Edit" : "संपादित करें"}
          </button>
        </div>

        {/* Language */}
        <div className="flex items-center gap-4 p-4">
          <div className="w-9 h-9 bg-grey-50 border border-grey-200 flex items-center justify-center">
            <Globe size={16} className="text-grey-400" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">{lang === "en" ? "Language" : "भाषा"}</p>
            <p className="text-xs text-muted-foreground">{langValue}</p>
          </div>
          <button
            onClick={() => setEditModal("language")}
            className="text-xs text-ochre font-medium hover:underline"
          >
            {lang === "en" ? "Edit" : "संपादित करें"}
          </button>
        </div>

        {/* Notifications */}
        <div className="flex items-center gap-4 p-4">
          <div className="w-9 h-9 bg-grey-50 border border-grey-200 flex items-center justify-center">
            <Bell size={16} className="text-grey-400" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">{lang === "en" ? "Notifications" : "सूचनाएं"}</p>
            <p className="text-xs text-muted-foreground">{notifValue}</p>
          </div>
          <button
            onClick={() => setEditModal("notifications")}
            className="text-xs text-ochre font-medium hover:underline"
          >
            {lang === "en" ? "Edit" : "संपादित करें"}
          </button>
        </div>
      </div>

      <button
        onClick={handleSignOut}
        className="w-full h-10 bg-grey-900 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-grey-900/90"
      >
        <LogOut size={16} /> {lang === "en" ? "Sign Out" : "साइन आउट"}
      </button>

      <p className="text-xs text-center text-muted-foreground pt-4">
        UrjaScan · v1.0 · © 2026 Vymanik Aerospace Technologies Pvt. Ltd.
      </p>

      {/* Account edit modal */}
      {editModal === "account" && (
        <EditModal title={lang === "en" ? "Account Details" : "खाता विवरण"} onClose={() => setEditModal(null)}>
          <div className="space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-widest text-grey-400 mb-1">{lang === "en" ? "Plant" : "प्लांट"}</p>
              <p className="text-sm font-medium">{plant.name}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-grey-400 mb-1">{lang === "en" ? "Role" : "भूमिका"}</p>
              <p className="text-sm font-medium">{roleLabel}</p>
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              {lang === "en"
                ? "To change plant access or role, contact your Vymanik Aerospace administrator."
                : "प्लांट एक्सेस या भूमिका बदलने के लिए अपने व्यमानिक एडमिन से संपर्क करें।"}
            </p>
          </div>
        </EditModal>
      )}

      {/* Language edit modal */}
      {editModal === "language" && (
        <EditModal title={lang === "en" ? "Select Language" : "भाषा चुनें"} onClose={() => setEditModal(null)}>
          <div className="space-y-2">
            {(["en", "hi"] as const).map(l => (
              <button
                key={l}
                onClick={() => saveLanguage(l)}
                className={`w-full text-left px-4 py-3 border text-sm font-medium transition ${lang === l ? "border-ochre bg-ochre-muted" : "border-grey-200 hover:bg-grey-50"}`}
              >
                {l === "en" ? "English" : "हिंदी (Hindi)"}
              </button>
            ))}
          </div>
        </EditModal>
      )}

      {/* Notifications edit modal */}
      {editModal === "notifications" && (
        <EditModal title={lang === "en" ? "Notification Preferences" : "सूचना प्राथमिकताएं"} onClose={() => setEditModal(null)}>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={notifEmail} onChange={e => setNotifEmail(e.target.checked)} className="w-4 h-4 accent-ochre" />
              <span className="text-sm">Email</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={notifWhatsapp} onChange={e => setNotifWhatsapp(e.target.checked)} className="w-4 h-4 accent-ochre" />
              <span className="text-sm">WhatsApp</span>
            </label>
            <button
              onClick={saveNotifications}
              className="mt-2 w-full h-9 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm"
            >
              {lang === "en" ? "Save" : "सहेजें"}
            </button>
          </div>
        </EditModal>
      )}
    </div>
  );
}
