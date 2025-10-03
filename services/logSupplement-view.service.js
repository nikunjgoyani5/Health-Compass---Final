import SupplementViewLog from "../models/supplement-view-log.model.js";

export const logSupplementView = async ({
  userId,
  supplementId,
  anonToken,
  ip,
  referrer,
}) => {
  try {
    await SupplementViewLog.create({
      userId,
      supplementId,
      anonToken,
      ip,
      referrer: referrer || "direct",
    });
  } catch (err) {
    console.error("📉 Failed to log supplement view:", err.message);
  }
};
