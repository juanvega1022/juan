import type { Metadata } from "next";
import { Bricolage_Grotesque, Caveat, Fraunces } from "next/font/google";
import Link from "next/link";
import { NapkinMark } from "@/components/NapkinLogo";
import { getUser } from "@/lib/auth";
import "./globals.css";

const body = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-body" });
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["SOFT", "WONK", "opsz"],
});
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat", weight: ["500", "700"] });

export const metadata: Metadata = {
  title: { default: "Napkin — ideas for sale", template: "%s · Napkin" },
  description: "Read the one-line teaser for free. Unlock the full idea if it grabs you.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <html lang="en" className={`${body.variable} ${fraunces.variable} ${caveat.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
            <Link href="/" className="group flex items-center gap-2">
              <NapkinMark className="h-9 w-9 transition-transform duration-300 group-hover:-rotate-12" />
              <span className="font-hand text-3xl leading-none font-bold">napkin</span>
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
            <span className="font-hand text-lg">Scribbled with care.</span>
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
