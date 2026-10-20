import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Stripe webhooks need the raw body; route handlers read it with req.text().
  serverExternalPackages: ["stripe"],
};

export default nextConfig;
