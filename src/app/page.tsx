import { redirect } from "next/navigation";
import { getSessionProfile, homeForRole } from "@/lib/auth";
import Landing from "@/components/landing/Landing";

/**
 * "/" is the PWA start_url. When a signed-in dispatcher/admin opens the
 * installed app, send them straight to their board instead of the public
 * landing page. Everyone else sees the landing page.
 */
export default async function Home() {
  const profile = await getSessionProfile();
  if (profile && profile.is_active && (profile.role === "admin" || profile.role === "dispatcher")) {
    redirect(homeForRole(profile.role));
  }
  return <Landing />;
}
