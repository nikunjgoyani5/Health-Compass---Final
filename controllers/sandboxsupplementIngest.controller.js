import SupplementModel from "../models/supplements.model.js";


export const ingestSupplement = async (req, res) => {
    const runId = `ing-${Date.now()}`;
    try {
        const b = req.body;

        // ✅ Basic validation
        if (!b.productName || !b.brandName) {
            console.log(`[${runId}] missing fields`, b);
            return res
                .status(400)
                .json({ ok: false, message: "productName and brandName are required" });
        }

        // ✅ Normalize input → fit your schema
        const doc = new SupplementModel({
            createdBy: b.createdBy || null, // optional
            productName: b.productName.trim(),
            brandName: b.brandName.trim(),
            servingsPerContainer: b.servingsPerContainer || "",
            servingSize: b.servingSize || "",
            ingredients: b.ingredients || [], // must be Ingredient IDs (ObjectId)
            tags: b.tags || [], // must be SupplementTag IDs
            usageGroup: b.usageGroup || [],
            description: b.description || "",
            warnings: b.warnings || [],
            claims: b.claims || [],
            isAvailable: b.isAvailable ?? true,
            createdByAdmin: b.createdByAdmin ?? false,
            image: b.image || null,
        });

        // ✅ Save
        const saved = await doc.save();

        console.log(`[${runId}] inserted supplement ${saved._id}`);

        return res.status(201).json({
            ok: true,
            id: saved._id,
            productName: saved.productName,
            brandName: saved.brandName,
        });
    } catch (err) {
        console.error(`[${runId}] ingest_failed`, err);
        return res
            .status(500)
            .json({ ok: false, message: "ingest_failed", error: err.message });
    }
};
