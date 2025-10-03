import express from "express";
import { ingestSupplement } from "../controllers/sandboxsupplementIngest.controller.js";

const router = express.Router();

// POST /api/sandbox/ingest/supplement
router.post("/ingest/supplement", ingestSupplement);

export default router;
