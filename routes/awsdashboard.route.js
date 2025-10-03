import { Router } from "express";
import { getDashboardV1 } from "../controllers/awsdashboard.controller.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const r = Router();

// Dashboard v1 - Only Super Admin can access
r.get(
  "/v1", 
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.SUPERADMIN]),
  getDashboardV1
);

export default r;
