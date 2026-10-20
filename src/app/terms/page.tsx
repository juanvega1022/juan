import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

// Draft terms for v1. Have a lawyer review before launch.
export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 leading-relaxed">
      <h1 className="font-display text-3xl font-semibold">Terms of service</h1>
      <p className="text-sm text-muted">Draft — last updated October 2026.</p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">1. What you are buying</h2>
        <p>
          Ideas on Napkin are sold as information. Buying an idea gives you the right to read it and
          use it however you like. It does not transfer ownership of any intellectual property, and it
          is not exclusive: other people may buy and use the same idea, and the creator may keep using
          it too.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">2. What creators promise</h2>
        <p>By publishing an idea, you confirm that:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>the idea and write-up are your own original work;</li>
          <li>it is not confidential information belonging to an employer, client or anyone else;</li>
          <li>you have the right to share it, and it does not infringe anyone else&apos;s rights.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">3. Content rules</h2>
        <p>
          No illegal, harmful, hateful or plagiarised content, and no teasers that misrepresent what
          the full idea contains. Anyone can report an idea. We may remove reported ideas and suspend
          accounts that break these rules.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">4. Payments and fees</h2>
        <p>
          Payments are processed by Stripe. Creators receive 85% of each sale through Stripe Connect;
          Napkin keeps 15%. Creators must complete Stripe onboarding before publishing and are
          responsible for their own taxes.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">5. Refunds</h2>
        <p>
          If an idea is not worth it, rate it 1 star within 24 hours of buying and request a refund.
          An admin reviews each request. Approved refunds are returned in full and the creator&apos;s
          share is reversed. Refunded buyers lose access to the idea.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">6. No guarantees</h2>
        <p>
          Ideas are opinions, not professional advice. Napkin makes no promise that any idea will work,
          make money, or be new. Use your own judgement.
        </p>
      </section>
    </article>
  );
}
