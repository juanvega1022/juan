import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="font-display text-3xl font-semibold">Nothing on this napkin.</h1>
      <p className="mt-2 text-muted">The page you&apos;re after doesn&apos;t exist or isn&apos;t public.</p>
      <Link href="/" className="btn-primary mt-6">
        Back to the feed
      </Link>
    </div>
  );
}
