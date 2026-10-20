import { NextResponse } from "next/server";
import { getOwnProfile, getUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";

// One-time login link to the creator's Stripe Express dashboard.
export async function GET() {
  const site = env.siteUrl();
  const user = await getUser();
  if (!user) return NextResponse.redirect(`${site}/login?next=/me`);
  const profile = await getOwnProfile(user.id);
  if (!profile.stripe_account_id) return NextResponse.redirect(`${site}/api/stripe/connect`);
  const link = await stripe().accounts.createLoginLink(profile.stripe_account_id);
  return NextResponse.redirect(link.url);
}
