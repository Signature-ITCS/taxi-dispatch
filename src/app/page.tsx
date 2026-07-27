"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Car, ArrowRight, Lock } from "lucide-react";

const parts = [
  {
    href: "/book",
    title: "Book a Ride",
    subtitle: "Customer booking",
    desc: "Fast, mobile-first booking with live fares.",
    icon: Car,
    accent: "from-brand-400 to-brand-600",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white via-brand-50/40 to-white">
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center"
        >
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/30">
            <Car className="h-9 w-9 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink-950 md:text-6xl">
            Taxi<span className="text-gradient-brand">Flow</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-500">
            One central system for booking &amp; dispatch — connecting every website,
            driver and dispatcher in real time.
          </p>
        </motion.div>

        {/* Parts grid */}
        <div className="mx-auto mt-16 grid max-w-md gap-5">
          {parts.map((p, i) => (
            <motion.div
              key={p.href}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                href={p.href}
                className="group relative flex h-full items-start gap-4 overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-brand-500/10"
              >
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${p.accent} text-white shadow-md`}
                >
                  <p.icon className="h-7 w-7" strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                    {p.subtitle}
                  </p>
                  <h2 className="mt-0.5 font-display text-xl font-bold text-ink-950">
                    {p.title}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">{p.desc}</p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-gray-300 transition-all group-hover:translate-x-1 group-hover:text-brand-500" />
              </Link>
            </motion.div>
          ))}
        </div>

        <div className="mt-14 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-400 transition-colors hover:text-brand-600"
          >
            <Lock className="h-3.5 w-3.5" /> Staff login
          </Link>
        </div>
      </div>
    </main>
  );
}
