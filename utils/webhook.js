import Stripe from "stripe";
import UserModel from "../models/user.model.js";
import PlanModel from "../models/plan.model.js"; // ⬅️ ensure correct path/casing
import enums from "../config/enum.config.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret =
  process.env.STRIPE_WEBHOOK_SECRET || "whsec_1IaKQz8zZfzLAqetlOygHCvHkIWnOU5U";

const isValidUnix = (timestamp) =>
  typeof timestamp === "number" && !isNaN(new Date(timestamp * 1000).getTime());

async function updateUser(filter, fields) {
  if (!filter || Object.keys(filter).length === 0) return null;
  return UserModel.findOneAndUpdate(filter, fields, { new: true });
}

// Normalize Stripe subscription -> price/info
function extractPriceInfoFromSubscription(sub) {
  // New API shape prefers items[0].price
  const item = sub?.items?.data?.[0] || null;
  const priceObj = item?.price || sub?.plan || null;
  const priceId = priceObj?.id || null;

  const amountCents =
    priceObj?.unit_amount != null
      ? priceObj.unit_amount
      : priceObj?.unit_amount_decimal != null
      ? Math.round(Number(priceObj.unit_amount_decimal))
      : null;

  const currency = (priceObj?.currency || "USD").toUpperCase();
  const interval = priceObj?.recurring?.interval || "month";
  const intervalCount = priceObj?.recurring?.interval_count || 1;

  return { priceId, amountCents, currency, interval, intervalCount, priceObj };
}

function mapStripeSubStatusToAppStatus(stripeStatus) {
  // Stripe: incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused (beta)
  if (stripeStatus === "trialing") return "trialing";
  if (stripeStatus === "active") return "active";
  if (stripeStatus === "past_due") return "past_due";
  if (stripeStatus === "canceled") return "canceled";
  if (stripeStatus === "unpaid") return "past_due";
  // default: keep a safe value
  return "active";
}

async function buildSubscriptionDetails(priceId, stripeSubOrSession) {
  // 1) Pull from Stripe subscription for canonical billing cadence/amount
  let amountFromStripeCents = null;
  let currencyFromStripe = "USD";
  let intervalFromStripe = "month";

  if (stripeSubOrSession?.items || stripeSubOrSession?.plan) {
    const info = extractPriceInfoFromSubscription(stripeSubOrSession);
    amountFromStripeCents = info.amountCents;
    currencyFromStripe = info.currency || currencyFromStripe;
    intervalFromStripe = info.interval || intervalFromStripe;
  }

  // 2) Resolve your Plan & matching price row
  const plan = await PlanModel.findOne({
    "prices.stripePriceId": priceId,
  }).lean();
  const selectedPrice = plan?.prices?.find((p) => p.stripePriceId === priceId);

  // Final fields
  const priceDecimal =
    amountFromStripeCents != null
      ? amountFromStripeCents / 100
      : selectedPrice?.amountCents != null
      ? selectedPrice.amountCents / 100
      : 0;

  return {
    planId: plan?._id || null,
    planName: plan?.name || null,
    planLabel: selectedPrice?.label || null,
    price: priceDecimal,
    currency: (
      selectedPrice?.currency ||
      currencyFromStripe ||
      "USD"
    ).toUpperCase(),
    interval: selectedPrice?.interval || intervalFromStripe || "month",
  };
}

export const stripeWebhookHandler = async (req, res) => {
  console.log("🌐 Webhook received...");
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    // IMPORTANT: req.body must be the raw buffer
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const type = event.type;
  const data = event.data.object;
  console.log("✅ Stripe event:", type);

  try {
    // ==============================
    // SUBSCRIPTION LIFECYCLE
    // ==============================
    if (
      type === "customer.subscription.created" ||
      type === "customer.subscription.updated"
    ) {
      const sub = data; // Subscription
      const customerId = sub.customer;
      const subscriptionId = sub.id;

      const { priceId } = extractPriceInfoFromSubscription(sub);
      const appStatus = mapStripeSubStatusToAppStatus(sub.status);
      const isActive = ["active", "trialing"].includes(appStatus);

      // Build subscriptionDetails from Plan + Stripe
      const built = priceId
        ? await buildSubscriptionDetails(priceId, sub)
        : null;

      const updateFields = {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: sub.status,
        is_premium: Boolean(isActive),
        isSubscribed: Boolean(isActive),
        subscriptionType: enums.subscriptionTypeEnum.PREMIUM,
        subscriptionStartDate: isValidUnix(sub.start_date)
          ? new Date(sub.start_date * 1000)
          : null,
        subscriptionEndDate: isValidUnix(sub.current_period_end)
          ? new Date(sub.current_period_end * 1000)
          : null,
        stripeDetails: sub,
        lastPaymentDate: new Date(),
        paymentStatus: isActive
          ? "paid"
          : sub.status === "canceled"
          ? "canceled"
          : "pending",
      };

      if (built) {
        updateFields.subscriptionDetails = {
          ...built,
          status: appStatus, // must be one of your enum values
        };
      }

      const user = await updateUser(
        { stripeCustomerId: customerId },
        updateFields
      );
      if (user) console.log(`✅ Subscription upserted for: ${user?.email}`);
      else console.warn(`⚠️ No user found for stripeCustomerId=${customerId}`);
    }

    // ==============================
    // CHECKOUT SESSION COMPLETED
    // (entrypoint for subs & one-time)
    // ==============================
    else if (type === "checkout.session.completed") {
      const session = data; // CheckoutSession
      const customerId = session.customer;
      const metaUserId = session.metadata?.userId;

      // Payment status mapping
      let paymentStatus = "pending";
      if (session.status === "expired") paymentStatus = "expired";
      else if (session.payment_status === "paid") paymentStatus = "paid";
      else if (session.payment_status === "requires_payment_method")
        paymentStatus = "requires_action";

      const patch = {
        paymentStatus,
        stripeCustomerId: customerId || undefined,
        stripeSubscriptionId: session.subscription || undefined,
        lastPaymentDate: new Date(),
      };

      // If subscription mode, expand subscription and also fill subscriptionDetails
      if (session.mode === "subscription" && session.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          const { priceId } = extractPriceInfoFromSubscription(sub);
          const appStatus = mapStripeSubStatusToAppStatus(sub.status);
          const active = ["active", "trialing"].includes(appStatus);

          if (active) {
            patch.is_premium = true;
            patch.isSubscribed = true;
            patch.subscriptionStatus = sub.status;
            patch.subscriptionStartDate = isValidUnix(sub.start_date)
              ? new Date(sub.start_date * 1000)
              : undefined;
            patch.subscriptionEndDate = isValidUnix(sub.current_period_end)
              ? new Date(sub.current_period_end * 1000)
              : undefined;
          }

          if (priceId) {
            const built = await buildSubscriptionDetails(priceId, sub);
            patch.subscriptionDetails = {
              ...built,
              status: appStatus,
            };
          }
        } catch (e) {
          console.warn("⚠️ Could not expand subscription:", e.message);
        }
      }

      // Resolve user (prefer customerId, fallback to metadata.userId)
      let user = null;
      if (customerId)
        user = await updateUser({ stripeCustomerId: customerId }, patch);
      if (!user && metaUserId)
        user = await updateUser({ _id: metaUserId }, patch);

      if (user)
        console.log(`✅ checkout.session.completed applied to: ${user.email}`);
      else console.warn("⚠️ No user matched for checkout.session.completed");
    }

    // Session expiration / async results
    else if (type === "checkout.session.expired") {
      const session = data;
      const customerId = session.customer;
      const metaUserId = session.metadata?.userId;
      const patch = { paymentStatus: "expired" };
      let user = await updateUser({ stripeCustomerId: customerId }, patch);
      if (!user && metaUserId)
        user = await updateUser({ _id: metaUserId }, patch);
      if (user) console.log(`✅ Marked expired for: ${user.email}`);
    } else if (type === "checkout.session.async_payment_succeeded") {
      const session = data;
      const patch = { paymentStatus: "paid", lastPaymentDate: new Date() };
      let user = await updateUser(
        { stripeCustomerId: session.customer },
        patch
      );
      if (!user && session.metadata?.userId)
        user = await updateUser({ _id: session.metadata.userId }, patch);
      if (user) console.log(`✅ Async paid for: ${user.email}`);
    } else if (type === "checkout.session.async_payment_failed") {
      const session = data;
      const patch = { paymentStatus: "failed" };
      let user = await updateUser(
        { stripeCustomerId: session.customer },
        patch
      );
      if (!user && session.metadata?.userId)
        user = await updateUser({ _id: session.metadata.userId }, patch);
      if (user) console.log(`✅ Async failed for: ${user.email}`);
    }

    // ==============================
    // PAYMENT INTENT (one-time)
    // ==============================
    else if (type === "payment_intent.succeeded") {
      const pi = data;
      if (pi.customer) {
        const user = await updateUser(
          { stripeCustomerId: pi.customer },
          { paymentStatus: "paid", lastPaymentDate: new Date() }
        );
        if (user) console.log(`✅ PI paid for: ${user.email}`);
      }
    } else if (type === "payment_intent.payment_failed") {
      const pi = data;
      if (pi.customer) {
        const user = await updateUser(
          { stripeCustomerId: pi.customer },
          { paymentStatus: "failed" }
        );
        if (user) console.log(`✅ PI failed for: ${user.email}`);
      }
    }

    // ==============================
    // INVOICES (renewals)
    // ==============================
    else if (type === "invoice.paid") {
      const inv = data;
      if (inv.customer) {
        const user = await updateUser(
          { stripeCustomerId: inv.customer },
          { paymentStatus: "paid", lastPaymentDate: new Date() }
        );
        if (user) console.log(`✅ Invoice paid for: ${user.email}`);
      }
    } else if (type === "invoice.payment_failed") {
      const inv = data;
      if (inv.customer) {
        const user = await updateUser(
          { stripeCustomerId: inv.customer },
          { paymentStatus: "failed" }
        );
        if (user) console.log(`✅ Invoice failed for: ${user.email}`);
      }
    }

    // ==============================
    // REFUNDS (one-time or invoice charges)
    // ==============================
    else if (type === "charge.refunded") {
      // data is a Charge object with refunds array
      const charge = data;
      const customerId = charge.customer || null;
      const latestRefund =
        charge?.refunds?.data?.[charge.refunds.data.length - 1];

      if (customerId) {
        const patch = {
          paymentStatus: "refunded",
          // The 3 fields below are optional; keep only if your schema allows arbitrary fields
          lastRefund: {
            at: latestRefund?.created
              ? new Date(latestRefund.created * 1000)
              : new Date(),
            amount:
              typeof latestRefund?.amount === "number"
                ? latestRefund.amount / 100
                : null,
            currency: (charge.currency || "USD").toUpperCase(),
            reason: latestRefund?.reason || null,
            chargeId: charge.id,
            refundId: latestRefund?.id || null,
          },
        };
        const user = await updateUser({ stripeCustomerId: customerId }, patch);
        if (user) console.log(`✅ Charge refunded recorded for: ${user.email}`);
      } else {
        console.warn(
          "⚠️ charge.refunded without customer; skipping user update"
        );
      }
    } else if (type === "refund.succeeded") {
      // data is a Refund object; fetch charge to resolve the customer reliably
      const refund = data;
      let customerId = null;
      try {
        if (refund.charge) {
          const charge = await stripe.charges.retrieve(refund.charge);
          customerId = charge?.customer || null;
          if (customerId) {
            const patch = {
              paymentStatus: "refunded",
              lastRefund: {
                at: refund.created
                  ? new Date(refund.created * 1000)
                  : new Date(),
                amount:
                  typeof refund.amount === "number"
                    ? refund.amount / 100
                    : null,
                currency: (refund.currency || "USD").toUpperCase(),
                reason: refund.reason || null,
                chargeId: refund.charge || null,
                refundId: refund.id || null,
              },
            };
            const user = await updateUser(
              { stripeCustomerId: customerId },
              patch
            );
            if (user)
              console.log(`✅ Refund succeeded recorded for: ${user.email}`);
          } else {
            console.warn("⚠️ refund.succeeded: charge has no customer");
          }
        } else {
          console.warn(
            "⚠️ refund.succeeded without charge; cannot resolve customer"
          );
        }
      } catch (e) {
        console.warn("⚠️ Could not retrieve charge for refund:", e.message);
      }
    }

    // ==============================
    // SUBSCRIPTION DELETED (cancel)
    // ==============================
    else if (type === "customer.subscription.deleted") {
      const sub = data;
      const { priceId } = extractPriceInfoFromSubscription(sub);
      const built = priceId
        ? await buildSubscriptionDetails(priceId, sub)
        : null;

      const user = await updateUser(
        { stripeCustomerId: sub.customer },
        {
          paymentStatus: "canceled",
          is_premium: false,
          isSubscribed: false,
          subscriptionStatus: "canceled",
          // keep last known plan metadata but mark status canceled
          ...(built
            ? { subscriptionDetails: { ...built, status: "canceled" } }
            : {}),
        }
      );
      if (user) console.log(`✅ Subscription canceled for: ${user.email}`);
    }
  } catch (error) {
    console.error("❌ Error updating user on webhook:", error);
  }

  res.status(200).send("Webhook received");
};
