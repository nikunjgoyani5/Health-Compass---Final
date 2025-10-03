import Joi from "joi";
import enumConfig from "../config/enum.config.js";

const updateUserProfile = {
  body: Joi.object().keys({
    fullName: Joi.string().min(1).max(100).label("Full Name"),
    profileImage: Joi.string().allow(null, "").label("Profile Image"),
    phoneNumber: Joi.string().label("Phone Number"),
    countryCode: Joi.string().allow(null, "").label("Country Code"),
    gender: Joi.string()
      .valid(...Object.values(enumConfig.genderEnums))
      .allow(null, "")
      .label("Gender"),
    age: Joi.number().label("Age"),
    weight: Joi.number().label("Weight"),
    height: Joi.number().label("Height"),
    heightUnit: Joi.string().label("Height Unit"),
    weightUnit: Joi.string().label("Weight Unit"),
    goal: Joi.string().label("Goals"),
    activityLevel: Joi.string()
      .valid(...Object.values(enumConfig.activityLevelEnums))
      .label("Activity Level"),
  }),
};

const updateRole = {
  body: Joi.object().keys({
    role: Joi.array().items(
      Joi.string()
        .valid(...Object.values(enumConfig.userRoleEnum))
        .label("Role")
    ),
  }),
};

const deleteUserAccountValidation = {
  body: Joi.object().keys({
    isPermanentlyDelete: Joi.boolean().required().label("Permanently Delete"),
  }),
};

const changePassword = {
  body: Joi.object().keys({
    oldPassword: Joi.string().required().label("Old Password").messages({
      "any.required": "Old password is required",
      "string.empty": "Old password cannot be empty",
    }),
    newPassword: Joi.string().required().label("New Password").messages({
      "any.required": "New password is required",
      "string.empty": "New password cannot be empty",
    }),
    conformNewPassword: Joi.string()
      .valid(Joi.ref("newPassword"))
      .required()
      .label("Confirm New Password")
      .messages({
        "any.only": "Confirm password must match the new password",
        "any.required": "Confirm password is required",
        "string.empty": "Confirm password cannot be empty",
      }),
  }),
};

const verify2faOtp = {
  body: Joi.object().keys({
    otp: Joi.number().strict().required().label("OTP"),
  }),
};

const updateUserFCMToken = {
  body: Joi.object().keys({
    fcmToken: Joi.string().required().label("FCM Token"),
  }),
};

const blockAndUnblockUser = {
  body: Joi.object().keys({
    isBlocked: Joi.boolean().required().label("Is Blocked"),
  }),
};

const updateUserActiveStatus = {
  body: Joi.object().keys({
    is_active: Joi.boolean().required().label("Is Active"),
  }),
};

const approveAndRejectValidation = {
  body: Joi.object().keys({
    registerAdminId: Joi.string().required().label("Register Admin ID"),
    status: Joi.string()
      .valid(...Object.values(enumConfig.superadminApproveStatusEnum))
      .required()
      .label("Status"),
  }),
};

const blockAndUnblockAdminValidation = {
  body: Joi.object().keys({
    adminId: Joi.string().required().label("Admin ID"),
    isBlocked: Joi.boolean().required().label("Is Blocked"),
    blockedBy: Joi.string().label("Blocked By"),
  }),
};

const notificationPreferencesValidation = {
  body: Joi.object({
    preferences: Joi.object({
      medications: Joi.object({
        push: Joi.boolean().required().label("Medications Push"),
        email: Joi.boolean().required().label("Medications Email"),
        sms: Joi.boolean().required().label("Medications SMS"),
      })
        .required()
        .label("Medications"),
      waterIntake: Joi.object({
        push: Joi.boolean().required().label("Water Intake Push"),
        email: Joi.boolean().required().label("Water Intake Email"),
        sms: Joi.boolean().required().label("Water Intake SMS"),
      })
        .required()
        .label("Water Intake"),
      exercise: Joi.object({
        push: Joi.boolean().required().label("Exercise Push"),
        email: Joi.boolean().required().label("Exercise Email"),
        sms: Joi.boolean().required().label("Exercise SMS"),
      })
        .required()
        .label("Exercise"),
      other: Joi.object({
        push: Joi.boolean().required().label("Other Push"),
        email: Joi.boolean().required().label("Other Email"),
        sms: Joi.boolean().required().label("Other SMS"),
      })
        .required()
        .label("Other"),
    })
      .required()
      .label("Preferences"),
    reminderFrequency: Joi.string()
      .valid(...Object.values(enumConfig.notificationFrequencyEnum))
      .required()
      .label("Reminder Frequency"),
  }),
};

const setPasswordValidation = {
  body: Joi.object({
    password: Joi.string().required().label("Password"),
    confirmPassword: Joi.string()
      .valid(Joi.ref("password"))
      .required()
      .label("Confirm Password"),
  }),
};

const assignRoleToUser = {
  body: Joi.object({
    userId: Joi.string().required().label("User ID"),
    role: Joi.string()
      .valid(...Object.values({ USER: "user", DOCTOR: "doctor" }))
      .required()
      .label("Role"),
  }),
};

const removeRoleFromUser = {
  body: Joi.object({
    userId: Joi.string().required().label("User ID"),
    role: Joi.string()
      .valid(...Object.values({ USER: "user", DOCTOR: "doctor" }))
      .required()
      .label("Role"),
  }),
};

const getCurrentWeather = {
  body: Joi.object({
    city: Joi.string().required().label("City"),
    // lat: Joi.string().required().label("Lat"),
    // lon: Joi.string().required().label("Lon"),
  }),
};

const blockUnblockCaregiverByAdmin = {
  body: Joi.object({
    caregiverId: Joi.string().required().label("Caregiver ID"),
    is_caregiver_block: Joi.boolean().required().label("Is Caregiver Block"),
  }),
};

export default {
  updateUserProfile,
  deleteUserAccountValidation,
  changePassword,
  updateRole,
  verify2faOtp,
  updateUserFCMToken,
  blockAndUnblockUser,
  updateUserActiveStatus,
  approveAndRejectValidation,
  blockAndUnblockAdminValidation,
  setPasswordValidation,
  assignRoleToUser,
  removeRoleFromUser,
  notificationPreferencesValidation,
  setPasswordValidation,
  getCurrentWeather,
  blockUnblockCaregiverByAdmin,
};
