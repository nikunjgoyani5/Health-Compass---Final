// utils/ingredientScraped.mapper.js

// ------------------ Config ------------------
const AI_ENABLED = !!process.env.OPENAI_API_KEY;
const AI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const AI_TIMEOUT_MS = Number(process.env.SCRAPED_AI_TIMEOUT_MS || 1500);
const BATCH_CONCURRENCY = Number(process.env.SCRAPED_AI_CONCURRENCY || 4);
const LRU_MAX = Number(process.env.SCRAPED_LRU_MAX || 20000);
const LRU_TTL_MS = Number(process.env.SCRAPED_LRU_TTL_MS || 7 * 24 * 60 * 60 * 1000); // 7d

// 👉 Default creator for scraped Ingredient docs (string id)
export const DEFAULT_SCRAPED_ING_CREATOR_ID =
  process.env.SCRAPED_ING_CREATOR_ID || "68b56e114592c05548bb2354";

// ------------------ Tiny LRU ------------------
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
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }
}
const LRU = new TinyLRU(LRU_MAX);

// ------------------ Semaphore ------------------
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

// ------------------ Helpers ------------------
const toList = (x) => (Array.isArray(x) ? x.filter(Boolean) : (x ? [x] : []));
const joinSections = (...sections) =>
  sections
    .flatMap((s) => toList(s))
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" ");

// ------------------ Local fast normalizer (fallback) ------------------
/**
 * DSLD-like scraped doc fields (based on your sample):
 * {
 *   _id, groupName, category[], synonyms[], factsheets[], nutrientInfo[],
 *   createdAt, updatedAt, ...
 * }
 */
export const normalizeScrapedIngredient = (scraped) => {
  const name = scraped?.groupName || "Unknown Ingredient";
  const categories = toList(scraped?.category);
  const aliases = toList(scraped?.synonyms);

  // factsheets → best-effort description
  const description = joinSections(scraped?.factsheets);

  // nutrientInfo can contain strings or objects
  const nutrientsRaw = Array.isArray(scraped?.nutrientInfo) ? scraped.nutrientInfo : [];
  const nutrients = nutrientsRaw
    .map((n) => {
      if (!n) return null;
      if (typeof n === "string") {
        return { name: n, amount: null, dailyValuePercent: null };
      }
      // If object with name/amount/dv
      return {
        name: n.name || null,
        amount: n.amount || null,
        dailyValuePercent: n.dailyValuePercent || null,
      };
    })
    .filter(Boolean);

  return {
    _id: scraped?._id,
    createdBy: DEFAULT_SCRAPED_ING_CREATOR_ID, // string id; controller will replace with populated user object
    createdByAdmin: true,

    name,
    categories,
    aliases,
    description: description || null,
    nutrients,

    // Arrays for FE parity
    healthEffects: [], // [{ description, type: "positive"|"negative" }]
    usage: null,
    foundInFoods: [],
    sideEffects: [],
    precautions: [],

    __v: 0,
    createdAt: scraped?.createdAt || null,
    updatedAt: scraped?.updatedAt || null,
    source: "scraped",
  };
};

// ------------------ OpenAI client (lazy) ------------------
let OpenAIClient = null;
try {
  if (AI_ENABLED) {
    const OpenAI = (await import("openai")).default;
    OpenAIClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (_) {
  OpenAIClient = null;
}

// ------------------ AI System Prompt + Schema ------------------
const SYSTEM_PROMPT =
  "You convert messy scraped ingredient JSON into a strict, safe shape for a health app. " +
  "Do not fabricate biomedical claims. If not sure, leave fields null or empty arrays. " +
  "Use short, neutral language in 'description' and 'usage'. Prefer factsheets/synonyms/category if available. " +
  "Always set createdByAdmin=true, createdBy to the provided DEFAULT ID, source='scraped'.";

const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "IngredientModelShape",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        _id: { type: ["string", "null"] },
        createdBy: { type: ["string", "null"] },
        createdByAdmin: { type: "boolean" },
        name: { type: ["string", "null"] },
        categories: { type: "array", items: { type: "string" } },
        aliases: { type: "array", items: { type: "string" } },
        description: { type: ["string", "null"] },
        nutrients: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: ["string", "null"] },
              amount: { type: ["string", "null"] },           // keep string to match manual
              dailyValuePercent: { type: ["string", "null"] }, // keep string to match manual
            },
            required: ["name", "amount", "dailyValuePercent"],
          },
        },
        healthEffects: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              description: { type: ["string", "null"] },
              type: { type: ["string", "null"] }, // "positive"/"negative"
            },
            required: ["description", "type"],
          },
        },
        usage: { type: ["string", "null"] },
        foundInFoods: { type: "array", items: { type: "string" } },
        sideEffects: { type: "array", items: { type: "string" } },
        precautions: { type: "array", items: { type: "string" } },
        __v: { type: ["number", "null"] },
        createdAt: { type: ["string", "null"] },
        updatedAt: { type: ["string", "null"] },
        source: { type: "string" },
      },
      required: [
        "createdByAdmin",
        "name",
        "categories",
        "aliases",
        "description",
        "nutrients",
        "healthEffects",
        "usage",
        "foundInFoods",
        "sideEffects",
        "precautions",
        "__v",
        "source",
      ],
    },
    strict: true,
  },
};

// ------------------ Timeout helper ------------------
const withTimeout = (p, ms) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error("GPT_TIMEOUT")), ms)),
  ]);

// ------------------ AI Normalizer with cache+fallback ------------------
export async function normalizeIngredientWithAI(scrapedDoc) {
  // Cache
  const cacheKey = `ing:norm:${scrapedDoc._id}`;
  const hit = LRU.get(cacheKey);
  if (hit) return hit;

  // If AI disabled -> fallback
  if (!AI_ENABLED || !OpenAIClient) {
    const fast = normalizeScrapedIngredient(scrapedDoc);
    LRU.set(cacheKey, fast);
    return fast;
  }

  const payload = {
    scraped: {
      _id: String(scrapedDoc._id || ""),
      // We pass only relevant pieces to keep tokens low:
      groupName: scrapedDoc.groupName || null,
      category: scrapedDoc.category || [],
      synonyms: scrapedDoc.synonyms || [],
      factsheets: scrapedDoc.factsheets || [],
      nutrientInfo: scrapedDoc.nutrientInfo || [],
      createdAt: scrapedDoc.createdAt || null,
      updatedAt: scrapedDoc.updatedAt || null,
    },
    DEFAULT_SCRAPED_ING_CREATOR_ID: DEFAULT_SCRAPED_ING_CREATOR_ID,
    targetShapeNote:
      "Return fields exactly as schema: name, categories[], aliases[], description, " +
      "nutrients[{name,amount,dailyValuePercent}], healthEffects[{description,type}], " +
      "usage, foundInFoods[], sideEffects[], precautions[], createdByAdmin=true, createdBy=<DEFAULT>, __v=0, source='scraped'.",
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

    // Post-fix safety + required defaults
    const safe = {
      ...parsed,
      _id: String(scrapedDoc._id || parsed?._id || ""),
      createdBy: DEFAULT_SCRAPED_ING_CREATOR_ID,
      createdByAdmin: true,
      source: "scraped",
      __v: 0,
      createdAt: scrapedDoc.createdAt || parsed?.createdAt || null,
      updatedAt: scrapedDoc.updatedAt || parsed?.updatedAt || null,
    };

    // Arrays safety
    safe.categories = Array.isArray(safe.categories) ? safe.categories : [];
    safe.aliases = Array.isArray(safe.aliases) ? safe.aliases : [];
    safe.nutrients = Array.isArray(safe.nutrients) ? safe.nutrients : [];
    safe.healthEffects = Array.isArray(safe.healthEffects) ? safe.healthEffects : [];
    safe.foundInFoods = Array.isArray(safe.foundInFoods) ? safe.foundInFoods : [];
    safe.sideEffects = Array.isArray(safe.sideEffects) ? safe.sideEffects : [];
    safe.precautions = Array.isArray(safe.precautions) ? safe.precautions : [];

    LRU.set(cacheKey, safe);
    return safe;
  } catch (e) {
    // Timeout/API fail → fallback
    const fast = normalizeScrapedIngredient(scrapedDoc);
    LRU.set(cacheKey, fast, 24 * 60 * 60 * 1000); // 1 day
    return fast;
  }
}

// ------------------ Batch normalizer ------------------
export async function normalizeScrapedIngredientBatch(docs = []) {
  return Promise.all(docs.map((doc) => sem.run(() => normalizeIngredientWithAI(doc))));
}

// ------------------ Scraped mongo filter ------------------
export const buildScrapedIngredientMongoFilter = ({ search }) => {
  const filter = {};
  if (search && String(search).trim()) {
    const regex = new RegExp(String(search).trim(), "i");
    filter.$or = [
      { groupName: regex },
      { synonyms: regex },
      { category: regex },
      // if needed, add nested sources here:
      // { "hits._source.groupName": regex },
    ];
  }
  return filter;
};

// ------------------ Optional cache ops ------------------
export function _cacheStats() {
  return { size: LRU.map.size, max: LRU.max };
}
export function _cacheClear() {
  LRU.map.clear();
}
