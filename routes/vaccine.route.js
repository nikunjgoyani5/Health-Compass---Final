import express from "express";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import controller from "../controllers/vaccine.controller.js";
import validation from "../validations/vaccine.validation.js";
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

route.post(
  "/",
  verifyToken,
  validate(validation.createVaccine),
  controller.createVaccine
);

route.get("/", verifyToken, controller.getVaccine);

route.patch(
  "/:vaccineId",
  verifyToken,
  validate(validation.updateVaccine),
  controller.updateVaccine
);

route.post(
  "/bulk-import",
  verifyToken,
  upload.single("file"),
  controller.bulkImportVaccines
);

route.post(
  "/template",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.getVaccineTemplate
);

route.post(
  "/import-json",
  verifyToken,
  uploadJson.single("file"),
  controller.importVaccinesFromJSON
);

route.delete(
  "/bulk-delete",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.bulkDeleteVaccines
);

route.delete("/:id", verifyToken, controller.deleteVaccine);

export default route;
