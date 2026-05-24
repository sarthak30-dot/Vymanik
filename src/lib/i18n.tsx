import { createContext, useContext, useState, type ReactNode } from "react";

type Lang = "en" | "hi";

const dict: Record<string, { en: string; hi: string }> = {
  welcome_back: { en: "Welcome back", hi: "वापस स्वागत है" },
  client: { en: "Client", hi: "ग्राहक" },
  team: { en: "Team", hi: "टीम" },
  admin: { en: "Admin", hi: "एडमिन" },
  email: { en: "Email", hi: "ईमेल" },
  password: { en: "Password", hi: "पासवर्ड" },
  login: { en: "Log In", hi: "लॉग इन" },
  login_otp: { en: "Login with OTP instead", hi: "OTP से लॉग इन करें" },
  forgot: { en: "Forgot password?", hi: "पासवर्ड भूल गए?" },
  tagline: { en: "Solar Intelligence. Delivered from the Sky.", hi: "सौर बुद्धिमत्ता। आकाश से।" },
  plant_health: { en: "Plant Health Score", hi: "प्लांट स्वास्थ्य स्कोर" },
  critical_anomalies: { en: "Critical Anomalies", hi: "गंभीर खराबियां" },
  medium_anomalies: { en: "Medium Anomalies", hi: "मध्यम खराबियां" },
  panels_healthy: { en: "Panels Healthy", hi: "स्वस्थ पैनल" },
  est_daily_loss: { en: "Estimated daily energy loss due to anomalies", hi: "अनुमानित दैनिक नुकसान" },
  view_map: { en: "View Site Map", hi: "साइट मैप देखें" },
  see_all: { en: "See All Anomalies", hi: "सभी खराबियां देखें" },
  immediate: { en: "Immediate action needed", hi: "तुरंत कार्रवाई जरूरी" },
  schedule_30: { en: "Schedule repair within 30 days", hi: "30 दिनों में मरम्मत करें" },
  no_action: { en: "No action required", hi: "कोई कार्रवाई आवश्यक नहीं" },
  status_new: { en: "New", hi: "नया" },
  status_ack: { en: "Acknowledged", hi: "स्वीकृत" },
  status_repair: { en: "In Repair", hi: "मरम्मत में" },
  status_closed: { en: "Closed", hi: "बंद" },
  last_inspected: { en: "Last inspected", hi: "अंतिम निरीक्षण" },
  next: { en: "Next", hi: "अगला" },
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: keyof typeof dict) => string;
}
const Ctx = createContext<I18nCtx>({ lang: "en", setLang: () => {}, t: (k) => dict[k]?.en ?? k });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const t = (k: keyof typeof dict) => dict[k]?.[lang] ?? String(k);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
