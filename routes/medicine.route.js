import express from "express";
import medicineController from "../controllers/medicine.controller.js";
import medicineValidation from "../validations/medicine.validation.js";
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

route.get("/list", verifyToken, medicineController.getAllMedicines);
route.get(
  "/stock-status",
  verifyToken,
  medicineController.getMedicineStockStatus
);

route.post(
  "/add",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.ADMIN,
    enumConfig.userRoleEnum.USER,
  ]),
  validate(medicineValidation.addNewMedicineValidation),
  medicineController.createMedicine
);

route.put(
  "/update/:id",
  verifyToken,
  validate(medicineValidation.updateMedicineValidation),
  medicineController.updateMedicine
);

route.delete("/delete/:id", verifyToken, medicineController.deleteMedicine);

route.get("/:id", verifyToken, medicineController.getSingleMedicine);

route.post(
  "/bulk-import",
  verifyToken,
  upload.single("file"),
  medicineController.bulkImportMedicines
);

route.post(
  "/template",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  medicineController.getMedicineTemplate
);

route.delete(
  "/bulk-delete",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  medicineController.bulkDeleteMedicines
);

route.patch(
  "/add/:id/quantity",
  verifyToken,
  validate(medicineValidation.addQuantityValidation),
  medicineController.addQuantityToMedicine
);

route.post(
  "/import-json",
  verifyToken,
  uploadJson.single("file"),
  medicineController.importMedicineFromJSON
);

export default route;
