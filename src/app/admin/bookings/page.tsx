"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Search,
  ClipboardList,
  X,
  User,
  Users,
  Phone,
  Mail,
  MapPin,
  Navigation,
  CircleDot,
  Baby,
  Banknote,
  CreditCard,
  CalendarClock,
  StickyNote,
  Repeat,
  Route,
  Star,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/admin/PageHeader";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { money, clock, cn } from "@/lib/format";
import { STATUS_META } from "@/lib/constants";
import type { Booking, BookingStatus } from "@/lib/types";

interface Row extends Booking {
  category?: { name: string } | null;
  source?: { name: string } | null;
  driver?: { full_name: string } | null;
  review?: { rating: number; comment: string | null; created_at: string }[] | null;
}

const FILTERS: (BookingStatus | "all")[] = ["all", "pending", "in_progress", "completed", "cancelled"];

export default function BookingsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<BookingStatus | "all">("all");
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState<Row | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select(
          "*, category:vehicle_categories(name), source:websites(name), driver:drivers(full_name), review:ratings(rating, comment, created_at)"
        )
        .order("created_at", { ascending: false })
        .limit(500);
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
  }, [supabase]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (q) {
        const s = q.toLowerCase();
        return (
          r.booking_number.toLowerCase().includes(s) ||
          r.customer_name.toLowerCase().includes(s) ||
          r.pickup_address.toLowerCase().includes(s) ||
          r.dropoff_address.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [rows, filter, q]);

  return (
    <div>
      <PageHeader title="Bookings" subtitle="Complete booking history" />

      <div className="px-5 pb-10 md:px-8">
        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search bookings…"
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-400"
            />
          </div>
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-lg px-3 py-2 text-xs font-semibold capitalize transition-colors",
                  filter === f ? "bg-ink-950 text-white" : "bg-white text-gray-500 hover:bg-gray-100 border border-gray-200"
                )}
              >
                {f === "all" ? "All" : STATUS_META[f as BookingStatus].label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-5 py-3 font-semibold">Booking</th>
                    <th className="px-3 py-3 font-semibold">Customer</th>
                    <th className="px-3 py-3 font-semibold">Route</th>
                    <th className="px-3 py-3 font-semibold">Driver</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 text-right font-semibold">Fare</th>
                    <th className="px-5 py-3 text-right font-semibold">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      onClick={() => setDetail(r)}
                      className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                    >
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold text-gray-500">{r.booking_number}</span>
                          {r.trip_group_id && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">
                              <Repeat className="h-2.5 w-2.5" /> {r.is_return ? "Return" : "Outbound"}
                            </span>
                          )}
                        </span>
                        <p className="text-[11px] text-gray-400">{r.source?.name ?? "—"}</p>
                      </td>
                      <td className="px-3 py-3 text-ink-950">
                        <span className="flex items-center gap-1.5">
                          {r.customer_name}
                          {r.child_seat && (
                            <Baby className="h-3.5 w-3.5 text-brand-500" aria-label="Child seat requested" />
                          )}
                        </span>
                      </td>
                      <td className="max-w-[240px] px-3 py-3">
                        <p className="truncate text-ink-950">{r.pickup_address}</p>
                        <p className="truncate text-xs text-gray-400">→ {r.dropoff_address}</p>
                      </td>
                      <td className="px-3 py-3 text-gray-500">{r.driver?.full_name ?? "—"}</td>
                      <td className="px-3 py-3"><StatusBadge status={r.status} size="xs" /></td>
                      <td className="px-3 py-3 text-right font-display font-bold text-ink-950">{money(r.estimated_fare)}</td>
                      <td className="px-5 py-3 text-right text-xs text-gray-400">{clock(r.created_at)}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="py-12 text-center text-sm text-gray-400">
                  <ClipboardList className="mx-auto mb-2 h-8 w-8 text-gray-300" /> No bookings match
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {detail && (
        <BookingDetailModal
          row={detail}
          linked={
            detail.trip_group_id
              ? rows.find((r) => r.trip_group_id === detail.trip_group_id && r.id !== detail.id) ?? null
              : null
          }
          onClose={() => setDetail(null)}
          onRefunded={(id) =>
            setRows((rs) => rs.map((x) => (x.id === id ? { ...x, payment_status: "refunded" } : x)))
          }
        />
      )}
    </div>
  );
}

function BookingDetailModal({
  row,
  linked,
  onClose,
  onRefunded,
}: {
  row: Row;
  linked?: Row | null;
  onClose: () => void;
  onRefunded: (id: string) => void;
}) {
  const vias = (row.via_points ?? []).filter((v) => v.address);
  const review = row.review?.[0] ?? null;
  const [payStatus, setPayStatus] = useState<string>(row.payment_status);
  const [refunding, setRefunding] = useState(false);
  const [refundErr, setRefundErr] = useState<string | null>(null);

  const refund = async () => {
    if (!confirm(`Refund ${money(row.estimated_fare)} to ${row.customer_name}?`)) return;
    setRefunding(true);
    setRefundErr(null);
    try {
      const res = await fetch("/api/payment/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: row.id }),
      });
      const data = await res.json();
      setRefunding(false);
      if (!data?.ok) {
        setRefundErr("Refund failed. Please try again.");
        return;
      }
      setPayStatus("refunded");
      onRefunded(row.id);
    } catch {
      setRefunding(false);
      setRefundErr("Refund failed. Please try again.");
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-gray-500">{row.booking_number}</span>
              <StatusBadge status={row.status} size="xs" />
            </div>
            <p className="mt-0.5 text-xs text-gray-400">
              {row.source?.name ?? "—"} · {clock(row.created_at)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Customer */}
        <Section title="Customer">
          <DetailRow icon={User} label="Name" value={row.customer_name} />
          <DetailRow icon={Phone} label="WhatsApp" value={row.customer_whatsapp} />
          <DetailRow icon={Mail} label="Email" value={row.customer_email ?? "—"} />
        </Section>

        {/* Trip */}
        <Section title="Trip">
          <DetailRow icon={MapPin} label="Pick-up" value={row.pickup_address} iconClass="text-brand-500" />
          {vias.map((v, i) => (
            <DetailRow key={i} icon={CircleDot} label={`Via ${i + 1}`} value={v.address} iconClass="text-gray-400" />
          ))}
          <DetailRow icon={Navigation} label="Drop-off" value={row.dropoff_address} iconClass="text-ink-950" />
          {row.distance_km != null && (
            <DetailRow
              icon={Route}
              label="Distance"
              value={`${row.distance_km} mi${row.duration_min != null ? ` · ~${row.duration_min} min` : ""}`}
            />
          )}
          <DetailRow
            icon={CalendarClock}
            label="When"
            value={row.scheduled_at ? new Date(row.scheduled_at).toLocaleString() : "As soon as possible"}
          />
          {linked && (
            <DetailRow
              icon={Repeat}
              label={row.is_return ? "Outbound" : "Return"}
              value={linked.booking_number}
              iconClass="text-indigo-500"
              highlight
            />
          )}
        </Section>

        {/* Booking */}
        <Section title="Booking">
          <DetailRow
            icon={row.payment_method === "cash" ? Banknote : CreditCard}
            label="Payment"
            value={`${row.payment_method === "cash" ? "Cash" : "Card"} · ${row.category?.name ?? "—"}`}
          />
          <DetailRow
            icon={Users}
            label="Load"
            value={`${row.passengers} passengers · ${row.suitcases} suitcases · ${row.hand_luggage} hand luggage`}
          />
          <DetailRow
            icon={Baby}
            label="Child seat"
            value={row.child_seat ? "Required" : "Not required"}
            iconClass={row.child_seat ? "text-brand-500" : "text-gray-300"}
            highlight={row.child_seat}
          />
          <DetailRow icon={StickyNote} label="Notes" value={row.notes?.trim() || "—"} />
          <DetailRow icon={User} label="Driver" value={row.driver?.full_name ?? "Not assigned"} />
        </Section>

        {/* Customer rating (shown once the ride is rated) */}
        {review && (
          <Section title="Customer rating">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn(
                      "h-4 w-4",
                      n <= review.rating ? "fill-brand-400 text-brand-400" : "text-gray-200"
                    )}
                  />
                ))}
              </div>
              <span className="text-sm font-semibold text-ink-950">{review.rating}/5</span>
              <span className="text-xs text-gray-400">· {clock(review.created_at)}</span>
            </div>
            {review.comment?.trim() && (
              <p className="mt-1 text-sm italic text-gray-600">“{review.comment.trim()}”</p>
            )}
          </Section>
        )}

        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-brand-800">
              {payStatus === "paid" ? "Paid" : payStatus === "refunded" ? "Refunded" : "Estimated fare"}
            </span>
            <span className="font-display text-xl font-bold text-ink-950">{money(row.estimated_fare)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-brand-200/60 pt-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                row.payment_method === "cash"
                  ? payStatus === "paid"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                  : payStatus === "paid"
                  ? "bg-green-100 text-green-700"
                  : payStatus === "refunded"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              )}
            >
              {row.payment_method === "cash"
                ? payStatus === "paid"
                  ? "Cash collected by driver ✓"
                  : "Cash — not yet collected"
                : payStatus === "paid"
                ? "Paid by card"
                : payStatus === "refunded"
                ? "Refunded"
                : "Card — payment pending"}
            </span>
            {row.payment_method === "card" && payStatus === "paid" && (
              <button
                onClick={refund}
                disabled={refunding}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {refunding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refund"}
              </button>
            )}
          </div>
          {refundErr && <p className="mt-2 text-xs text-red-600">{refundErr}</p>}
        </div>
      </motion.div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="space-y-2.5 rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">{children}</div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  iconClass = "text-gray-400",
  highlight = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  iconClass?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className={cn("min-w-0 flex-1 break-words", highlight ? "font-semibold text-brand-700" : "text-ink-950")}>
        {value}
      </span>
    </div>
  );
}
