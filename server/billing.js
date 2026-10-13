import { plans } from "./plans.js";
/** Reconcile the customer's current state, including reordered or duplicate events. */
export async function reconcileSubscription(
  event,
  stripeClient,
  storage,
  { pro, business },
) {
  if (
    ![
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ].includes(event.type)
  )
    return null;
  const customer = event.data.object.customer;
  const subscriptions = await stripeClient.subscriptions.list({
    customer,
    status: "all",
    limit: 100,
  });
  let plan = "free";
  for await (const sub of subscriptions) {
    if (!["active", "trialing"].includes(sub.status)) continue;
    for (const item of sub.items.data) {
      const price = item.price.id;
      const candidate =
        price === business ? "business" : price === pro ? "pro" : "free";
      if (plans[candidate].messages > plans[plan].messages) plan = candidate;
    }
  }
  await storage.update("users", { stripe_customer: customer }, { plan });
  return { customer, plan, event: event.id };
}
