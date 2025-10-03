import express from "express";
import multer from "multer";
import validate from "../middleware/validate.middleware.js";
import validation from "../validations/contenthub.validation.js";
import controller from "../controllers/contenthub.controller.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";

const route = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

route.post(
  "/",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  upload.any(),
  // validate(validation.createContentHubValidation),
  controller.createContentHub
);

route.get("/", verifyToken, controller.getContent);

route.patch(
  "/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  upload.any(),
  controller.updateContentHub
);

route.delete(
  "/:id",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  controller.deleteRecord
);

route.post("/:postId/like", verifyToken, controller.toggleLike);
route.get("/liked-posts", verifyToken, controller.getUserLikedPosts);

export default route;
