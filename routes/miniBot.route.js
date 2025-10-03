// routes/miniBot.route.js
import { Router } from "express";
import { getMiniBotMenu, chatWithMiniBot } from "../controllers/miniBot.controller.js";

const router = Router();

router.get("/menu", getMiniBotMenu);
router.post("/chat", chatWithMiniBot);

export default router;
