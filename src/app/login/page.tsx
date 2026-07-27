"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Car, Mail, Lock, Loader2, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const HOME: Record<string, string> = {
  admin: "/admin",
  dispatcher: "/dispatch",
};

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const need = params.get("need");

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoading(false);
      setError("Invalid email or password.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", data.user.id)
      .single();

    if (!profile || !profile.is_active) {
      setLoading(false);
      setError("Your account is not active. Contact an admin.");
      await supabase.auth.signOut();
      return;
    }

    const next = params.get("next") || HOME[profile.role] || "/";
    router.push(next);
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50/60 to-white p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/30">
            <Car className="h-8 w-8 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink-950">Staff Sign In</h1>
          <p className="mt-1 text-sm text-gray-500">Dispatchers &amp; admins</p>
        </div>

        {need && (
          <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
            This area needs a <b className="capitalize">{need}</b> account. Please sign in with the right account.
          </div>
        )}

        <form
          onSubmit={signIn}
          className="space-y-4 rounded-3xl border border-gray-100 bg-white p-6 shadow-xl shadow-gray-200/60"
        >
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-xl border border-gray-200 bg-white py-3.5 pl-11 pr-4 text-[15px] outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-xl border border-gray-200 bg-white py-3.5 pl-11 pr-4 text-[15px] outline-none placeholder:text-gray-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 font-semibold text-white shadow-lg shadow-brand-500/30 transition-all hover:bg-brand-600 disabled:bg-gray-200"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (<><LogIn className="h-5 w-5" /> Sign In</>)}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-400">
          Test: admin@taxi.test · dispatch@taxi.test — password <b>taxi1234</b>
        </p>
      </motion.div>
    </main>
  );
}
