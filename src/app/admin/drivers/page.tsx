"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Plus,
  Star,
  Check,
  X,
  ShieldCheck,
  Ban,
  Phone,
  Car,
  Mail,
  MapPin,
  Pencil,
  Trash2,
  IdCard,
  AlertTriangle,
  MessageSquare,
  ChevronDown,
  Banknote,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/admin/PageHeader";
import { cn, dateTime, money } from "@/lib/format";
import type { Driver } from "@/lib/types";

interface ReviewRow {
  driver_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  booking?: { booking_number: string } | null;
}

interface VehicleInfo {
  id: string;
  category_id: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  license_plate: string | null;
}
interface DriverRow extends Driver {
  vehicle?: VehicleInfo[];
}

export default function DriversPage() {
  const supabase = createClient();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalDriver, setModalDriver] = useState<DriverRow | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [toDelete, setToDelete] = useState<DriverRow | null>(null);
  const [reviews, setReviews] = useState<Record<string, ReviewRow[]>>({});
  const [cash, setCash] = useState<Record<string, { amount: number; count: number }>>({});
  const [settling, setSettling] = useState<string | null>(null);

  const load = async () => {
    const [{ data: drv }, { data: rt }, { data: cashRows }] = await Promise.all([
      supabase
        .from("drivers")
        .select("*, vehicle:vehicles(id,category_id,make,model,color,license_plate)")
        .order("created_at", { ascending: false }),
      supabase
        .from("ratings")
        .select("driver_id, rating, comment, created_at, booking:bookings(booking_number)")
        .order("created_at", { ascending: false }),
      // Cash collected by each driver that hasn't been handed in to the office yet
      supabase
        .from("bookings")
        .select("driver_id, final_fare, estimated_fare")
        .eq("payment_method", "cash")
        .eq("payment_status", "paid")
        .eq("status", "completed")
        .eq("cash_settled", false),
    ]);
    setDrivers((drv as DriverRow[]) ?? []);

    const grouped: Record<string, ReviewRow[]> = {};
    ((rt as unknown as ReviewRow[]) ?? []).forEach((r) => {
      if (!r.driver_id) return;
      (grouped[r.driver_id] ??= []).push(r);
    });
    setReviews(grouped);

    const cashMap: Record<string, { amount: number; count: number }> = {};
    ((cashRows as { driver_id: string | null; final_fare: number | null; estimated_fare: number | null }[]) ?? []).forEach(
      (r) => {
        if (!r.driver_id) return;
        const amt = Number(r.final_fare ?? r.estimated_fare ?? 0);
        const cur = (cashMap[r.driver_id] ??= { amount: 0, count: 0 });
        cur.amount += amt;
        cur.count += 1;
      }
    );
    setCash(cashMap);
    setLoading(false);
  };

  const settle = async (d: DriverRow) => {
    const held = cash[d.id];
    if (!held?.amount) return;
    if (!confirm(`Settle ${money(held.amount)} cash from ${d.full_name}? This clears their balance.`)) return;
    setSettling(d.id);
    await supabase.rpc("settle_driver_cash", { p_driver_id: d.id });
    setSettling(null);
    load();
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (d: Driver, field: "is_approved" | "is_blocked") => {
    await supabase.from("drivers").update({ [field]: !d[field] }).eq("id", d.id);
    load();
  };

  const openAdd = () => {
    setModalDriver(null);
    setShowModal(true);
  };
  const openEdit = (d: DriverRow) => {
    setModalDriver(d);
    setShowModal(true);
  };

  const totalCash = Object.values(cash).reduce((s, c) => s + c.amount, 0);

  return (
    <div>
      <PageHeader
        title="Drivers"
        subtitle="Your fleet — notified by WhatsApp"
        action={
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" /> Add Driver
          </button>
        }
      />

      {totalCash > 0 && (
        <div className="px-5 md:px-8">
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
            <Banknote className="h-4 w-4 shrink-0" />
            <span>
              Total cash out with drivers: <b>{money(totalCash)}</b> — collected, not yet handed in to the office.
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
        </div>
      ) : drivers.length === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-gray-400 md:px-8">No drivers yet — add your first one.</p>
      ) : (
        <div className="grid gap-4 px-5 pb-10 md:grid-cols-2 md:px-8">
          {drivers.map((d, i) => {
            const v = d.vehicle?.[0];
            const car = v ? [v.color, v.make, v.model].filter(Boolean).join(" ") : null;
            return (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">
                      {d.full_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-ink-950">{d.full_name}</p>
                        {d.is_blocked ? (
                          <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">Blocked</span>
                        ) : d.is_approved ? (
                          <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-600">Active</span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">Pending</span>
                        )}
                      </div>
                      <p className="flex items-center gap-1 text-xs text-gray-400">
                        <Star className="h-3 w-3 fill-brand-400 text-brand-400" /> {Number(d.rating).toFixed(1)} ·{" "}
                        {d.total_trips} trips
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <IconBtn icon={Pencil} title="Edit driver" onClick={() => openEdit(d)} />
                    <IconBtn
                      icon={ShieldCheck}
                      title={d.is_approved ? "Set pending" : "Approve"}
                      onClick={() => toggle(d, "is_approved")}
                      className={d.is_approved ? "text-green-600" : ""}
                    />
                    <IconBtn
                      icon={Ban}
                      title={d.is_blocked ? "Unblock" : "Block"}
                      onClick={() => toggle(d, "is_blocked")}
                      className={d.is_blocked ? "text-red-500" : ""}
                    />
                    <IconBtn icon={Trash2} title="Delete driver" onClick={() => setToDelete(d)} danger />
                  </div>
                </div>

                {/* Details */}
                <div className="mt-3 grid grid-cols-1 gap-2 border-t border-gray-50 pt-3 sm:grid-cols-2">
                  <Info icon={Phone} value={d.whatsapp || d.phone || "No number"} />
                  <Info icon={Mail} value={d.email || "No email"} muted={!d.email} />
                  <Info icon={Car} value={car ? `${car}${v?.license_plate ? ` · ${v.license_plate}` : ""}` : "No vehicle"} muted={!car} />
                  <Info icon={IdCard} value={d.license_number || "No licence"} muted={!d.license_number} />
                  <div className="sm:col-span-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                      <MapPin className="h-3.5 w-3.5" /> {d.service_area || "No service area set"}
                    </span>
                  </div>
                </div>

                {cash[d.id]?.amount > 0 && (
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-green-100 bg-green-50/60 px-3 py-2.5">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
                      <Banknote className="h-4 w-4" /> Cash held: {money(cash[d.id].amount)}
                      <span className="text-xs font-normal text-green-600">({cash[d.id].count} rides)</span>
                    </span>
                    <button
                      onClick={() => settle(d)}
                      disabled={settling === d.id}
                      className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                    >
                      {settling === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Settle"}
                    </button>
                  </div>
                )}

                {reviews[d.id]?.length ? <DriverReviews list={reviews[d.id]} /> : null}
              </motion.div>
            );
          })}
        </div>
      )}

      {showModal && (
        <DriverModal driver={modalDriver} onClose={() => setShowModal(false)} onDone={load} />
      )}
      {toDelete && (
        <DeleteConfirm driver={toDelete} onClose={() => setToDelete(null)} onDone={load} />
      )}
    </div>
  );
}

function DriverReviews({ list }: { list: ReviewRow[] }) {
  const [open, setOpen] = useState(false);
  const avg = list.reduce((s, r) => s + r.rating, 0) / list.length;
  return (
    <div className="mt-3 border-t border-gray-50 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-ink-950"
      >
        <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
        {list.length} review{list.length > 1 ? "s" : ""}
        <span className="flex items-center gap-0.5 text-gray-400">
          · <Star className="h-3 w-3 fill-brand-400 text-brand-400" /> {avg.toFixed(1)}
        </span>
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {list.slice(0, 10).map((r, i) => (
            <div key={i} className="rounded-lg bg-gray-50 p-2.5">
              <div className="flex items-center gap-1.5">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      className={cn("h-3 w-3", n <= r.rating ? "fill-brand-400 text-brand-400" : "text-gray-200")}
                    />
                  ))}
                </div>
                {r.booking?.booking_number && (
                  <span className="font-mono text-[10px] text-gray-400">{r.booking.booking_number}</span>
                )}
                <span className="ml-auto text-[10px] text-gray-400">{dateTime(r.created_at)}</span>
              </div>
              {r.comment?.trim() && <p className="mt-1 text-xs italic text-gray-600">“{r.comment.trim()}”</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  icon: Icon,
  title,
  onClick,
  className,
  danger,
}: {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  className?: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "rounded-lg p-2 text-gray-400 transition-colors",
        danger ? "hover:bg-red-50 hover:text-red-600" : "hover:bg-gray-100 hover:text-ink-950",
        className
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Info({ icon: Icon, value, muted }: { icon: React.ElementType; value: string; muted?: boolean }) {
  return (
    <p className={cn("flex items-center gap-1.5 truncate text-xs", muted ? "text-gray-400" : "text-gray-600")}>
      <Icon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      <span className="truncate">{value}</span>
    </p>
  );
}

function DeleteConfirm({
  driver,
  onClose,
  onDone,
}: {
  driver: Driver;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const del = async () => {
    setBusy(true);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc("delete_driver", { p_driver_id: driver.id });
    setBusy(false);
    if (rpcErr || !(data as { ok?: boolean })?.ok) {
      setError("Could not delete this driver. Please try again.");
      return;
    }
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h3 className="font-display text-lg font-bold text-ink-950">Delete {driver.full_name}?</h3>
        <p className="mt-1 text-sm text-gray-500">
          This removes the driver and their vehicle. Past bookings are kept but no longer linked to them. This can&apos;t
          be undone.
        </p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button
            onClick={del}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-gray-300"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4" /> Delete</>}
          </button>
          <button onClick={onClose} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function DriverModal({
  driver,
  onClose,
  onDone,
}: {
  driver: DriverRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClient();
  const editing = !!driver;
  const vehicle = driver?.vehicle?.[0];
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    full_name: driver?.full_name ?? "",
    whatsapp: driver?.whatsapp ?? "",
    email: driver?.email ?? "",
    service_area: driver?.service_area ?? "",
    license_number: driver?.license_number ?? "",
    category_id: vehicle?.category_id ?? "",
    make: vehicle?.make ?? "",
    model: vehicle?.model ?? "",
    color: vehicle?.color ?? "",
    license_plate: vehicle?.license_plate ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("vehicle_categories")
      .select("id,name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        const list = (data as { id: string; name: string }[]) ?? [];
        setCats(list);
        setForm((f) => ({ ...f, category_id: f.category_id || list[0]?.id || "" }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.full_name.trim() || !form.whatsapp.trim() || !form.service_area.trim()) {
      setError("Name, WhatsApp and service area are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const driverPayload = {
      full_name: form.full_name.trim(),
      whatsapp: form.whatsapp.trim(),
      email: form.email.trim() || null,
      service_area: form.service_area.trim(),
      license_number: form.license_number.trim() || null,
    };
    const vehiclePayload = {
      category_id: form.category_id || null,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      color: form.color.trim() || null,
      license_plate: form.license_plate.trim() || null,
    };
    const hasVehicle = form.make || form.model || form.license_plate || form.color || form.category_id;

    if (editing && driver) {
      const { error: dErr } = await supabase.from("drivers").update(driverPayload).eq("id", driver.id);
      if (dErr) {
        setSaving(false);
        setError("Could not save changes. Try again.");
        return;
      }
      if (vehicle?.id) {
        await supabase.from("vehicles").update(vehiclePayload).eq("id", vehicle.id);
      } else if (hasVehicle) {
        await supabase.from("vehicles").insert({ driver_id: driver.id, ...vehiclePayload });
      }
    } else {
      const { data: newDriver, error: dErr } = await supabase
        .from("drivers")
        .insert({ ...driverPayload, is_approved: true })
        .select()
        .single();
      if (dErr || !newDriver) {
        setSaving(false);
        setError("Could not add driver. Try again.");
        return;
      }
      if (hasVehicle) {
        await supabase.from("vehicles").insert({ driver_id: newDriver.id, ...vehiclePayload });
      }
    }

    setSaving(false);
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <h3 className="mb-1 font-display text-lg font-bold text-ink-950">
          {editing ? "Edit Driver" : "Add Driver"}
        </h3>
        <p className="mb-4 text-xs text-gray-400">Drivers don&apos;t log in — they receive jobs on WhatsApp.</p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input value={form.full_name} onChange={(v) => set("full_name", v)} placeholder="Full name *" />
            <Input value={form.whatsapp} onChange={(v) => set("whatsapp", v)} placeholder="WhatsApp * (+44…)" />
          </div>
          <Input value={form.email} onChange={(v) => set("email", v)} placeholder="Email (optional)" />
          <Input
            value={form.service_area}
            onChange={(v) => set("service_area", v)}
            placeholder="Service area * (e.g. Manchester, Salford, Stockport)"
          />
          <Input value={form.license_number} onChange={(v) => set("license_number", v)} placeholder="Licence number (optional)" />

          <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Vehicle</p>
          <select
            value={form.category_id}
            onChange={(e) => set("category_id", e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400"
          >
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <Input value={form.make} onChange={(v) => set("make", v)} placeholder="Make (Toyota)" />
            <Input value={form.model} onChange={(v) => set("model", v)} placeholder="Model (Prius)" />
            <Input value={form.color} onChange={(v) => set("color", v)} placeholder="Colour (Silver)" />
            <Input value={form.license_plate} onChange={(v) => set("license_plate", v)} placeholder="Plate (LX21 ABC)" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={submit}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-300"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <><Check className="h-4 w-4" /> {editing ? "Save changes" : "Add Driver"}</>
            )}
          </button>
          <button onClick={onClose} className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10"
    />
  );
}
