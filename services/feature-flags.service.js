import FeatureFlagModel from "../models/feature-flags.model.js";

const cache = new Map();

const featureFlags = {
  async isEnabled(key, userId = null) {
    const cacheKey = userId ? `${key}:${userId}` : key;
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const query = { key };
    if (userId) query.userId = userId;
    const flag = await FeatureFlagModel.findOne(query);
    cache.set(cacheKey, flag?.value ?? false);
    return flag?.value ?? false;
  },

  async setFlag(key, value, description = "", userId = null) {
    const query = { key };
    if (userId) query.userId = userId;
    await FeatureFlagModel.updateOne(
      query,
      { value, description, updatedAt: new Date(), userId },
      { upsert: true }
    );
    const cacheKey = userId ? `${key}:${userId}` : key;
    cache.set(cacheKey, value);
  },

  async listFlags() {
    return FeatureFlagModel.find({}).sort({ createdAt: -1 });
  },

  // Optional: clear cache (for tests or admin)
  clearCache() {
    cache.clear();
  },
};

export default featureFlags;
