import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // api/webhooks is excluded on purpose: Stripe authenticates with a request
    // signature, not a session cookie, and the session refresh here would only
    // add latency and Set-Cookie noise to a machine-to-machine call.
    "/((?!_next/static|_next/image|api/webhooks|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
