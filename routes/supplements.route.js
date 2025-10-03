import multer from "multer";
import express from "express";
import supplementController from "../controllers/supplements.controller.js";
import supplementValidation from "../validations/supplements.validation.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import validate from "../middleware/validate.middleware.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";
import { routeAccessControl } from "../middleware/access.control.middleware.js";
import rateLimiter from "../middleware/rateLimiter.js";
import supplementService from "../services/supplement.service.js";
import { createMulterUpload } from "../helper/common.helper.js";

const uploadJson = multer({ dest: "uploads/" });

const route = express.Router();
const csvUpload = createMulterUpload([".csv", ".xls", ".xlsx"]);
const imageUpload = createMulterUpload([".jpg", ".jpeg", ".png", ".gif"]);

route.get(
  "/list",
  rateLimiter,
  routeAccessControl([enumConfig.accessControllerEnum.premium]),
  supplementController.getAllSupplements
);

route.get(
  "/filters",
  verifyToken,
  supplementController.getAllSupplementFilters
);

route.get("/:id", verifyToken, supplementController.getSingleSupplement);

route.post(
  "/add",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  imageUpload.single("image"),
  supplementService.parseMultipartArrays,
  validate(supplementValidation.addNewSupplementValidation),
  supplementController.createSupplement
);

route.put(
  "/update/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  imageUpload.single("image"),
  supplementService.parseMultipartArrays,
  validate(supplementValidation.updateSupplementValidation),
  supplementController.updateSupplement
);

route.delete(
  "/delete/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  supplementController.deleteSupplement
);

route.post(
  "/bulk-import",
  verifyToken,
  csvUpload.single("file"),
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  supplementController.bulkImportSupplements
);

route.post(
  "/template",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  supplementController.getSupplementTemplate
);

route.post(
  "/import-json",
  verifyToken,
  uploadJson.single("file"),
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  supplementController.importSupplementFromJSON
);

route.delete(
  "/bulk-delete",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  supplementController.bulkDeleteSupplements
);

export default route;
