"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Check, Building2, BellRing, Plus, X, Mail, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { cn } from "@/lib/format";

interface Config {
  email_from: string;
  sms_sender: string;
  timezone: string;
  /** Exactly who receives the "New booking" alert email. */
  booking_alert_emails: string[];
  /** false until the admin has saved the list at least once (legacy: all staff). */
  alert_emails_saved: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TIMEZONES: { v: string; label: string }[] = [
  { v: "Europe/London", label: "UK — London (Europe/London)" },
  { v: "Europe/Dublin", label: "Ireland — Dublin (Europe/Dublin)" },
  { v: "Asia/Karachi", label: "Pakistan — Karachi (Asia/Karachi)" },
  { v: "Asia/Kolkata", label: "India — Kolkata (Asia/Kolkata)" },
  { v: "Asia/Dubai", label: "UAE — Dubai (Asia/Dubai)" },
  { v: "Europe/Paris", label: "Europe — Paris (Europe/Paris)" },
  { v: "America/New_York", label: "US East — New York" },
  { v: "America/Los_Angeles", label: "US West — Los Angeles" },
  { v: "Australia/Sydney", label: "Australia — Sydney" },
  { v: "UTC", label: "UTC" },
];

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (data?.ok) {
        setConfig(data.config);
      } else {
        setError("Could not load settings.");
      }
      setLoading(false);
    })();
  }, []);

  const setCfg = (k: keyof Config, v: string) => setConfig((c) => (c ? { ...c, [k]: v } : c));

  // Booking alert recipient list
  const [newEmail, setNewEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      setEmailErr("Enter a valid email address.");
      return;
    }
    if (config?.booking_alert_emails.includes(e)) {
      setEmailErr("That address is already on the list.");
      return;
    }
    setConfig((c) => (c ? { ...c, booking_alert_emails: [...c.booking_alert_emails, e] } : c));
    setNewEmail("");
    setEmailErr(null);
  };
  const removeEmail = (e: string) =>
    setConfig((c) => (c ? { ...c, booking_alert_emails: c.booking_alert_emails.filter((x) => x !== e) } : c));

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      setSaving(false);
      if (!data?.ok) {
        setError("Could not save. Please try again.");
        return;
      }
      setSaved(true);
      setConfig((c) => (c ? { ...c, alert_emails_saved: true } : c));
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setSaving(false);
      setError("Could not save. Please try again.");
    }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Notifications & timezone" />

      <div className="max-w-3xl space-y-6 px-5 pb-10 md:px-8">
        {loading || !config ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
          </div>
        ) : (
          <>
            {/* Notifications & timezone */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 font-display font-bold text-ink-950">
                <Building2 className="h-5 w-5 text-emerald-600" /> Notifications &amp; timezone
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">Timezone</span>
                  <select
                    value={config.timezone}
                    onChange={(e) => setCfg("timezone", e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10"
                  >
                    {config.timezone && !TIMEZONES.some((t) => t.v === config.timezone) && (
                      <option value={config.timezone}>{config.timezone}</option>
                    )}
                    {TIMEZONES.map((t) => (
                      <option key={t.v} value={t.v}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="SMS sender ID" value={config.sms_sender} onChange={(v) => setCfg("sms_sender", v)} placeholder="TaxiService" />
                <Field label="Email sender (From)" value={config.email_from} onChange={(v) => setCfg("email_from", v)} placeholder="Taxi <bookings@domain>" full />
              </div>
            </section>

            {/* Booking alert recipients */}
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <h2 className="mb-1 flex items-center gap-2 font-display font-bold text-ink-950">
                <BellRing className="h-5 w-5 text-emerald-600" /> Booking alert emails
              </h2>
              <p className="mb-4 text-xs text-gray-400">
                Every new booking sends a &ldquo;New booking received&rdquo; email to <b>exactly</b> these addresses. Add or
                remove anyone here — dispatcher logins don&apos;t need to match. Remember to save.
              </p>

              {!config.alert_emails_saved && (
                <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Not saved yet — right now alerts go to everyone with a staff login (listed below). Press Save
                  settings to lock this list; after that only the addresses here get alerts.
                </p>
              )}

              <ul className="mb-3 divide-y divide-gray-50 overflow-hidden rounded-xl border border-gray-100">
                {config.booking_alert_emails.length === 0 && (
                  <li className="flex items-center gap-2 px-3.5 py-3 text-sm text-red-600">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> No addresses — nobody will be emailed about new bookings.
                  </li>
                )}
                {config.booking_alert_emails.map((e) => (
                  <li key={e} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-ink-950">
                      <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="truncate">{e}</span>
                    </span>
                    <button
                      onClick={() => removeEmail(e)}
                      aria-label={`Remove ${e}`}
                      title="Remove"
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value);
                    setEmailErr(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                  placeholder="name@example.com"
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10"
                />
                <button
                  onClick={addEmail}
                  disabled={!newEmail.trim()}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
              {emailErr && <p className="mt-2 text-xs text-red-600">{emailErr}</p>}
            </section>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={save}
              disabled={saving}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-colors",
                saved ? "bg-green-600" : "bg-emerald-600 hover:bg-emerald-700"
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? (<><Check className="h-4 w-4" /> Saved</>) : (<><Save className="h-4 w-4" /> Save settings</>)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  full?: boolean;
}) {
  return (
    <label className={cn("block", full && "sm:col-span-2")}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10"
      />
    </label>
  );
}
