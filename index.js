import express from "express";
import cors from "cors";
import config from "./config/config.js";
import connectDB from "./config/db.config.js";
import morgan from "morgan";
import http from "http";
import errorHandler from "./middleware/error-handler.middleware.js";
import router from "./router.js";
import initializeSocket from "./socket/socket.io.js";
import "./services/cron.service.js";
import { stripeWebhookHandler } from "./utils/webhook.js";
import {
  autoSubmitExpiredQuizzes,
  checkAndUpdateAllTimeouts,
} from "./services/quiz.service.js";
import { startAwsPullJob } from "./jobs/pullAws.job.js";

const app = express();
const server = http.createServer(app);

app.disable("x-powered-by");

connectDB();
startAwsPullJob();

// ✅ Stripe webhook route must come BEFORE express.json()
app.use(
  "/api/v1/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan("dev"));
app.use(cors({ origin: "*" }));

await autoSubmitExpiredQuizzes();
await checkAndUpdateAllTimeouts();

// =========================
// Phase 1 - New modules
// =========================
app.use("/api/v1/auth", router.authRoute);
app.use("/api/v1/user", router.userRoute);
app.use("/api/v1/medicine-schedule", router.medicineSchedualRoute);
app.use("/api/v1/quiz", router.quizRoute);
app.use("/api/v1/question", router.questionRoute);
app.use("/api/v1/quiz-start", router.resultRoute);
app.use("/api/v1/content-hub", router.contenthubRoute);
app.use("/api/v1/vaccine", router.vaccineRoute);
app.use("/api/v1/vaccine-schedule", router.vaccineScheduleRoute);
app.use("/api/v1/doctor", router.doctorRoute);
app.use("/api/v1/availability", router.availabilityRoute);
app.use("/api/v1/caregiver", router.caregiverRoute);
app.use("/api/v1/caregiver-notes", router.caregivernotesRoute);
app.use("/api/v1/telemedicine", router.telemedicineRoute);
app.use("/api/v1/notifications", router.notificationRoute);
app.use("/api/v1/onboarding", router.onboardingRoute);
app.use("/api/v1/support", router.supportRoute);
app.use("/api/v1/feedback", router.feedbackRoute);
app.use("/api/v1/health-goal", router.healthGoalRoute);
app.use("/api/v1/privacy-and-data", router.privacyAndDataRoute);
app.use("/api/v1/medicine-usage", router.medicineUsageRoute);
app.use("/api/v1/health-score", router.healthScoreRoute);

// =========================
// Phase 1 to 6 - Updates in existing modules
// =========================
app.use("/api/v1/bot", router.healthBotRoute);
app.use("/api/v1/dashboard", router.dashboardRoute);

// =========================
// Phase 1 to 6 - All new modules
// =========================
app.use("/api/v1/supplement", router.supplementRoute);
app.use("/api/v1/enhanced-bot", router.enhancedHealthBotRoute);
app.use("/api/v1/minibot", router.miniBotRoute);
app.use("/api/v1/static-bot", router.staticBotRoute);
app.use("/api/v1/integrations/mailchimp", router.mailchimpRoute);
app.use("/api/v1/ingredients", router.ingredientRoute);
app.use("/api/v1/logs", router.logRoute);
app.use("/api/v1/recommendations", router.recommendationRoute);
app.use("/api/v1/plan-list", router.planListRoute);
app.use("/api/v1/supplement-stack", router.supplementRecommendationStack);
app.use("/api/v1/location", router.locationRoute);
app.use("/api/v1/checkMentalHealth", router.checkMentalHealthRoute);
app.use("/api/v1/stripe", router.stripeRoute);
// app.use("/api/v1/funnel", router.funnelRoute);
// app.use("/api/v1/request", router.requestRoute);

// =========================
// AWS Routes - Phase 1 to 6 (New modules)
// =========================
app.use("/api/v1/aws/dashboard", router.awsdashboardRoute);
app.use("/api/v1/aws/ops", router.opsRoute);
app.use("/api/v1/aws/ingest", router.ingestRoute);
app.use("/api/v1/aws/agent", router.awsagentRoute);
app.use("/api/v1/aws/orch", router.orchRoute);
app.use("/api/v1/disclaimer", router.disclaimerRoute);
app.use("/api/v1/sandbox", router.sandboxsupplementIngestRoute);

// =========================
// Phase 2 - Data scrapping & user-friendly keys
// =========================
app.use("/api/v1/medicine", router.medicineRoute);

// =========================
// New Modules
// =========================
app.use("/api/v1/dailyHealthLog", router.journalingRoute);
app.use("/api/v1/interactions", router.interactionsRoute);

// =========================
// Phase 4 - New module
// =========================
app.use("/api/v1/health-log", router.healthLogRoute);

// =========================
// Admin Routes
// =========================
app.use("/api/v1/admin", router.adminRoute);
app.use("/api/v1/superadmin", router.superadminRoute);

app.get("/", (req, res) =>
  res.status(200).json({
    status: 200,
    message: "Health Compass Production Mode is working fine !",
  })
);

app.all("/api/health-check", (req, res) =>
  res.status(200).json({
    status: 200,
    message: "Working Fine Production..",
  })
);

// Initialize Socket.IO
initializeSocket(server);

// Error handler
app.use(errorHandler);

// Start server
server.listen(config.port, () => {
  console.log(`✅ Server is running at http://localhost:${config.port}`);
  console.log(
    `🌐 If using ngrok, public URL will be: https://ddce28062831.ngrok-free.app`
  );
});

// Catch unhandled errors
process.on("uncaughtException", function (err) {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", function (err) {
  console.error("Unhandled Rejection:", err);
});
