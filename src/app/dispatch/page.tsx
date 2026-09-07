"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Radio,
  MapPin,
  Navigation,
  Clock,
  Users,
  Loader2,
  Globe,
  UserCheck,
  Inbox,
  Banknote,
  CreditCard,
  Zap,
  Plus,
  X,
  Ban,
  CalendarClock,
  MessageCircle,
  Car,
  PlayCircle,
  Flag,
  Repeat,
  Route,
  CircleDot,
  Baby,
  Mail,
  Phone,
  StickyNote,
  Check,
  ArrowLeft,
  Map as MapIcon,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import DriverMap from "@/components/dispatch/DriverMap";
import BookingWidget from "@/components/booking/BookingWidget";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { money, timeAgo, cn, normalizeWhatsapp } from "@/lib/format";
import type { Booking, Driver } from "@/lib/types";

interface JobRow extends Booking {
  category?: { name: string } | null;
  source?: { name: string; color: string } | null;
  driver?: { full_name: string } | null;
}

// A driver is genuinely "on a trip" only once they're actively driving —
// merely being "assigned" (job sent on WhatsApp, maybe not even seen yet) or
// holding a future/queued job should NOT flag them as busy.
const BUSY_STATUSES = ["driver_arrived", "in_progress"];

const OPEN_STATUSES = [
  "pending",
  "assigned",
  "accepted",
  "driver_arrived",
  "in_progress",
  "declined",
  "no_driver_found",
];

export default function DispatchPage() {
  const supabase = createClient();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [view, setView] = useState<"live" | "scheduled">("live");
  // Phone-only: route map inside the job-details sheet (desktop has the centre map)
  const [showMap, setShowMap] = useState(false);
  // Trip being completed — dispatcher confirms the fare + (for cash) collection.
  const [completing, setCompleting] = useState<{
    id: string;
    fare: string;
    isCash: boolean;
    cashReceived: boolean;
  } | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const audioCtx = useRef<AudioContext | null>(null);
  const [nowMs, setNowMs] = useState(0);

  // Keep "now" fresh so scheduled rides move into the Live list when due
  useEffect(() => {
    setNowMs(Date.now());
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  const isFutureScheduled = (j: JobRow) =>
    !!j.scheduled_at && new Date(j.scheduled_at).getTime() > nowMs && j.status === "pending";
  const scheduledJobs = jobs.filter(isFutureScheduled);
  const liveJobs = jobs.filter((j) => !isFutureScheduled(j));
  const displayJobs = view === "live" ? liveJobs : scheduledJobs;

  const beep = () => {
    try {
      audioCtx.current ??= new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioCtx.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      o.start();
      o.stop(ctx.currentTime + 0.36);
    } catch {
      /* ignore */
    }
  };

  const loadJobs = useCallback(async () => {
    const { data } = await supabase
      .from("bookings")
      .select(
        "*, category:vehicle_categories(name), source:websites(name,color), driver:drivers(full_name)"
      )
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: false });
    setJobs((data as JobRow[]) ?? []);
  }, [supabase]);

  const loadDrivers = useCallback(async () => {
    const { data } = await supabase.from("drivers").select("*").eq("is_blocked", false);
    setDrivers((data as Driver[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      await Promise.all([loadJobs(), loadDrivers()]);
      setLoading(false);
    })();
  }, [loadJobs, loadDrivers]);

  // mark initial ids as known so we don't beep on first load
  useEffect(() => {
    if (!loading) jobs.forEach((j) => knownIds.current.add(j.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("dispatch")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bookings" }, () => {
        beep();
        loadJobs();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings" }, () => loadJobs())
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () => loadDrivers())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase, loadJobs, loadDrivers]);

  const assign = async (driverId: string) => {
    if (!selected) return;
    setAssigning(driverId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("bookings")
      .update({ driver_id: driverId, dispatcher_id: user?.id ?? null, status: "assigned" })
      .eq("id", selected.id);
    setAssigning(null);
    loadJobs();
  };

  const setStatus = async (status: string) => {
    if (!selected) return;
    await supabase.from("bookings").update({ status }).eq("id", selected.id);
    loadJobs();
  };

  // Complete a trip: record the actual fare and, for cash, whether the driver
  // collected it (marks it paid + logs it so it counts toward the driver's cash).
  const confirmComplete = async () => {
    if (!completing) return;
    const finalFare = Number(completing.fare);
    await supabase.rpc("complete_ride", {
      p_booking_id: completing.id,
      p_final_fare: Number.isFinite(finalFare) && finalFare >= 0 ? finalFare : null,
      p_cash_received: completing.isCash ? completing.cashReceived : true,
    });
    setCompleting(null);
    loadJobs();
  };

  const cancelJob = async (id: string) => {
    if (!confirm("Cancel this ride? The customer will no longer be picked up.")) return;
    await supabase.from("bookings").update({ status: "cancelled" }).eq("id", id);
    setSelectedId(null);
    loadJobs();
  };

  // How the fare should be handled, shown to driver + dispatcher.
  const payLine = (job: JobRow) => {
    const fare = money(job.estimated_fare);
    if (job.payment_method === "card") {
      return job.payment_status === "paid"
        ? `💳 PAID by card — ${fare} (do NOT collect cash)`
        : `💳 Card — ${fare} (payment pending)`;
    }
    return `💷 CASH to collect — ${fare}`;
  };

  // WhatsApp "click to send" link, pre-filled with the full job details
  const waLink = (whatsapp: string | null | undefined, job: JobRow) => {
    const digits = normalizeWhatsapp(whatsapp);
    const when = job.scheduled_at
      ? "🕐 Scheduled: " + new Date(job.scheduled_at).toLocaleString()
      : "⏱️ ASAP";
    const vias = (job.via_points ?? []).map((v) => v.address).filter(Boolean);
    const dist = job.distance_km ? `📏 ${job.distance_km} mi` + (job.duration_min ? ` · ~${job.duration_min} min` : "") + "\n" : "";
    const msg =
      `🚕 ${job.is_return ? "Return Ride" : "New Ride"} — ${job.booking_number}\n` +
      `🚗 Car: ${job.category?.name ?? "—"}\n` +
      `📍 Pickup: ${job.pickup_address}\n` +
      (vias.length ? `🔁 Via: ${vias.join(", ")}\n` : "") +
      `🎯 Drop-off: ${job.dropoff_address}\n` +
      dist +
      `👤 ${job.customer_name} (${job.customer_whatsapp})\n` +
      (job.customer_email ? `✉️ ${job.customer_email}\n` : "") +
      `👥 ${job.passengers} passengers · 🧳 ${job.suitcases} suitcases · 🎒 ${job.hand_luggage} hand luggage\n` +
      (job.child_seat ? `👶 Child seat required\n` : "") +
      (job.notes ? `📝 Notes: ${job.notes}\n` : "") +
      `${payLine(job)}\n` +
      when;
    return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
  };

  // Drivers are notified by WhatsApp and don't report an online status, so any
  // approved, non-blocked driver can be assigned to any job. "On a trip" is only
  // a hint derived from active jobs — it never hides a driver from the list.
  const busyElsewhere = new Set(
    jobs
      .filter(
        (j) =>
          BUSY_STATUSES.includes(j.status) &&
          j.driver_id &&
          j.id !== selectedId &&
          // The other leg of the SAME return trip isn't "elsewhere".
          !(selected?.trip_group_id && j.trip_group_id === selected.trip_group_id)
      )
      .map((j) => j.driver_id)
  );
  const assignableDrivers = drivers.filter((d) => d.is_approved && !d.is_blocked);
  const driverCount = assignableDrivers.length;
  const selectedDriver = selected?.driver_id ? drivers.find((d) => d.id === selected.driver_id) : null;
  // The paired leg of a return trip (same trip_group_id), so the dispatcher can
  // see and jump to the outbound/return counterpart.
  const linkedLeg = selected?.trip_group_id
    ? jobs.find((j) => j.trip_group_id === selected.trip_group_id && j.id !== selected.id)
    : null;
  const selectedVias = (selected?.via_points ?? []).map((v) => v.address).filter(Boolean);

  // Only rides that need attention now — future scheduled ones live in their own tab.
  const pendingCount = liveJobs.filter((j) => j.status === "pending").length;

  return (
    // Phones: fill the viewport minus the bottom tab bar; desktop: full height.
    <div className="flex h-[calc(100dvh-64px-env(safe-area-inset-bottom))] flex-col bg-gray-50 md:h-screen">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 sm:px-5 md:h-16">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 md:h-9 md:w-9">
            <Radio className="h-5 w-5 text-white" strokeWidth={2.3} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-display text-[15px] font-bold leading-tight text-ink-950 md:text-base">
              Dispatch Center
            </h1>
            <p className="hidden text-xs text-gray-400 sm:block">Live operations</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Stat icon={Inbox} label="Pending" value={pendingCount} tone="amber" />
          <Stat icon={Users} label="Drivers" value={driverCount} tone="green" className="hidden sm:flex" />
          <button
            onClick={() => setShowManual(true)}
            aria-label="New booking"
            className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 sm:px-4"
          >
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Booking</span>
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-2.5 sm:p-4 lg:grid-cols-[360px_1fr_380px]">
          {/* LEFT — Job list */}
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="flex gap-1 border-b border-gray-100 p-2">
              {(
                [
                  ["live", "Live", liveJobs.length],
                  ["scheduled", "Scheduled", scheduledJobs.length],
                ] as const
              ).map(([k, label, count]) => (
                <button
                  key={k}
                  onClick={() => {
                    setView(k);
                    setSelectedId(null);
                  }}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors",
                    view === k ? "bg-ink-950 text-white" : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  {label}
                  <span className={cn("rounded-full px-1.5 text-xs", view === k ? "bg-white/20" : "bg-gray-100")}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
            <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-3">
              {displayJobs.length === 0 && (
                <div className="py-16 text-center text-sm text-gray-400">
                  {view === "scheduled" ? (
                    <CalendarClock className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  ) : (
                    <Inbox className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                  )}
                  {view === "scheduled" ? "No upcoming rides" : "No active jobs"}
                </div>
              )}
              {displayJobs.map((j, i) => (
                <motion.button
                  key={j.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  onClick={() => setSelectedId(j.id)}
                  className={cn(
                    "w-full rounded-xl border p-3 text-left transition-all",
                    selectedId === j.id
                      ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/10"
                      : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-gray-400">{j.booking_number}</span>
                      {j.is_return && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">
                          <Repeat className="h-2.5 w-2.5" /> Return
                        </span>
                      )}
                    </span>
                    <StatusBadge status={j.status} size="xs" />
                  </div>
                  {j.scheduled_at && (
                    <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {new Date(j.scheduled_at).toLocaleString([], {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                  <div className="space-y-1 text-sm">
                    <p className="flex items-center gap-1.5 text-ink-950">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                      <span className="truncate">{j.pickup_address}</span>
                    </p>
                    {(j.via_points ?? []).map((v, vi) => (
                      <p key={vi} className="flex items-center gap-1.5 text-gray-400">
                        <CircleDot className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{v.address}</span>
                      </p>
                    ))}
                    <p className="flex items-center gap-1.5 text-gray-500">
                      <Navigation className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="truncate">{j.dropoff_address}</span>
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: (j.source?.color ?? "#f5b301") + "20",
                        color: j.source?.color ?? "#b37a00",
                      }}
                    >
                      <Globe className="h-3 w-3" />
                      {j.source?.name ?? "Web"}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-gray-400">
                      <Clock className="h-3 w-3" />
                      {timeAgo(j.created_at)}
                      <span className="font-display font-bold text-ink-950">{money(j.estimated_fare)}</span>
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </section>

          {/* CENTER — Map */}
          <section className="hidden min-h-0 lg:block">
            <DriverMap selectedJob={selected} />
          </section>

          {/* RIGHT — Assign. On phones it becomes a full-screen "job details" sheet
              that opens over the list once a job is tapped. */}
          <section
            className={cn(
              "min-h-0 flex-col overflow-hidden bg-white",
              "fixed inset-0 z-40 md:left-56 lg:static lg:z-auto lg:rounded-2xl lg:border lg:border-gray-200",
              selected ? "flex" : "hidden lg:flex"
            )}
          >
            <div className="flex items-center gap-1.5 border-b border-gray-100 px-3 py-2.5 lg:px-4 lg:py-3">
              <button
                onClick={() => setSelectedId(null)}
                aria-label="Back to jobs"
                className="-ml-1 rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="font-display text-sm font-bold text-ink-950">
                <span className="lg:hidden">Job details</span>
                <span className="hidden lg:inline">Assign Driver</span>
              </h2>
              {selected && (
                <span className="ml-auto lg:hidden">
                  <StatusBadge status={selected.status} size="xs" />
                </span>
              )}
            </div>
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-gray-400">
                <UserCheck className="mb-3 h-10 w-10 text-gray-300" />
                Select a job to assign a driver &amp; notify on WhatsApp
              </div>
            ) : (
              <div className="scroll-thin flex-1 overflow-y-auto p-4">
                <div className="mb-4 rounded-xl bg-gray-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-gray-400">
                      {selected.booking_number}
                    </span>
                    <span className="font-display text-lg font-bold text-ink-950">
                      {money(selected.estimated_fare)}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-ink-950">{selected.customer_name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-gray-500">
                    {selected.payment_method === "cash" ? (
                      <Banknote className="h-3.5 w-3.5" />
                    ) : (
                      <CreditCard className="h-3.5 w-3.5" />
                    )}
                    {selected.payment_method} · {selected.category?.name ?? "—"}
                  </p>

                  {/* Payment status + trip type */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        selected.payment_method === "cash"
                          ? "bg-gray-100 text-gray-600"
                          : selected.payment_status === "paid"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {selected.payment_method === "cash"
                        ? `Cash to collect · ${money(selected.estimated_fare)}`
                        : selected.payment_status === "paid"
                        ? "Paid by card"
                        : "Card — pending"}
                    </span>
                    {(selected.is_return || linkedLeg) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
                        <Repeat className="h-3 w-3" /> {selected.is_return ? "Return leg" : "Outbound leg"}
                      </span>
                    )}
                  </div>

                  {/* Route the driver takes */}
                  <div className="mt-2.5 space-y-1 border-t border-gray-200 pt-2 text-xs">
                    <p className="flex items-start gap-1.5 text-ink-950">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500" /> {selected.pickup_address}
                    </p>
                    {selectedVias.map((v, i) => (
                      <p key={i} className="flex items-start gap-1.5 text-gray-500">
                        <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" /> {v}
                      </p>
                    ))}
                    <p className="flex items-start gap-1.5 text-gray-600">
                      <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" /> {selected.dropoff_address}
                    </p>
                    {selected.distance_km != null && (
                      <p className="flex items-center gap-1.5 text-gray-400">
                        <Route className="h-3.5 w-3.5 shrink-0" /> {selected.distance_km} mi
                        {selected.duration_min != null ? ` · ~${selected.duration_min} min` : ""}
                      </p>
                    )}
                    {linkedLeg && (
                      <button
                        onClick={() => setSelectedId(linkedLeg.id)}
                        className="flex items-center gap-1.5 font-medium text-indigo-600 hover:underline"
                      >
                        <Repeat className="h-3.5 w-3.5 shrink-0" />
                        {selected.is_return ? "Outbound" : "Return"} leg: {linkedLeg.booking_number}
                      </button>
                    )}
                  </div>

                  {selected.child_seat && (
                    <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand-100 px-2.5 py-1.5 text-xs font-semibold text-brand-800">
                      <Baby className="h-3.5 w-3.5 shrink-0" /> Child seat required
                    </p>
                  )}

                  <div className="mt-2 space-y-1.5 border-t border-gray-200 pt-2 text-xs text-gray-600">
                    <p className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 shrink-0 text-gray-400" /> {selected.passengers} passengers ·{" "}
                      {selected.suitcases} suitcases · {selected.hand_luggage} hand luggage
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" /> {selected.customer_whatsapp}
                    </p>
                    {selected.customer_email && (
                      <p className="flex items-center gap-1.5 break-all">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-gray-400" /> {selected.customer_email}
                      </p>
                    )}
                    {selected.notes?.trim() && (
                      <p className="flex items-start gap-1.5">
                        <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" /> {selected.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Phone-only route map (desktop shows it in the centre column) */}
                <button
                  onClick={() => setShowMap((v) => !v)}
                  className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 lg:hidden"
                >
                  <MapIcon className="h-4 w-4 text-brand-500" /> {showMap ? "Hide route map" : "Show route map"}
                </button>
                {showMap && (
                  <div className="mb-3 h-56 overflow-hidden rounded-xl border border-gray-200 lg:hidden">
                    <DriverMap selectedJob={selected} />
                  </div>
                )}

                {/* Assigned driver → WhatsApp notify + status controls */}
                {selectedDriver && (
                  <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3">
                    <div className="mb-2.5 flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                        {selectedDriver.full_name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-950">{selectedDriver.full_name}</p>
                        <p className="truncate text-xs text-gray-500">
                          {selectedDriver.whatsapp || selectedDriver.phone || "No number"}
                        </p>
                        {selectedDriver.service_area && (
                          <p className="flex items-center gap-1 truncate text-xs text-brand-700">
                            <MapPin className="h-3 w-3 shrink-0" /> {selectedDriver.service_area}
                          </p>
                        )}
                      </div>
                    </div>

                    <a
                      href={waLink(selectedDriver.whatsapp || selectedDriver.phone, selected)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700"
                    >
                      <MessageCircle className="h-4 w-4" /> Notify on WhatsApp
                    </a>

                    <div className="mt-2.5 space-y-2">
                      {(selected.status === "assigned" || selected.status === "accepted") && (
                        <StatusBtn icon={Car} label="Mark driver arrived" onClick={() => setStatus("driver_arrived")} />
                      )}
                      {selected.status === "driver_arrived" && (
                        <StatusBtn icon={PlayCircle} label="Start trip" onClick={() => setStatus("in_progress")} />
                      )}
                      {selected.status === "in_progress" && (
                        <StatusBtn
                          icon={Flag}
                          label="Complete trip"
                          tone="green"
                          onClick={() =>
                            setCompleting({
                              id: selected.id,
                              fare: String(selected.estimated_fare ?? 0),
                              isCash: selected.payment_method === "cash",
                              cashReceived: true,
                            })
                          }
                        />
                      )}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => cancelJob(selected.id)}
                  className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  <Ban className="h-3.5 w-3.5" /> Cancel this ride
                </button>

                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <Zap className="h-3.5 w-3.5 text-brand-500" /> {selectedDriver ? "Reassign to" : "Assign a driver"}
                </p>

                {assignableDrivers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">
                    No drivers yet — add them in Admin → Drivers
                  </p>
                ) : (
                  <div className="space-y-2">
                    {assignableDrivers.map((d, i) => {
                      const onTrip = busyElsewhere.has(d.id);
                      const isCurrent = selectedDriver?.id === d.id;
                      return (
                        <motion.div
                          key={d.id}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-center gap-3 rounded-xl border border-gray-100 p-2.5"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                            {d.full_name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-ink-950">{d.full_name}</span>
                              {onTrip && !isCurrent && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
                                  <Car className="h-2.5 w-2.5" /> On a trip
                                </span>
                              )}
                            </p>
                            {d.service_area && (
                              <p className="flex items-center gap-1 truncate text-xs font-medium text-brand-700">
                                <MapPin className="h-3 w-3 shrink-0" /> {d.service_area}
                              </p>
                            )}
                            <p className="text-xs text-gray-400">
                              ★ {Number(d.rating).toFixed(1)} · {d.total_trips} trips
                            </p>
                          </div>
                          <button
                            onClick={() => assign(d.id)}
                            disabled={assigning === d.id || isCurrent}
                            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
                          >
                            {assigning === d.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isCurrent ? (
                              "Assigned"
                            ) : selectedDriver ? (
                              "Switch"
                            ) : (
                              "Assign"
                            )}
                          </button>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {showManual && <ManualBookingModal onClose={() => setShowManual(false)} />}

      {completing && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setCompleting(null)}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full overflow-hidden rounded-t-3xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl sm:max-w-xs sm:rounded-2xl sm:pb-5"
          >
            <h3 className="font-display text-lg font-bold text-ink-950">Complete trip</h3>
            <p className="mt-1 text-xs text-gray-400">
              Confirm the final fare charged. Adjust for waiting time, tolls or extras.
            </p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Final fare (£)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              autoFocus
              value={completing.fare}
              onChange={(e) => setCompleting({ ...completing, fare: e.target.value })}
              className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 sm:text-[15px]"
            />
            {completing.isCash && (
              <button
                type="button"
                onClick={() => setCompleting({ ...completing, cashReceived: !completing.cashReceived })}
                className="mt-3 flex w-full items-center gap-2.5 rounded-xl border-2 border-gray-100 px-4 py-3 text-left text-sm font-medium text-ink-950"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                    completing.cashReceived ? "border-green-600 bg-green-600 text-white" : "border-gray-300"
                  )}
                >
                  {completing.cashReceived && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className="flex items-center gap-1.5">
                  <Banknote className="h-4 w-4 text-green-600" /> Cash received from customer
                </span>
              </button>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setCompleting(null)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmComplete}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
              >
                <Flag className="h-4 w-4" /> Complete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function ManualBookingModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="min-h-full w-full overflow-hidden bg-white shadow-xl sm:my-6 sm:min-h-0 sm:max-w-md sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-950">New booking</h3>
            <p className="text-xs text-gray-400">Phone or walk-in — same flow as the customer</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">
          <BookingWidget site="main" manual />
        </div>
      </motion.div>
    </div>
  );
}

function StatusBtn({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: "green";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-colors",
        tone === "green" ? "bg-green-600 hover:bg-green-700" : "bg-ink-950 hover:bg-ink-800"
      )}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "amber" | "green";
  className?: string;
}) {
  const tones = {
    amber: "bg-brand-50 text-brand-700",
    green: "bg-green-50 text-green-700",
  };
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border border-gray-100 px-2.5 py-1.5 sm:px-3", className)}>
      <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tones[tone])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="leading-tight">
        <p className="font-display text-sm font-bold text-ink-950">{value}</p>
        <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      </div>
    </div>
  );
}
