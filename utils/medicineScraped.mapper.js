// utils/medicineScraped.mapper.js

export const DEFAULT_SCRAPED_CREATOR_ID =
  process.env.SCRAPED_CREATOR_ID || "68b56e114592c05548bb2354";
// small helpers
const takeFirst = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
const toList = (x) => (Array.isArray(x) ? x.filter(Boolean) : (x ? [x] : []));
const toLowerSafe = (s) => (typeof s === "string" ? s.toLowerCase() : s);
const joinSections = (...sections) =>
    sections
        .flatMap((s) => toList(s))
        .map((s) => (typeof s === "string" ? s.trim() : ""))
        .filter(Boolean)
        .join(" ");

const boolFromProductType = (productTypeArr) => {
    const s = (takeFirst(productTypeArr) || "").toUpperCase();
    // "HUMAN PRESCRIPTION DRUG" ⇒ true
    // "HUMAN OTC DRUG" ⇒ false
    if (!s) return null;
    if (s.includes("PRESCRIPTION")) return true;
    if (s.includes("OTC")) return false;
    return null;
};

export const normalizeScrapedMedicine = (scraped) => {
    const d = scraped?.data || {};
    const fda = d?.openfda || {};

    const brand = takeFirst(fda.brand_name) || null;
    const generic = takeFirst(fda.generic_name) || null;

    // prefer openFDA route, fallback to top-level route
    const routeRaw =
        takeFirst(fda.route) ??
        (Array.isArray(d.route) ? takeFirst(d.route) : d.route) ??
        null;

    const manufacturer = takeFirst(fda.manufacturer_name) || null;

    // Core text sections
    const description = joinSections(
        d.description,
        d.clinical_pharmacology,
        d.indications_and_usage
    );

    const usage = joinSections(d.dosage_and_administration);
    const storage = joinSections(d.storage_and_handling);

    // Arrays → always arrays for FE-parity
    const warnings = toList(d.warnings);
    const contraindications = toList(d.contraindications);
    const sideEffects = toList(d.adverse_reactions);
    const adverseReactions = sideEffects; // keep both keys filled for FE
    const pediatricUseTxt = joinSections(d.pediatric_use);

    // booleans (best-effort only, keep null if unsure)
    const rxRequired = boolFromProductType(fda.product_type);

    let pregnancySafe = null;
    const pregnancyTxt = joinSections(d.pregnancy, d.teratogenic_effects);
    if (pregnancyTxt) {
        const t = pregnancyTxt.toLowerCase();
        if (t.includes("category x")) pregnancySafe = false;
        else if (t.includes("category a") || t.includes("category b")) pregnancySafe = true;
    }

    let pediatricUse = null;
    if (pediatricUseTxt) {
        const t = pediatricUseTxt.toLowerCase();
        if (t.includes("not established") || t.includes("not recommended")) pediatricUse = false;
        else pediatricUse = true;
    }

    return {
        _id: scraped._id,

        // FE-compatible keys from manual schema
        userId: DEFAULT_SCRAPED_CREATOR_ID,
        medicineName: brand || generic || "Unknown Medicine",
        dosage: null, // strength parse is tricky; keep null unless a parser is added
        description: description || "",
        takenForSymptoms: null, // could be derived from indications; we keep it in description for now
        associatedRisks: null,  // could be derived from warnings; we keep warnings array
        price: null,
        quantity: null,
        singlePack: joinSections(d.how_supplied) || null,
        mfgDate: null,
        expDate: null,
        createdByAdmin: true,
        brandName: brand,
        manufacturer: manufacturer,
        usage: usage || null,
        route: toLowerSafe(routeRaw), // 🔽 lowercase like manual ("topical", "oral" etc.)

        sideEffects,
        warnings,
        contraindications,
        storageInstructions: storage || null,
        pregnancySafe,
        pediatricUse,
        adverseReactions,
        rxRequired,

        // FE parity / stability
        __v: 0, // ensure present like manual
        createdAt: scraped.createdAt,
        updatedAt: scraped.updatedAt,
        source: "scraped",

        // NOTE: image intentionally omitted to match manual FE shape requirement
    };
};

// Batch normalize (no-AI; super fast)
export const normalizeScrapedMedicineBatch = async (docs = []) => {
    return docs.map(normalizeScrapedMedicine);
};

// Build Mongo filter for scraped collection
// Supports: search across brand/generic + key sections
export const buildScrapedMedicineMongoFilter = ({ search }) => {
    const filter = {};
    if (search && String(search).trim()) {
        const regex = new RegExp(String(search).trim(), "i");
        filter.$or = [
            { "data.openfda.brand_name": regex },
            { "data.openfda.generic_name": regex },
            { "data.description": regex },
            { "data.indications_and_usage": regex },
            { "data.dosage_and_administration": regex },
            { "data.warnings": regex },
            { "data.adverse_reactions": regex },
        ];
    }
    return filter;
};
