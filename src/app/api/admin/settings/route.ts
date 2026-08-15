import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { clearSettingsCache } from "@/lib/settings";

/** Admin-only. GET returns the editable (non-secret) config. */
export async function GET() {
  const me = await getSessionProfile();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ ok: false, error: "no_service_role_key" });
  }

  const [{ data: notif }, { data: company }] = await Promise.all([
    admin.from("app_settings").select("value").eq("key", "notifications").maybeSingle(),
    admin.from("app_settings").select("value").eq("key", "company").maybeSingle(),
  ]);
  const n = (notif?.value as Record<string, string> | null) ?? {};
  const c = (company?.value as Record<string, string> | null) ?? {};

  return NextResponse.json({
    ok: true,
    config: {
      email_from: n.email_from || process.env.EMAIL_FROM || "",
      sms_sender: n.sms_sender || process.env.COSMICSMS_SENDER || "",
      timezone: c.timezone || "",
    },
  });
}

/** Admin-only. Updates the editable (non-secret) config. */
export async function POST(req: Request) {
  const me = await getSessionProfile();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ ok: false, error: "no_service_role_key" });
  }
  const b = await req.json().catch(() => ({}));

  // Non-secret config → app_settings (merge into existing jsonb)
  const { data: notifRow } = await admin.from("app_settings").select("value").eq("key", "notifications").maybeSingle();
  const notif = { ...((notifRow?.value as Record<string, unknown>) ?? {}) };
  if (typeof b.email_from === "string") notif.email_from = b.email_from.trim();
  if (typeof b.sms_sender === "string") notif.sms_sender = b.sms_sender.trim();
  await admin.from("app_settings").upsert({ key: "notifications", value: notif });

  const { data: compRow } = await admin.from("app_settings").select("value").eq("key", "company").maybeSingle();
  const comp = { ...((compRow?.value as Record<string, unknown>) ?? {}) };
  if (typeof b.timezone === "string") comp.timezone = b.timezone.trim();
  await admin.from("app_settings").upsert({ key: "company", value: comp });

  clearSettingsCache();
  await admin.from("activity_logs").insert({
    actor_id: me.id,
    actor_name: me.full_name,
    actor_role: me.role,
    action: "settings_updated",
    description: "Updated notification & timezone settings",
  });

  return NextResponse.json({ ok: true });
}
