import express from "express";
import controller from "../controllers/ingredient.controller.js";
import validation from "../validations/ingredient.validation.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import validate from "../middleware/validate.middleware.js";
import multer from "multer";
import path from "path";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname);
  if (ext !== ".csv" && ext !== ".xls" && ext !== ".xlsx") {
    return cb(new Error("Only CSV, XLS, and XLSX files are allowed"), false);
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter });
const uploadJson = multer({ dest: "uploads/" });

const route = express.Router();

route.get("/list", verifyToken, controller.getallIngredients);
route.get("/:id", verifyToken, controller.getIngredientsById);

route.post(
  "/add",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(validation.createIngredient),
  controller.createIngredient
);

route.put(
  "/update/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(validation.updateIngredient),
  controller.updateIngredient
);

route.delete(
  "/delete/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.deleteIngredient
);

route.post(
  "/bulk-import",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  upload.single("file"),
  controller.bulkImportIngredients
);

route.post(
  "/template",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getIngredientTemplate
);

route.post(
  "/import-json",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  uploadJson.single("file"),
  controller.importIngredientFromJSON
);

route.delete(
  "/bulk-delete",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.bulkDeleteIngredient
);

export default route;
