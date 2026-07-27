import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Admin-only: create a dispatcher/admin login. Needs SERVICE_ROLE key. Drivers are records (no login). */
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
  const { email, password, full_name, role, phone } = b;
  if (!email || !password || !full_name || !role) {
    return NextResponse.json({ ok: false, error: "missing_fields" });
  }
  // Drivers no longer have login accounts — they are records notified via WhatsApp.
  if (role !== "dispatcher" && role !== "admin") {
    return NextResponse.json({ ok: false, error: "invalid_role" });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error || !data.user) {
    return NextResponse.json({ ok: false, error: error?.message ?? "create_failed" });
  }

  const uid = data.user.id;
  await admin.from("profiles").insert({ id: uid, full_name, email, phone: phone ?? null, role });

  return NextResponse.json({ ok: true });
}
