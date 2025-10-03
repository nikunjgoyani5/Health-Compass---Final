// utils/supplementScraped.mapper.js

// ------- Config (tune as needed) -------
const AI_ENABLED = !!process.env.OPENAI_API_KEY;
const AI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const AI_TIMEOUT_MS = Number(process.env.SCRAPED_AI_TIMEOUT_MS || 1500);
const BATCH_CONCURRENCY = Number(process.env.SCRAPED_AI_CONCURRENCY || 4);
const LRU_MAX = Number(process.env.SCRAPED_LRU_MAX || 20000);
const LRU_TTL_MS = Number(process.env.SCRAPED_LRU_TTL_MS || 7 * 24 * 60 * 60 * 1000); // 7d

// 👉 Default creator for scraped docs (FE/BE parity)
export const DEFAULT_SCRAPED_CREATOR_ID =
  process.env.SCRAPED_CREATOR_ID || "68b56e114592c05548bb2354";

// ------- Tiny LRU (no deps) -------
class TinyLRU {
  constructor(max = 20000) {
    this.max = max;
    this.map = new Map(); // key -> {value, exp}
  }
  get(key) {
    const node = this.map.get(key);
    if (!node) return null;
    const { value, exp } = node;
    if (exp && Date.now() > exp) {
      this.map.delete(key);
      return null;
    }
    // bump recency
    this.map.delete(key);
    this.map.set(key, node);
    return value;
  }
  set(key, value, ttlMs = LRU_TTL_MS) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, exp: ttlMs ? Date.now() + ttlMs : null });
    if (this.map.size > this.max) {
      // evict LRU (first)
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }
}
const LRU = new TinyLRU(LRU_MAX);

// ------- Simple semaphore (no deps) -------
class Semaphore {
  constructor(max) {
    this.max = max;
    this.running = 0;
    this.queue = [];
  }
  async run(task) {
    if (this.running >= this.max) {
      await new Promise((res) => this.queue.push(res));
    }
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
const sem = new Semaphore(BATCH_CONCURRENCY);

// ------- helpers -------
const toStrOrNull = (val) => (val === undefined || val === null ? null : String(val));

// ------- Local fast normalizer (fallback) -------
export const normalizeScrapedSupplement = (scraped) => {
  const d = scraped?.data || {};
  const firstServing = Array.isArray(d.servingSizes) && d.servingSizes[0];

  // Collect ingredient names (main + other)
  const mainIng =
    (d.ingredientRows || []).map((r) => r?.name || r?.ingredientGroup).filter(Boolean);
  const otherIng =
    (d.otheringredients?.ingredients || [])
      .map((r) => r?.name || r?.ingredientGroup)
      .filter(Boolean);

  return {
    _id: scraped._id?.toString?.() || String(scraped._id || ""),
    // ✅ default to admin user (string id); controller will hydrate to full object
    createdBy: String(DEFAULT_SCRAPED_CREATOR_ID),
    createdByAdmin: true, // scraped = admin-created
    productName: d.fullName || d.bundleName || "Unknown Product",
    brandName: d.brandName || "Unknown Brand",

    // 🔧 Coerce to string for schema parity (your schema expects String)
    servingsPerContainer: toStrOrNull(d.servingsPerContainer),
    servingSize: toStrOrNull(firstServing?.unit),

    // populate-safe arrays (no refs for scraped)
    ingredients: [...new Set([...mainIng, ...otherIng])].map((name) => ({
      name,
      quantity: null,
      unit: null,
    })),
    tags: [],

    usageGroup: Array.isArray(d.targetGroups) ? d.targetGroups : [],
    description:
      (Array.isArray(d.statements)
        ? d.statements.map((s) => s?.notes).filter(Boolean).join(" ")
        : "") || "",
    warnings: Array.isArray(d.statements)
      ? d.statements
          .filter((s) => (s?.type || "").toLowerCase().includes("precaution"))
          .map((s) => s?.notes)
          .filter(Boolean)
      : [],
    claims: Array.isArray(d.claims)
      ? d.claims.map((c) => c?.langualCodeDescription).filter(Boolean)
      : [],

    isAvailable: !d.offMarket,
    image: d.thumbnail || null,
    createdAt: scraped.createdAt || null,
    updatedAt: scraped.updatedAt || null,
    source: "scraped",
  };
};

// ------- Very lightweight mongo filter for scraped -------
export const buildScrapedMongoFilter = ({ search, usageGroups }) => {
  const filter = {};
  if (search) {
    const regex = new RegExp(search, "i");
    filter.$or = [
      { "data.fullName": regex },
      { "data.brandName": regex },
      { "data.statements.notes": regex },
    ];
  }
  if (usageGroups) {
    filter["data.targetGroups"] = { $in: [usageGroups] };
  }
  return filter;
};

// ------- Post-filter by ingredient names (scraped has no refs) -------
export const postFilterByIngredientNames = (normalizedList, ingreNames) => {
  if (!ingreNames?.length) return normalizedList;
  const set = new Set(ingreNames.map((s) => s.toLowerCase()));
  return normalizedList.filter((item) =>
    (item.ingredients || []).some((x) => set.has((x?.name || "").toLowerCase()))
  );
};

// ------- GPT normalizer (timeout + strict JSON + fallback) -------
let OpenAIClient = null;
try {
  if (AI_ENABLED) {
    const OpenAI = (await import("openai")).default;
    OpenAIClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (_) {
  OpenAIClient = null;
}

const SYSTEM_PROMPT =
  "You convert messy scraped supplement JSON into a strict, safe shape for a health app. " +
  "Do not fabricate unsafe claims. Prefer exact values; otherwise leave null/empty. " +
  "Units: copy as-is if present. Arrays must stay conservative. " +
  "Always set createdByAdmin=true, createdBy=<DEFAULT_ADMIN_USER_ID>, source='scraped'.";

const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "SupplementModelShape",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        _id: { type: ["string", "null"] },
        createdBy: { type: ["string", "null"] },
        createdByAdmin: { type: "boolean" },
        productName: { type: ["string", "null"] },
        brandName: { type: ["string", "null"] },
        servingsPerContainer: { type: ["string", "null"] },
        servingSize: { type: ["string", "null"] },
        description: { type: "string" },
        warnings: { type: "array", items: { type: "string" } },
        claims: { type: "array", items: { type: "string" } },
        usageGroup: { type: "array", items: { type: "string" } },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              quantity: { type: ["number", "null"] },
              unit: { type: ["string", "null"] },
            },
            required: ["name"],
          },
        },
        tags: { type: "array", items: { type: "string" } },
        isAvailable: { type: "boolean" },
        image: { type: ["string", "null"] },
        createdAt: { type: ["string", "null"] },
        updatedAt: { type: ["string", "null"] },
        source: { type: "string" },
      },
      required: [
        "createdByAdmin",
        "productName",
        "brandName",
        "description",
        "warnings",
        "claims",
        "usageGroup",
        "ingredients",
        "tags",
        "isAvailable",
        "source",
      ],
    },
    strict: true,
  },
};

const withTimeout = (p, ms) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("GPT_TIMEOUT")), ms)),
  ]);

export async function normalizeScrapedWithAI(scrapedDoc) {
  const cacheKey = `scraped:norm:${scrapedDoc._id}`;
  const hit = LRU.get(cacheKey);
  if (hit) return hit;

  if (!AI_ENABLED || !OpenAIClient) {
    const fast = normalizeScrapedSupplement(scrapedDoc);
    LRU.set(cacheKey, fast);
    return fast;
  }

  const payload = {
    scraped: {
      _id: String(scrapedDoc._id || ""),
      data: scrapedDoc.data || {},
      createdAt: scrapedDoc.createdAt || null,
      updatedAt: scrapedDoc.updatedAt || null,
    },
    targetShapeNote:
      "Map to fields: productName, brandName, servingsPerContainer (string), servingSize (string), " +
      "description, warnings[], claims[], usageGroup[], ingredients[{name,quantity,unit}], tags[], " +
      "isAvailable(bool), image, createdByAdmin=true, createdBy=<DEFAULT_ADMIN_USER_ID>, source='scraped'.",
  };

  try {
    const completion = await withTimeout(
      OpenAIClient.chat.completions.create({
        model: AI_MODEL,
        temperature: 0,
        response_format: responseFormat,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
      AI_TIMEOUT_MS
    );

    const raw = completion?.choices?.[0]?.message?.content;
    const parsed = raw ? JSON.parse(raw) : null;

    const safe = {
      ...parsed,
      _id: String(scrapedDoc._id || parsed?._id || ""),
      // ✅ enforce default admin creator id as string
      createdBy: String(DEFAULT_SCRAPED_CREATOR_ID),
      createdByAdmin: true,
      source: "scraped",
      // keep timestamps from DB if present
      createdAt: scrapedDoc.createdAt || parsed?.createdAt || null,
      updatedAt: scrapedDoc.updatedAt || parsed?.updatedAt || null,
    };

    // 🔧 Ensure string coercion for servings (in case GPT returns numbers)
    safe.servingsPerContainer = toStrOrNull(safe.servingsPerContainer);
    safe.servingSize = toStrOrNull(safe.servingSize);

    LRU.set(cacheKey, safe);
    return safe;
  } catch (_) {
    const fast = normalizeScrapedSupplement(scrapedDoc);
    LRU.set(cacheKey, fast, 24 * 60 * 60 * 1000); // 1d cache for fallback
    return fast;
  }
}

// Batch with concurrency cap (good for 15k+ overall, but only page-size per request)
export async function normalizeScrapedBatch(scrapedDocs = []) {
  return Promise.all(
    scrapedDocs.map((doc) => sem.run(() => normalizeScrapedWithAI(doc)))
  );
}

// -------- Optional utilities for ops/metrics (no-op safe) --------
export function _cacheStats() {
  return { size: LRU.map.size, max: LRU.max };
}
export function _cacheClear() {
  LRU.map.clear();
}
