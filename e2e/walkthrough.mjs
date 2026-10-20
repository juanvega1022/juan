// End-to-end walkthrough against a local stack. Needs: `npx supabase start`,
// `npm run dev` with .env.local pointing at it (STRIPE_WEBHOOK_SECRET=whsec_localtest),
// psql on PATH. Stripe's API is not called: webhooks are signed locally.
//   node e2e/walkthrough.mjs [screenshot-dir]
import { chromium } from "playwright-core";
import Stripe from "stripe";
import { execSync } from "node:child_process";

const SITE = "http://localhost:3000";
const MAIL = "http://127.0.0.1:54324";
const DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SHOTS = process.argv[2] ?? "/tmp";
const sql = (q) => execSync(`psql "${DB}" -Atc ${JSON.stringify(q)}`).toString().trim();
const assert = (cond, msg) => {
  if (!cond) throw new Error("ASSERT: " + msg);
  console.log("ok -", msg);
};
const SECRET_BODY = "The secret plan: rent unused restaurant kitchens at night to ghost-kitchen startups.";

async function login(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${SITE}/login`);
  await page.fill("#email", email);
  await page.click("text=Email me a magic link");
  await page.waitForSelector("text=Check");
  let link;
  for (let i = 0; i < 20 && !link; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json();
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${list.messages[0].ID}`)).json();
      link = msg.Text.match(/https?:\/\/\S+verify\S+/)?.[0]?.replace(/\)$/, "");
    }
    if (!link) await new Promise((r) => setTimeout(r, 500));
  }
  assert(link, `magic link email for ${email}`);
  await page.goto(link);
  await page.waitForURL(`${SITE}/`);
  assert(await page.isVisible("a:has-text('Me')"), `${email} signed in`);
  return { ctx, page };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  // Anonymous feed
  const anon = await browser.newPage();
  await anon.goto(SITE);
  await anon.screenshot({ path: `${SHOTS}/1-feed-empty.png`, fullPage: true });

  // Alice writes an idea
  const alice = await login(browser, "alice@example.com");
  await alice.page.goto(`${SITE}/post`);
  await alice.page.fill("#title", "Night-shift kitchens");
  await alice.page.fill("#teaser", "Too short");
  await alice.page.fill("#body", SECRET_BODY);
  await alice.page.click("button[value=draft]");
  await alice.page.waitForSelector("text=At least 10 characters.");
  assert((await alice.page.inputValue("#body")) === SECRET_BODY, "validation error keeps typed text");
  await alice.page.fill("#teaser", "Restaurants sit empty 14 hours a day. Here is who will pay to use them.");
  await alice.page.fill("#price", "7");
  await alice.page.check("input[name=confirm]");
  await alice.page.click("button[value=publish]");
  await alice.page.waitForURL(/payouts=required/);
  assert(await alice.page.isVisible("text=set up payouts with Stripe"), "publish without payouts saves draft + prompts Stripe");
  const ideaId = new URL(alice.page.url()).searchParams.get("id");
  assert(ideaId, "draft saved");

  // Pretend Stripe onboarding finished.
  sql(`update profiles set stripe_account_id='acct_test_alice', payouts_enabled=true where username='alice'`);
  await alice.page.reload();
  await alice.page.check("input[name=confirm]");
  await alice.page.click("button[value=publish]");
  await alice.page.waitForURL(`${SITE}/idea/${ideaId}`);
  assert(await alice.page.isVisible(`text=${SECRET_BODY}`), "author sees own body");

  // Bob sees the teaser but never the body
  const bob = await login(browser, "bob@example.com");
  await bob.page.goto(SITE);
  assert(await bob.page.isVisible("text=Night-shift kitchens"), "idea in feed");
  await bob.page.screenshot({ path: `${SHOTS}/2-feed.png`, fullPage: true });
  await bob.page.goto(`${SITE}/idea/${ideaId}`);
  const html = await bob.page.content();
  assert(!html.includes("secret plan"), "body absent from non-buyer HTML (incl. RSC payload)");
  assert(await bob.page.isVisible("text=Unlock for $7"), "unlock button shown");
  await bob.page.screenshot({ path: `${SHOTS}/3-idea-sealed.png`, fullPage: true });

  // Success redirect with a pending purchase must NOT unlock.
  const bobId = sql(`select id from profiles where username='bob'`);
  const purchaseId = sql(
    `insert into purchases (idea_id, buyer_id, amount_cents, platform_fee_cents, status, stripe_session_id) values ('${ideaId}','${bobId}',700,105,'pending','cs_test_1') returning id`,
  ).split("\n")[0];
  await bob.page.goto(`${SITE}/idea/${ideaId}?checkout=success`);
  assert(!(await bob.page.content()).includes("secret plan"), "redirect alone does not unlock");
  assert(await bob.page.isVisible("text=confirming with Stripe"), "shows confirming notice");

  // Bad signature rejected
  const payload = JSON.stringify({
    id: "evt_test_1",
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 700,
        payment_intent: "pi_test_1",
        metadata: { purchase_id: purchaseId, idea_id: ideaId, buyer_id: bobId },
      },
    },
  });
  const forged = await fetch(`${SITE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=deadbeef" },
    body: payload,
  });
  assert(forged.status === 400, "forged webhook rejected");

  const stripe = new Stripe("sk_test_fake");
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_localtest" });
  const res = await fetch(`${SITE}/api/stripe/webhook`, {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
  assert(res.status === 200, `signed webhook accepted (${res.status})`);
  assert(sql(`select status from purchases where id='${purchaseId}'`) === "paid", "purchase paid");
  assert(sql(`select unlock_count from ideas where id='${ideaId}'`) === "1", "unlock_count = 1");

  // Polling page picks it up
  await bob.page.waitForSelector(`text=${SECRET_BODY}`, { timeout: 10000 });
  assert(true, "buyer sees body after webhook");
  await bob.page.screenshot({ path: `${SHOTS}/4-idea-unlocked.png`, fullPage: true });

  // Rate 1 star, then refund request
  await bob.page.click("button[aria-label='1 star']");
  await bob.page.fill("textarea[name=comment]", "Too thin for the price.");
  await bob.page.click("text=Submit rating");
  await bob.page.waitForSelector("text=Thanks for rating.");
  await bob.page.reload();
  assert(await bob.page.isVisible("text=Request a refund"), "refund offered after 1-star rating");
  await bob.page.fill("textarea[name=reason]", "Not what the teaser promised");
  await bob.page.click("button:has-text('Request a refund')");
  await bob.page.waitForSelector("text=Refund requested");

  // Bob reports the idea
  await bob.page.click("text=Report this idea");
  await bob.page.fill("textarea[name=reason] >> nth=-1", "Looks copied from a blog post");
  await bob.page.click("text=Send report");
  await bob.page.waitForSelector("text=A moderator will review it");

  // Me pages
  await alice.page.goto(`${SITE}/me`);
  assert(await alice.page.isVisible("text=$5.95"), "alice earnings = 85% of $7");
  await alice.page.screenshot({ path: `${SHOTS}/5-me.png`, fullPage: true });
  await bob.page.goto(`${SITE}/me`);
  assert(await bob.page.isVisible("text=Night-shift kitchens"), "bob sees unlock in My unlocks");

  // Public profile
  await anon.goto(`${SITE}/u/alice`);
  assert(await anon.isVisible("text=Night-shift kitchens"), "public profile lists idea");

  // Admin
  const admin = await login(browser, "admin@example.com");
  await admin.page.goto(`${SITE}/admin`);
  assert(admin.page.url() === `${SITE}/`, "non-admin bounced from /admin");
  sql(`update profiles set is_admin=true where username='admin'`);
  await admin.page.goto(`${SITE}/admin`);
  assert(await admin.page.isVisible("text=Refund requests (1)"), "admin sees refund request");
  assert(await admin.page.isVisible("text=Open reports (1)"), "admin sees report");
  await admin.page.screenshot({ path: `${SHOTS}/6-admin.png`, fullPage: true });
  await admin.page.click("text=Deny");
  await admin.page.waitForSelector("text=Refund requests (0)");
  await admin.page.click("text=Remove idea");
  await admin.page.waitForSelector("text=Open reports (0)");
  assert(sql(`select status from ideas where id='${ideaId}'`) === "removed", "idea removed");

  await bob.page.goto(`${SITE}/idea/${ideaId}`);
  assert(!(await bob.page.content()).includes("secret plan"), "removed idea hidden from buyer");
  await anon.goto(SITE);
  assert(!(await anon.isVisible("text=Night-shift kitchens")), "removed idea gone from feed");

  // Refund via webhook revokes access
  sql(`update ideas set status='live' where id='${ideaId}'`);
  const refundPayload = JSON.stringify({
    id: "evt_test_2",
    object: "event",
    type: "charge.refunded",
    data: { object: { id: "ch_1", object: "charge", refunded: true, payment_intent: "pi_test_1" } },
  });
  const r2 = await fetch(`${SITE}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: refundPayload, secret: "whsec_localtest" }),
    },
    body: refundPayload,
  });
  assert(r2.status === 200, "refund webhook accepted");
  assert(sql(`select status from purchases where id='${purchaseId}'`) === "refunded", "purchase refunded");
  await bob.page.goto(`${SITE}/idea/${ideaId}`);
  assert(!(await bob.page.content()).includes("secret plan"), "refunded buyer loses access");

  // Mobile layout
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${SITE}/idea/${ideaId}`);
  await mobile.screenshot({ path: `${SHOTS}/7-mobile.png`, fullPage: true });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, "no horizontal scroll on mobile");

  console.log("\nE2E passed");
} finally {
  await browser.close();
}
