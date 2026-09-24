import type { BookingStatus } from "./types";

export const CURRENCY_SYMBOL = "£";

/**
 * The name customers see: on the tracking page, the booking widget, the
 * "install the app" page and the browser tab.
 *
 * "TaxiFlow" is the name of the software, not of the firm running it, so it
 * has no business appearing to a passenger. Each deployment sets its own name
 * through NEXT_PUBLIC_BRAND_NAME; the old name remains the fallback so an
 * instance that has not set one keeps working rather than showing a blank.
 *
 * Staff-facing screens are deliberately left alone -- the dispatch and admin
 * sidebars still say TaxiFlow, which is accurate for the people running it.
 */
export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME || "TaxiFlow";

/** Display label + color for each booking status (used across dashboards). */
export const STATUS_META: Record<
  BookingStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  pending: { label: "Pending", color: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" },
  assigned: { label: "Assigned", color: "text-blue-700", bg: "bg-blue-50", dot: "bg-blue-500" },
  accepted: { label: "Accepted", color: "text-indigo-700", bg: "bg-indigo-50", dot: "bg-indigo-500" },
  driver_arrived: { label: "Driver Arrived", color: "text-cyan-700", bg: "bg-cyan-50", dot: "bg-cyan-500" },
  in_progress: { label: "In Progress", color: "text-violet-700", bg: "bg-violet-50", dot: "bg-violet-500" },
  completed: { label: "Completed", color: "text-green-700", bg: "bg-green-50", dot: "bg-green-500" },
  cancelled: { label: "Cancelled", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" },
  declined: { label: "Declined", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" },
  no_driver_found: { label: "No Driver", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" },
};

export const DRIVER_ACCEPT_TIMEOUT = 15; // seconds
