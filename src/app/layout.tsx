import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: { default: "Napkin — ideas for sale", template: "%s · Napkin" },
  description: "Read the one-line teaser for free. Unlock the full idea if it grabs you.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
            <Link href="/" className="font-display text-2xl font-semibold tracking-tight">
              napkin
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/post" className="btn-primary">
                Sell an idea
              </Link>
              {user ? (
                <Link href="/me" className="btn-ghost">
                  Me
                </Link>
              ) : (
                <Link href="/login" className="btn-ghost">
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted">
          <div className="flex flex-wrap gap-4 border-t border-line pt-6">
            <span>Ideas are sold as information, not as owned IP or exclusive rights.</span>
            <Link href="/terms" className="underline">
              Terms
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
