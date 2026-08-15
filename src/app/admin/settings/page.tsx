"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Check, Building2 } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { cn } from "@/lib/format";

interface Config {
  email_from: string;
  sms_sender: string;
  timezone: string;
}

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
