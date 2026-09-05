/**
 * Branded HTML email templates for booking notifications.
 * Uses table layout + inline styles so it renders in Gmail / Outlook / Apple Mail.
 */
import { money } from "./format";

export interface BookingEmailData {
  bookingNumber: string;
  customerName: string;
  customerWhatsapp: string;
  customerEmail?: string | null;
  pickup: string;
  vias?: string[];
  dropoff: string;
  carName?: string | null;
  distanceKm?: number | null;
  fare: number;
  paymentMethod: "cash" | "card";
  paid?: boolean;
  scheduledAt?: string | null;
  isReturn?: boolean;
  returnBookingNumber?: string | null;
  trackUrl: string;
  /** Customer-facing /install page (one-tap PWA install). Optional. */
  installUrl?: string;
  siteName?: string;
}

const BRAND = "#F5B301";
const INK = "#0b0b0f";

function whenLabel(iso?: string | null): string {
  if (!iso) return "As soon as possible";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function payLabel(d: BookingEmailData): string {
  if (d.paymentMethod === "card") return d.paid ? "Paid by card ✓" : "Card (payment pending)";
  return "Cash to driver";
}

function row(label: string, value: string, strong = false): string {
  return `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #f0f0f0;color:#6b7280;font-size:13px;width:38%;vertical-align:top;">${label}</td>
      <td style="padding:9px 0;border-bottom:1px solid #f0f0f0;color:${INK};font-size:14px;font-weight:${strong ? 700 : 500};text-align:right;">${value}</td>
    </tr>`;
}

function detailsTable(d: BookingEmailData): string {
  const vias = (d.vias ?? []).filter(Boolean);
  const routeVal =
    `${escapeHtml(d.pickup)}` +
    (vias.length ? vias.map((v) => `<br><span style="color:#9ca3af;">via ${escapeHtml(v)}</span>`).join("") : "") +
    `<br><span style="color:#6b7280;">→ ${escapeHtml(d.dropoff)}</span>`;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${row("Booking no.", `<span style="font-family:monospace;">${escapeHtml(d.bookingNumber)}</span>`, true)}
      ${d.isReturn || d.returnBookingNumber ? row("Trip", d.isReturn ? "Return leg" : "Outbound leg (return booked)") : ""}
      ${d.returnBookingNumber ? row("Other leg", `<span style="font-family:monospace;">${escapeHtml(d.returnBookingNumber)}</span>`) : ""}
      ${row("Route", routeVal)}
      ${d.carName ? row("Vehicle", escapeHtml(d.carName)) : ""}
      ${d.distanceKm != null ? row("Distance", `${d.distanceKm} mi`) : ""}
      ${row("When", whenLabel(d.scheduledAt))}
      ${row("Passenger", `${escapeHtml(d.customerName)} · ${escapeHtml(d.customerWhatsapp)}`)}
      ${row("Payment", payLabel(d))}
      ${row("Total fare", money(d.fare), true)}
    </table>`;
}

function shell(opts: { preheader: string; heading: string; sub: string; body: string; footer: string }): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ececec;">
        <tr><td style="background:${INK};padding:22px 28px;">
          <table role="presentation" width="100%"><tr>
            <td style="color:#ffffff;font-size:18px;font-weight:800;">🚕 ${escapeHtml(opts.footer)}</td>
          </tr></table>
        </td></tr>
        <tr><td style="height:4px;background:${BRAND};"></td></tr>
        <tr><td style="padding:28px 28px 8px 28px;">
          <h1 style="margin:0 0 4px 0;color:${INK};font-size:22px;">${escapeHtml(opts.heading)}</h1>
          <p style="margin:0;color:#6b7280;font-size:14px;">${opts.sub}</p>
        </td></tr>
        <tr><td style="padding:12px 28px 28px 28px;">${opts.body}</td></tr>
        <tr><td style="padding:0 28px 28px 28px;color:#9ca3af;font-size:12px;line-height:1.6;">
          This is an automated message from ${escapeHtml(opts.footer)}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(url: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px 0;"><tr>
      <td style="border-radius:12px;background:${BRAND};">
        <a href="${escapeAttr(url)}" style="display:inline-block;padding:14px 26px;color:${INK};font-weight:700;font-size:15px;text-decoration:none;border-radius:12px;">${escapeHtml(label)} →</a>
      </td>
    </tr></table>`;
}

/** Customer-facing "Booking confirmed" email with a Track button. */
export function customerConfirmationEmail(d: BookingEmailData): { subject: string; html: string } {
  const site = d.siteName || "TaxiFlow";
  const html = shell({
    preheader: `Your booking ${d.bookingNumber} is confirmed.`,
    heading: "Booking confirmed 🎉",
    sub: `Thanks ${escapeHtml(d.customerName.split(" ")[0] || "there")}! We've got your ride and will assign a driver shortly.`,
    footer: site,
    body: `
      ${detailsTable(d)}
      <div style="margin-top:22px;">
        ${button(d.trackUrl, "Track your order")}
        <p style="margin:10px 0 0 0;color:#9ca3af;font-size:12px;">
          Open the tracking page on your phone to follow your driver live.
        </p>
      </div>
      ${
        d.installUrl
          ? `<div style="margin-top:18px;padding-top:18px;border-top:1px solid #f0f0f0;">
        <p style="margin:0 0 2px 0;color:${INK};font-size:14px;font-weight:600;">Get the app 📲</p>
        <p style="margin:0 0 8px 0;color:#6b7280;font-size:13px;line-height:1.5;">
          Add ${escapeHtml(site)} to your phone's home screen — track this ride and book the next one in one tap. Open the link on your phone and press <b>Install</b>.
        </p>
        ${installButton(d.installUrl, "Install the app")}
      </div>`
          : ""
      }`,
  });
  return { subject: `Booking confirmed — ${d.bookingNumber}`, html };
}

/** Internal alert for dispatch + admin when a new booking arrives. */
export function staffAlertEmail(d: BookingEmailData, dispatchUrl?: string): { subject: string; html: string } {
  const html = shell({
    preheader: `New booking ${d.bookingNumber} from ${d.customerName}.`,
    heading: "New booking received",
    sub: `A new ride has come in${d.siteName ? ` via ${escapeHtml(d.siteName)}` : ""}. Assign a driver from the dispatch board.`,
    footer: "TaxiFlow Dispatch",
    body: `
      ${detailsTable(d)}
      ${dispatchUrl ? `<div style="margin-top:22px;">${button(dispatchUrl, "Open dispatch board")}</div>` : ""}`,
  });
  return { subject: `🚕 New booking — ${d.bookingNumber} (${d.customerName})`, html };
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Staff onboarding                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

export interface StaffWelcomeData {
  fullName: string;
  email: string;
  password: string;
  role: "dispatcher" | "admin";
  loginUrl: string;
  installUrl: string;
  invitedBy?: string | null;
  siteName?: string;
}

/**
 * "Your account is ready" email sent when an admin creates a dispatcher/admin
 * login. Contains the credentials, a sign-in button and an "Install the app"
 * button (→ /install page, which triggers the PWA install prompt).
 */
export function staffWelcomeEmail(d: StaffWelcomeData): { subject: string; html: string } {
  const site = d.siteName || "TaxiFlow";
  const first = escapeHtml(d.fullName.split(" ")[0] || "there");
  const roleLabel = d.role === "admin" ? "Administrator" : "Dispatcher";
  const area = d.role === "admin" ? "admin panel" : "dispatch board";

  const credBox = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#fafafa;border:1px solid #ececec;border-radius:12px;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 10px 0;color:#9ca3af;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Your login details</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px;width:34%;">Sign-in page</td>
            <td style="padding:6px 0;font-size:14px;"><a href="${escapeAttr(d.loginUrl)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(d.loginUrl.replace(/^https?:\/\//, ""))}</a></td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px;">Email</td>
            <td style="padding:6px 0;color:${INK};font-size:14px;font-weight:600;">${escapeHtml(d.email)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px;">Password</td>
            <td style="padding:6px 0;"><span style="display:inline-block;font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;font-weight:700;color:${INK};background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:6px 10px;letter-spacing:.04em;">${escapeHtml(d.password)}</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7280;font-size:13px;">Role</td>
            <td style="padding:6px 0;color:${INK};font-size:14px;">${roleLabel}</td>
          </tr>
        </table>
      </td></tr>
    </table>`;

  const steps = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
      <tr><td style="padding-bottom:8px;color:${INK};font-size:15px;font-weight:700;">Get set up in 2 quick steps</td></tr>
      <tr><td style="padding:10px 0;border-top:1px solid #f0f0f0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top;padding-right:12px;"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:${BRAND};color:${INK};font-weight:800;font-size:13px;">1</span></td>
          <td style="vertical-align:top;">
            <p style="margin:0 0 2px 0;color:${INK};font-size:14px;font-weight:600;">Sign in</p>
            <p style="margin:0 0 8px 0;color:#6b7280;font-size:13px;line-height:1.5;">Use the email and password above to open the ${area}.</p>
            ${button(d.loginUrl, "Sign in now")}
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:10px 0;border-top:1px solid #f0f0f0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="vertical-align:top;padding-right:12px;"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:${BRAND};color:${INK};font-weight:800;font-size:13px;">2</span></td>
          <td style="vertical-align:top;">
            <p style="margin:0 0 2px 0;color:${INK};font-size:14px;font-weight:600;">Install the app 📲</p>
            <p style="margin:0 0 8px 0;color:#6b7280;font-size:13px;line-height:1.5;">Add ${escapeHtml(site)} to your phone's home screen or your desktop so it opens like a normal app, full-screen and one tap away. Open the link below on the device you want to install it on and press <b>Install</b>.</p>
            ${installButton(d.installUrl, "Install the app")}
          </td>
        </tr></table>
      </td></tr>
    </table>`;

  const html = shell({
    preheader: `Your ${roleLabel.toLowerCase()} account for ${site} is ready — sign in and install the app.`,
    heading: `Welcome aboard, ${first}! 👋`,
    sub: `${d.invitedBy ? `${escapeHtml(d.invitedBy)} has` : "We've"} created your ${roleLabel.toLowerCase()} account on ${escapeHtml(site)}. Here's everything you need to get started.`,
    footer: `${site} Dispatch`,
    body: `
      ${credBox}
      ${steps}
      <p style="margin:22px 0 0 0;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;color:#8c5f00;font-size:12px;line-height:1.5;">
        🔒 Keep this email private — it contains your password. Don't forward it or share your login with anyone.
      </p>`,
  });

  return { subject: `Your ${site} ${roleLabel.toLowerCase()} account is ready`, html };
}

/** Dark "install" button so it stands apart from the amber primary action. */
function installButton(url: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px 0;"><tr>
      <td style="border-radius:12px;background:${INK};">
        <a href="${escapeAttr(url)}" style="display:inline-block;padding:14px 26px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none;border-radius:12px;">⬇&nbsp; ${escapeHtml(label)}</a>
      </td>
    </tr></table>`;
}
