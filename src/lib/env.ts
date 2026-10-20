function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

// NEXT_PUBLIC_* must be referenced literally so Next can inline them.
export const env = {
  siteUrl: () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  supabaseServiceKey: () =>
    required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  stripeSecretKey: () => required("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY),
  stripeWebhookSecret: () =>
    required("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET),
  stripeConnectWebhookSecret: () => process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
};
