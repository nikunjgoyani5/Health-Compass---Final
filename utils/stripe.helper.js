import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Get Stripe customer by email or token
 */
export const getStripeCustomer = async ({ email, token }) => {
  if (token) {
    return await stripe.customers.retrieve(token);
  }

  const customers = await stripe.customers.list({ email, limit: 1 });
  return customers?.data?.[0] || null;
};

/**
 * Check if a customer has an active subscription
 */
export const hasActiveSubscription = async (customerId) => {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  return subscriptions.data.some((sub) =>
    ["active", "trialing"].includes(sub.status)
  );
};
