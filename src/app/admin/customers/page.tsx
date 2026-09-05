"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Ban,
  Phone,
  Mail,
  Users,
  X,
  MapPin,
  Navigation,
  CalendarClock,
  Car,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/admin/PageHeader";
import StatusBadge from "@/components/dashboard/StatusBadge";
import { cn, timeAgo, money, clock, dateTime } from "@/lib/format";
import type { Customer, Booking } from "@/lib/types";

export default function CustomersPage() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Customer | null>(null);

  const load = async () => {
    const { data } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
    setCustomers((data as Customer[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleBlock = async (c: Customer) => {
    await supabase.from("customers").update({ is_blocked: !c.is_blocked }).eq("id", c.id);
    setDetail((d) => (d && d.id === c.id ? { ...d, is_blocked: !c.is_blocked } : d));
    load();
  };

  return (
    <div>
      <PageHeader title="Customers" subtitle="Everyone who has booked a ride" />
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
        </div>
      ) : (
        <div className="px-5 pb-10 md:px-8">
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {customers.length === 0 && (
              <div className="py-12 text-center text-sm text-gray-400">
                <Users className="mx-auto mb-2 h-8 w-8 text-gray-300" /> No customers yet
              </div>
            )}
            {customers.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
                onClick={() => setDetail(c)}
                className="flex cursor-pointer items-center justify-between gap-2 border-b border-gray-50 px-4 py-3.5 last:border-0 hover:bg-gray-50/60 sm:px-5 sm:py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
                    {c.full_name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-950">{c.full_name}</p>
                    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {c.whatsapp}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {c.email || "No email"}
                      </span>
                      <span>· {c.total_rides} rides</span>
                      <span className="hidden sm:inline">· joined {timeAgo(c.created_at)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {c.is_blocked && (
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">Blocked</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleBlock(c);
                    }}
                    className={cn("rounded-lg p-2 hover:bg-red-50", c.is_blocked ? "text-red-500" : "text-gray-400 hover:text-red-600")}
                    title={c.is_blocked ? "Unblock" : "Block"}
                  >
                    <Ban className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {detail && (
        <CustomerDetailModal customer={detail} onClose={() => setDetail(null)} onToggleBlock={toggleBlock} />
      )}
    </div>
  );
}

interface BookingRow extends Booking {
  category?: { name: string } | null;
}

function CustomerDetailModal({
  customer,
  onClose,
  onToggleBlock,
}: {
  customer: Customer;
  onClose: () => void;
  onToggleBlock: (c: Customer) => void;
}) {
  const supabase = createClient();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select("*, category:vehicle_categories(name)")
        .eq("customer_id", customer.id)
        .order("created_at", { ascending: false });
      setBookings((data as BookingRow[]) ?? []);
      setLoading(false);
    })();
  }, [customer.id, supabase]);

  const completed = bookings.filter((b) => b.status === "completed");
  const cancelled = bookings.filter((b) =>
    ["cancelled", "declined", "no_driver_found"].includes(b.status)
  );
  const spent = completed.reduce((s, b) => s + Number(b.final_fare ?? b.estimated_fare ?? 0), 0);
  const lastRide = bookings[0]?.created_at ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:p-6"
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
              {customer.full_name.charAt(0)}
            </div>
            <div>
              <p className="flex items-center gap-2 font-display text-lg font-bold text-ink-950">
                {customer.full_name}
                {customer.is_blocked && (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">Blocked</span>
                )}
              </p>
              <p className="text-xs text-gray-400">Joined {timeAgo(customer.created_at)}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contact */}
        <div className="mb-4 space-y-2.5 rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
          <Row icon={Phone} label="WhatsApp" value={customer.whatsapp} />
          <Row icon={Mail} label="Email" value={customer.email || "—"} />
          <Row
            icon={CalendarClock}
            label="Joined"
            value={new Date(customer.created_at).toLocaleDateString()}
          />
        </div>

        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCard label="Total rides" value={String(customer.total_rides)} />
          <StatCard label="Completed" value={String(completed.length)} />
          <StatCard label="Cancelled" value={String(cancelled.length)} />
          <StatCard label="Total spent" value={money(spent)} />
        </div>

        {/* Bookings */}
        <p className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-gray-400">
          <span>Booking history</span>
          {lastRide && <span className="normal-case text-gray-400">Last: {dateTime(lastRide)}</span>}
        </p>
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          </div>
        ) : bookings.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No bookings yet</p>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="rounded-xl border border-gray-100 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-gray-500">{b.booking_number}</span>
                    <StatusBadge status={b.status} size="xs" />
                  </span>
                  <span className="font-display text-sm font-bold text-ink-950">{money(b.estimated_fare)}</span>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-ink-950">
                  <MapPin className="h-3 w-3 shrink-0 text-brand-500" />
                  <span className="truncate">{b.pickup_address}</span>
                </p>
                <p className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Navigation className="h-3 w-3 shrink-0 text-gray-400" />
                  <span className="truncate">{b.dropoff_address}</span>
                </p>
                <p className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <Car className="h-3 w-3" /> {b.category?.name ?? "—"}
                  </span>
                  <span>· {clock(b.created_at)}</span>
                  {b.child_seat && <span>· 👶 Child seat</span>}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <button
          onClick={() => onToggleBlock(customer)}
          className={cn(
            "mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors",
            customer.is_blocked
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "border border-red-200 text-red-600 hover:bg-red-50"
          )}
        >
          {customer.is_blocked ? (
            <>
              <ShieldCheck className="h-4 w-4" /> Unblock customer
            </>
          ) : (
            <>
              <Ban className="h-4 w-4" /> Block customer
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <span className="min-w-0 flex-1 break-words text-ink-950">{value}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center">
      <p className="font-display text-lg font-bold text-ink-950">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  );
}
