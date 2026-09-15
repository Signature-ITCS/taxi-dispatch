"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, Check, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isValidPhone, cn } from "@/lib/format";

/**
 * "Add a job we arranged somewhere else."
 *
 * The office takes a call with no driver free, books the customer an Uber, and
 * charges them directly. That ride is invisible to the system until someone
 * types it in — often the next day, once they remember. So this form is built
 * for entering the past: the date defaults to now but goes backwards freely,
 * and the status is chosen rather than assumed, because the ride has usually
 * already finished by the time anyone gets round to recording it.
 */

const PROVIDERS = ["Uber", "Bolt", "Addison Lee", "Partner firm", "Other"];

export interface ExternalBookingResult {
  booking_number: string;
  fare: number;
}

const ERRORS: Record<string, string> = {
  missing_fields: "Fill in the customer, both addresses and the fare.",
  invalid_phone: "That phone number doesn't look right.",
  invalid_fare: "Enter the amount the customer paid.",
  invalid_date: "That date isn't valid.",
  customer_blocked: "This customer is blocked.",
  unauthorized: "You don't have permission to add bookings.",
  no_service_role_key: "Server isn't configured to write bookings.",
};

/** ISO → the value a <input type="datetime-local"> expects, in local time. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ExternalBookingModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved?: (result: ExternalBookingResult) => void;
}) {
  const supabase = createClient();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalInput(new Date()));
  const [provider, setProvider] = useState("Uber");
  const [fare, setFare] = useState("");
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [payStatus, setPayStatus] = useState<"paid" | "pending">("paid");
  const [status, setStatus] = useState<"completed" | "pending" | "cancelled">("completed");
  const [categoryId, setCategoryId] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ExternalBookingResult | null>(null);

  useEffect(() => {
    supabase
      .from("vehicle_categories")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => setCategories((data as { id: string; name: string }[]) ?? []));
  }, [supabase]);

  const fareValue = Number(fare);
  const ready =
    name.trim().length > 1 &&
    isValidPhone(whatsapp) &&
    pickup.trim().length > 2 &&
    dropoff.trim().length > 2 &&
    Number.isFinite(fareValue) &&
    fareValue >= 0 &&
    fare.trim() !== "";

  const save = async () => {
    if (!ready) {
      setError("Fill in the customer, both addresses and the fare.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          whatsapp,
          email,
          pickup,
          dropoff,
          // datetime-local has no timezone; send the browser's real instant.
          occurred_at: new Date(occurredAt).toISOString(),
          provider,
          fare: fareValue,
          payment_method: method,
          payment_status: payStatus,
          status,
          category_id: categoryId || null,
          passengers,
          notes,
        }),
      });
      const data = await res.json();
      setSaving(false);
      if (!data?.ok) {
        setError(ERRORS[data?.error] ?? "Could not save this booking. Please try again.");
        return;
      }
      const result = { booking_number: data.booking_number as string, fare: fareValue };
      setDone(result);
      onSaved?.(result);
    } catch {
      setSaving(false);
      setError("Could not save this booking. Please try again.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-xl sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <ExternalLink className="h-4.5 w-4.5" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold text-ink-950">Add an outside booking</h3>
              <p className="text-xs text-gray-500">A job you arranged elsewhere — Uber, Bolt, a partner firm</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="px-5 py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <p className="font-display text-lg font-bold text-ink-950">Booking recorded</p>
            <p className="mt-1 font-mono text-sm text-gray-500">{done.booking_number}</p>
            <p className="mt-3 text-sm text-gray-500">
              It now shows in bookings and counts towards your takings like any other ride.
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-ink-950 py-3 font-semibold text-white hover:bg-ink-800"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-4 pb-[calc(20px+env(safe-area-inset-bottom))] sm:pb-5">
            <Section label="Customer">
              <Field value={name} onChange={setName} placeholder="Full name" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field value={whatsapp} onChange={setWhatsapp} placeholder="Phone number" inputMode="tel" />
                <Field value={email} onChange={setEmail} placeholder="Email (optional)" inputMode="email" />
              </div>
            </Section>

            <Section label="Journey">
              <Field value={pickup} onChange={setPickup} placeholder="Pick-up address" />
              <Field value={dropoff} onChange={setDropoff} placeholder="Drop-off address" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-gray-500">When did it happen?</span>
                  <input
                    type="datetime-local"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-gray-500">Car type (optional)</span>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400"
                  >
                    <option value="">Not recorded</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </Section>

            <Section label="Money">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-gray-500">Booked through</span>
                  <input
                    list="external-providers"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="Uber"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
                  />
                  <datalist id="external-providers">
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-gray-500">Customer paid (£)</span>
                  <input
                    value={fare}
                    onChange={(e) => setFare(e.target.value)}
                    placeholder="40.00"
                    inputMode="decimal"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-400"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Choice label="Paid by" value={method} onChange={setMethod} options={[["cash", "Cash"], ["card", "Card"]]} />
                <Choice
                  label="Payment"
                  value={payStatus}
                  onChange={setPayStatus}
                  options={[["paid", "Received"], ["pending", "Owed"]]}
                />
              </div>
            </Section>

            <Section label="Status">
              <Choice
                label=""
                value={status}
                onChange={setStatus}
                options={[["completed", "Completed"], ["pending", "Pending"], ["cancelled", "Cancelled"]]}
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[100px_1fr]">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-gray-500">Passengers</span>
                  <input
                    type="number"
                    min={1}
                    value={passengers}
                    onChange={(e) => setPassengers(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
                  />
                </label>
                <Field value={notes} onChange={setNotes} placeholder="Notes (optional)" />
              </div>
            </Section>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={save}
              disabled={saving || !ready}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save booking
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputMode?: "tel" | "email" | "text";
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-violet-400"
    />
  );
}

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div>
      {label && <span className="mb-1 block text-[11px] text-gray-500">{label}</span>}
      <div className="flex gap-1.5">
        {options.map(([v, text]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={cn(
              "flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors",
              value === v
                ? "border-violet-500 bg-violet-50 text-violet-700"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
