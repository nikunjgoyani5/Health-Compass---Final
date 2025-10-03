import express from "express";
import userController from "../controllers/user.controller.js";
import validate from "../middleware/validate.middleware.js";
import userValidation from "../validations/user.validation.js";
import { verifyToken } from "../middleware/verify-token.middleware.js";
import multer from "multer";
import { checkPermission } from "../middleware/verify-role.middleware.js";
import enumConfig from "../config/enum.config.js";
import weatherController from "../controllers/weather.controller.js";

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const route = express.Router();

// ---------------------------------------------- Profile Management For Users ----------------------------------------------

route.get("/profile", verifyToken, userController.getUserProfile);
route.put(
  "/profile",
  verifyToken,
  upload.single("profileImage"),
  validate(userValidation.updateUserProfile),
  userController.updateUserProfile
);
route.put(
  "/change-password",
  verifyToken,
  validate(userValidation.changePassword),
  userController.changePassword
);
route.delete(
  "/delete-account",
  verifyToken,
  validate(userValidation.deleteUserAccountValidation),
  userController.deleteAccount
);
route.patch(
  "/fcm-token",
  verifyToken,
  validate(userValidation.updateUserFCMToken),
  userController.updateUserFCMToken
);

route.patch(
  "/set-password",
  verifyToken,
  validate(userValidation.setPasswordValidation),
  userController.setPassword
);

// ---------------------------------------------- User Management For Admins ----------------------------------------------
route.get(
  "/list",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  userController.getUserListByAdmin
);
route.patch(
  "/:id/role",
  verifyToken,
  checkPermission([
    enumConfig.userRoleEnum.ADMIN,
    enumConfig.userRoleEnum.SUPERADMIN,
  ]),
  validate(userValidation.updateRole),
  userController.updateRole
);
route.patch(
  "/:userId/active-status",
  verifyToken,
  checkPermission([enumConfig.userRoleEnum.ADMIN]),
  validate(userValidation.updateUserActiveStatus),
  userController.updateUserActiveStatus
);

// ---------------------------------------------- 2Fa Authentication ----------------------------------------------

route.get("/enable-2fa", verifyToken, userController.enable2fa);
route.get("/disable-2fa", verifyToken, userController.disable2fa);
route.patch(
  "/regenerate-recovery-code",
  verifyToken,
  userController.regenerateRecoveryCode
);
route.post(
  "/verify-2fa-otp",
  verifyToken,
  validate(userValidation.verify2faOtp),
  userController.verify2faOtp
);

// ---------------------------------------------- Notification Preferences By User And Admin ----------------------------------------------

route.get(
  "/get-notification-preferences",
  verifyToken,
  userController.getnotificationPreferences
);
route.patch(
  "/notification-preferences",
  verifyToken,
  validate(userValidation.notificationPreferencesValidation),
  userController.updatenotificationPreferences
);

// ----------------- Get current weather -----------------
route.get(
  "/get-current-weather",
  verifyToken,
  validate(userValidation.getCurrentWeather),
  weatherController.getCurrentWeather
);

export default route;
