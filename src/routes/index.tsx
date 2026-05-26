import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Plane, Shield, KeyRound, Mail, Lock, Phone, Loader2 } from "lucide-react";
import { UrjaScanLogo } from "@/components/UrjaScanLogo";
import { api } from "@/lib/api";
import { setAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "UrjaScan — Solar Intelligence. Delivered from the Sky." },
      { name: "description", content: "Drone-based solar panel thermography inspection portal by Vymanik Aerospace." },
    ],
  }),
  component: LoginPage,
});

type Role = "client" | "team" | "admin";

function LoginPage() {
  const [role, setRole] = useState<Role>("client");
  const [otpMode, setOtpMode] = useState(false);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (otpMode) {
      if (!phone.trim()) {
        setError(lang === "en" ? "Please enter your phone number." : "कृपया अपना फ़ोन नंबर दर्ज करें।");
        return;
      }
      if (!otp.trim() || otp.trim().length < 6) {
        setError(lang === "en" ? "Please enter the 6-digit OTP sent to your phone." : "कृपया 6-अंकीय OTP दर्ज करें।");
        return;
      }
      setError(lang === "en" ? "OTP login is not yet available. Please use your email and password." : "OTP लॉगिन अभी उपलब्ध नहीं है। कृपया ईमेल और पासवर्ड का उपयोग करें।");
      return;
    }

    setLoading(true);
    try {
      const auth = await api.auth.login({ email, password, role });
      setAuth(auth.token, {
        userId: auth.userId,
        role: auth.role,
        plantIds: auth.plantIds,
      });
      await navigate({ to: "/dashboard" });
    } catch {
      setError(lang === "en" ? "Login failed. Please check your credentials and try again." : "लॉगिन विफल। कृपया अपनी जानकारी जांचें।");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      {/* Left brand panel */}
      <div className="lg:w-1/2 bg-primary text-white relative flex flex-col justify-between p-8 lg:p-12 min-h-[40vh] lg:min-h-screen">
        <div>
          <UrjaScanLogo size="lg" className="[&_.text-ochre]:!text-white [&_.text-foreground]:!text-white/70" />
        </div>
        <div className="max-w-lg">
          <h2 className="text-3xl lg:text-5xl font-bold leading-tight text-white">
            Solar Intelligence.<br />
            <span className="text-ochre">Delivered from the Sky.</span>
          </h2>
          <p className="mt-4 text-white/70 text-lg">
            Drone thermography, anomaly tracking, and warranty-grade reports for India&apos;s solar plants.
          </p>
        </div>
        <p className="text-white/50 text-xs tracking-wide">
          Drone Inspected · GPS Mapped · IEC 62446-3 Certified
        </p>
      </div>

      {/* Right form */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-bold text-foreground">
            {lang === "en" ? "Sign in to UrjaScan" : "UrjaScan में साइन इन करें"}
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">Access your solar plant inspection portal.</p>

          {/* Role tabs */}
          <div className="mt-6 grid grid-cols-3 gap-px bg-grey-200 border border-grey-200">
            {([
              { id: "client", icon: Building2, label: "Plant Owner" },
              { id: "team", icon: Plane, label: "Inspector" },
              { id: "admin", icon: Shield, label: "Control Center" },
            ] as const).map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRole(r.id)}
                className={`flex flex-col items-center gap-1 py-3 text-sm font-medium transition ${
                  role === r.id
                    ? "bg-primary text-white"
                    : "bg-white text-muted-foreground hover:text-foreground hover:bg-grey-50"
                }`}
              >
                <r.icon size={16} />
                {r.label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest text-grey-400">Email</label>
              <div className="mt-1.5 relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 border border-grey-200 bg-white text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ochre"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            {!otpMode ? (
              <div>
                <label className="text-xs font-semibold uppercase tracking-widest text-grey-400">Password</label>
                <div className="mt-1.5 relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 border border-grey-200 bg-white text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ochre"
                    placeholder="Minimum 6 characters"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-grey-400">Phone</label>
                  <div className="mt-1.5 relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 border border-grey-200 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-ochre"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-widest text-grey-400">OTP</label>
                  <input
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    className="mt-1.5 w-full h-10 px-3 border border-grey-200 bg-white mono tracking-widest text-sm focus:outline-none focus:ring-1 focus:ring-ochre"
                    placeholder="• • • • • •"
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-critical bg-critical/5 border border-critical/20 px-3 py-2">{error}</p>
            )}

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => setOtpMode(!otpMode)}
                className="text-ochre font-medium hover:underline inline-flex items-center gap-1 text-xs"
              >
                <KeyRound size={13} /> {otpMode ? "Use password" : "Login with OTP instead"}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-ochre hover:bg-ochre-light text-ochre-fg font-semibold text-sm transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {lang === "en" ? "Log In" : "लॉग इन"}
            </button>
          </form>

          <div className="mt-8 flex items-center justify-between text-xs text-muted-foreground">
            <button type="button" onClick={() => setLang(lang === "en" ? "hi" : "en")} className="hover:text-foreground">
              {lang === "en" ? "English | हिंदी" : "हिंदी | English"}
            </button>
            <span>Powered by <span className="font-semibold text-foreground">Vymanik Aerospace</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
