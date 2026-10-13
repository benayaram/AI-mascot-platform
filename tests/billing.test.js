import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { reconcileSubscription } from "../server/billing.js";
const subscription = (status, price) => ({
  status,
  items: { data: [{ price: { id: price } }] },
});
async function reconcile(current, eventType = "customer.subscription.updated") {
  const updates = [];
  const iterable = {
    async *[Symbol.asyncIterator]() {
      yield* current;
    },
  };
  const fake = {
    subscriptions: {
      list: async (options) => {
        assert.equal(options.customer, "cus_test");
        return iterable;
      },
    },
  };
  await reconcileSubscription(
    {
      id: "evt_test",
      type: eventType,
      data: { object: { customer: "cus_test" } },
    },
    fake,
    { update: async (...args) => updates.push(args) },
    { pro: "price_pro", business: "price_business" },
  );
  return updates[0]?.[2].plan;
}
test("billing selects the highest active plan and ignores unpaid subscriptions", async () => {
  assert.equal(await reconcile([subscription("active", "price_pro")]), "pro");
  assert.equal(
    await reconcile([
      subscription("active", "price_pro"),
      subscription("trialing", "price_business"),
    ]),
    "business",
  );
  assert.equal(
    await reconcile([subscription("past_due", "price_business")]),
    "free",
  );
  assert.equal(await reconcile([subscription("active", "unknown")]), "free");
});
test("a delayed deletion event does not downgrade a newer active subscription", async () => {
  assert.equal(
    await reconcile(
      [
        subscription("canceled", "price_pro"),
        subscription("active", "price_business"),
      ],
      "customer.subscription.deleted",
    ),
    "business",
  );
  assert.equal(await reconcile([], "customer.subscription.deleted"), "free");
});
test("Stripe validates raw signed webhook payloads and rejects forged payloads", () => {
  const stripe = new Stripe("sk_test_fixture"),
    secret = "whsec_test_fixture",
    payload = JSON.stringify({
      id: "evt_test",
      type: "customer.subscription.updated",
    });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(
    stripe.webhooks.constructEvent(payload, header, secret).id,
    "evt_test",
  );
  assert.throws(() =>
    stripe.webhooks.constructEvent(
      payload.replace("evt_test", "evt_forged"),
      header,
      secret,
    ),
  );
});
