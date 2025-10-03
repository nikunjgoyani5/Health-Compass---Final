import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";
import controller from "../controllers/log.controller.js";

const route = express.Router();

route.get(
  "/activity-log",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getActivityByAdmin
);

route.get(
  "/get-ai-query-logs",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getAiLogs
);

route.get(
  "/get-supplement-view-logs",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getViewLogs
);

route.get(
  "/queries/export-ai-query-logs",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.exportAiQueryLogsCSV
);

route.get(
  "/views/export-supplement-view-logs",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.exportAllSupplementViewLogsCSV
);

route.get(
  "/activity/export",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.exportAllActivityLogsCSV
);

route.get("/categories", controller.getActivityCategoryFilter);

export default route;
