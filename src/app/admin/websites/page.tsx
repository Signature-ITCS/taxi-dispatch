"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Plus, Globe, Copy, Check, X, ExternalLink, Code2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/admin/PageHeader";
import { cn } from "@/lib/format";
import type { Website } from "@/lib/types";

export default function WebsitesPage() {
  const supabase = createClient();
  const [sites, setSites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", domain: "" });
  const [saving, setSaving] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const embedCode = (slug: string) =>
    `<iframe src="${origin}/embed/${slug}" width="100%" height="640" style="border:0;border-radius:16px;max-width:440px" loading="lazy" title="Book a taxi"></iframe>`;

  const load = async () => {
    const { data } = await supabase.from("websites").select("*").order("created_at");
    setSites((data as Website[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = (key: string) => {
    navigator.clipboard?.writeText(key);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const toggle = async (s: Website) => {
    await supabase.from("websites").update({ is_active: !s.is_active }).eq("id", s.id);
    load();
  };

  const add = async () => {
    if (!form.name.trim() || !form.slug.trim()) return;
    setSaving(true);
    await supabase.from("websites").insert({
      name: form.name,
      slug: form.slug.toLowerCase().replace(/\s+/g, "-"),
      domain: form.domain || null,
    });
    setSaving(false);
    setForm({ name: "", slug: "", domain: "" });
    setShowAdd(false);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Websites"
        subtitle="Booking sources that embed the widget"
        action={
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Add Website
          </button>
        }
      />

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="grid gap-4 px-5 pb-10 md:grid-cols-2 md:px-8">
          {sites.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: s.color + "22", color: s.color }}>
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-display font-bold text-ink-950">{s.name}</p>
                    <p className="text-xs text-gray-400">{s.domain || s.slug}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggle(s)}
                  className={cn("relative h-6 w-11 rounded-full transition-colors", s.is_active ? "bg-emerald-500" : "bg-gray-200")}
                >
                  <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", s.is_active ? "left-[22px]" : "left-0.5")} />
                </button>
              </div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">API key</p>
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <code className="flex-1 truncate font-mono text-xs text-gray-500">{s.api_key}</code>
                <button onClick={() => copy(s.api_key)} className="rounded p-1 text-gray-400 hover:text-emerald-600">
                  {copied === s.api_key ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              <p className="mb-1.5 mt-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <Code2 className="h-3.5 w-3.5" /> Embed code
              </p>
              <div className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                <code className="flex-1 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-gray-600">
                  {embedCode(s.slug)}
                </code>
                <button
                  onClick={() => copy(embedCode(s.slug))}
                  className="shrink-0 rounded p-1 text-gray-400 hover:text-emerald-600"
                  title="Copy embed code"
                >
                  {copied === embedCode(s.slug) ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <a
                href={`/embed/${s.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Preview widget
              </a>
            </motion.div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAdd(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="mb-4 font-display text-lg font-bold text-ink-950">Add Website</h3>
            <div className="space-y-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Website name" className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400" />
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Slug (e.g. citycabs)" className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400" />
              <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="Domain (optional)" className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400" />
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={add} disabled={saving} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-300">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4" /> Add</>}
              </button>
              <button onClick={() => setShowAdd(false)} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200">
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
