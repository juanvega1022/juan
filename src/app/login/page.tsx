import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser, safeNext } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getUser()) redirect(next);

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="font-display text-3xl font-semibold">Sign in to Napkin</h1>
      <p className="mt-2 mb-6 text-muted">No password needed.</p>
      <LoginForm next={next} error={typeof params.error === "string" ? params.error : undefined} />
    </div>
  );
}
