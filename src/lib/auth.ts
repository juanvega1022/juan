import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Returns the signed-in user, or redirects to /login and back to `next`. */
export async function requireUser(next: string) {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Profile row including private fields (read with the service role, for the owner only). */
export async function getOwnProfile(userId: string) {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, username, bio, stripe_account_id, payouts_enabled, is_admin, created_at")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data as {
    id: string;
    username: string;
    bio: string;
    stripe_account_id: string | null;
    payouts_enabled: boolean;
    is_admin: boolean;
    created_at: string;
  };
}

export async function requireAdmin() {
  const user = await requireUser("/admin");
  const profile = await getOwnProfile(user.id);
  if (!profile.is_admin) redirect("/");
  return user;
}

/** Only allow same-site relative redirects. */
export function safeNext(next: unknown, fallback = "/"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
    ? next
    : fallback;
}
