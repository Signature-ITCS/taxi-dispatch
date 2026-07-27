"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Loader2, Lock, ArrowLeft } from "lucide-react";

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = pk ? loadStripe(pk) : null;

interface Props {
  clientSecret: string;
  amountLabel: string;
  onPaid: (paymentIntentId: string) => void;
  onCancel: () => void;
}

export default function CardPayment({ clientSecret, amountLabel, onPaid, onCancel }: Props) {
  if (!stripePromise) {
    return <p className="text-sm text-red-600">Card payments are not configured on this site.</p>;
  }
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: { theme: "stripe", variables: { colorPrimary: "#f5b301", borderRadius: "12px" } },
      }}
    >
      <PayForm amountLabel={amountLabel} onPaid={onPaid} onCancel={onCancel} />
    </Elements>
  );
}

function PayForm({ amountLabel, onPaid, onCancel }: Omit<Props, "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: window.location.href },
    });
    if (err) {
      setError(err.message || "Payment failed. Please try again.");
      setBusy(false);
      return;
    }
    if (paymentIntent?.status === "succeeded") {
      onPaid(paymentIntent.id);
      return;
    }
    setError("Payment could not be completed.");
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 p-3">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={pay}
        disabled={busy || !stripe}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-4 text-base font-bold text-white shadow-lg shadow-brand-500/30 transition-all hover:bg-brand-600 disabled:bg-gray-200 disabled:text-gray-400"
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Lock className="h-5 w-5" /> Pay {amountLabel}
          </>
        )}
      </button>
      <button
        onClick={onCancel}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1 text-sm text-gray-500 hover:text-ink-950 disabled:opacity-50"
      >
        <ArrowLeft className="h-4 w-4" /> Back to details
      </button>
      <p className="text-center text-[11px] text-gray-400">Secured by Stripe · Your card details never touch our servers</p>
    </div>
  );
}
