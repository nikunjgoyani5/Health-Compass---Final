import bcrypt from "bcrypt";
import { apiResponse } from "../helper/api-response.helper.js";
import enums from "../config/enum.config.js";
import config from "../config/config.js";
import helper from "../helper/common.helper.js";
import { StatusCodes } from "http-status-codes";
import userService from "../services/user.service.js";
import emailService from "../services/email.service.js";
import jwt from "jsonwebtoken";
import userFirebaseApp from "../firebase/user.config.firebase.js";
import adminFirebaseApp from "../firebase/admin.config.firebase.js";
import axios from "axios";
import activityLogService from "../services/activity-log.service.js";
import enumConfig from "../config/enum.config.js";
import UserModel from "../models/user.model.js";
import activityDescriptions from "../config/activity-description.config.js";
import Onboarding from "../models/onboarding.model.js";

// -----------------------------
// Auth & User Management Controller
// Handles user registration, login (Email/Google/Apple), OTP verification, password management, token validation
// -----------------------------

// -----------------------------
// Verify Token
// -----------------------------
// Simple endpoint to check if the JWT token is valid and the session is active
const verifyToken = async (req, res) => {
  try {
    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      message: "Token is verify successfully.",
      status: true,
      data: null,
    });
  } catch (error) {
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error while verifying token.",
      status: false,
      data: null,
    });
  }
};

// -----------------------------
// Email Registration
// -----------------------------
// Registers a user using email and password. Handles new registration or OTP resend for unverified users
const registerByEmail = async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    const role = req.body.role || ["user"];

    // ✅ Check only by email (not role)
    let user = await userService.findOne({ email, is_deleted: false }, true);

    const { otp, otpExpiresAt } = helper.generateOTP();

    if (user) {
      // ✅ If already verified -> block registration
      if (user.is_verified) {
        // Parallel: Activity log + Response
        await Promise.all([
          activityLogService.createActivity({
            userId: user._id,
            userRole: Array.isArray(user.role) ? user.role : [user.role],
            activityType: enumConfig.activityTypeEnum.REGISTER,
            activityCategory: enumConfig.activityCategoryEnum.AUTH,
            description: activityDescriptions.REGISTER.VERIFIED_ALREADY,
            status: enumConfig.activityStatusEnum.FAILED,
          }),
        ]);

        return apiResponse({
          res,
          status: false,
          message:
            "This email is already registered and verified. Please login instead.",
          statusCode: StatusCodes.BAD_REQUEST,
          data: null,
        });
      } else {
        // ✅ If unverified, resend OTP and update user
        const hashPassword = await bcrypt.hash(password, 10);

        // Parallel: Email, User update, Activity log
        await Promise.all([
          emailService.sendOTPEmail({
            email,
            otp,
            otpExpiresAt,
            fullName: fullName || user.fullName,
          }),
          userService.update(user._id, {
            fullName: fullName || user.fullName,
            password: hashPassword,
            otp,
            otpExpiresAt,
            role,
          }),
          activityLogService.createActivity({
            userId: user._id,
            userRole: Array.isArray(user.role) ? user.role : [user.role],
            activityType: enumConfig.activityTypeEnum.REGISTER,
            activityCategory: enumConfig.activityCategoryEnum.AUTH,
            description: activityDescriptions.REGISTER.UNVERIFIED_RETRY,
            status: enumConfig.activityStatusEnum.SUCCESS,
          }),
        ]);
      }
    } else {
      // ✅ Create new user
      const hashPassword = await bcrypt.hash(password, 10);
      const inviteCode = await helper.generateInviteCode();
      const newUser = {
        email,
        password: hashPassword,
        provider: enums.authProviderEnum.EMAIL,
        otp,
        otpExpiresAt,
        fullName,
        inviteCode,
        is_verified: false,
        role, // Always set role (either body role or default USER)
      };

      // Parallel: Email send + User creation
      const [createdUser] = await Promise.all([
        userService.create(newUser),
        emailService.sendOTPEmail({ email, otp, otpExpiresAt, fullName }),
      ]);

      // Activity log after user creation
      await activityLogService.createActivity({
        userId: createdUser._id,
        userRole: Array.isArray(createdUser.role)
          ? createdUser.role
          : [createdUser.role],
        activityType: enumConfig.activityTypeEnum.REGISTER,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.REGISTER.SUCCESS,
        status: enumConfig.activityStatusEnum.SUCCESS,
      });
    }

    return apiResponse({
      res,
      statusCode: StatusCodes.CREATED,
      status: true,
      message:
        "Registration successful! Check your email for the verification OTP.",
      data: null,
    });
  } catch (error) {
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error during registration. Please try again.",
      data: null,
    });
  }
};

// -----------------------------
// Verify Email OTP
// -----------------------------
// Handles the verification of the OTP sent to the user's email address
const verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp, role: bodyRole } = req.body;

    const role = bodyRole || enumConfig.userRoleEnum.USER;

    // ✅ User find with email + role
    let user = await userService.findOne({ email, role, is_deleted: false });

    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "Invalid email or user does not exist",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }

    const userRoles = Array.isArray(user.role) ? user.role : [user.role];
    const currentTime = new Date();

    // Early validation checks
    if (user.otpExpiresAt && user.otpExpiresAt < currentTime) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: userRoles,
        activityType: enumConfig.activityTypeEnum.VERIFY_OTP,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.OTP.VERIFY_FAILED_EXPIRED,
        status: enumConfig.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        message: "OTP has expired. Please request a new one.",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }

    if (user.otp !== otp) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: userRoles,
        activityType: enumConfig.activityTypeEnum.VERIFY_OTP,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.OTP.VERIFY_FAILED_INVALID,
        status: enumConfig.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        message: "Incorrect OTP. Please try again.",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }

    // Update user and prepare response data
    const [updatedUser, token] = await Promise.all([
      userService.update(
        { email, role, is_deleted: false },
        {
          otp: null,
          otpExpiresAt: null,
          is_verified: true,
          is_active: true,
          otpVerified: true,
        }
      ),
      helper.generateToken({ userId: user._id }),
    ]);

    const filteredUser = helper.filteredUser(updatedUser);

    const isAdmin = updatedUser.role?.includes(enumConfig.userRoleEnum.ADMIN);
    const isPending =
      updatedUser.superadminApproveStatus ===
      enumConfig.superadminApproveStatusEnum.PENDING;

    if (isAdmin && isPending) {
      await activityLogService.createActivity({
        userId: updatedUser._id,
        userRole: userRoles,
        activityType: enumConfig.activityTypeEnum.VERIFY_OTP,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description:
          activityDescriptions.OTP.VERIFY_SUCCESS_ADMIN_APPROVAL_PENDING,
        status: enumConfig.activityStatusEnum.SUCCESS,
      });

      return apiResponse({
        res,
        statusCode: StatusCodes.OK,
        status: true,
        message: "OTP verified successfully! Please wait for admin approval.",
        data: { user: filteredUser },
      });
    }

    // Success case - parallel activity log
    await activityLogService.createActivity({
      userId: updatedUser._id,
      userRole: userRoles,
      activityType: enumConfig.activityTypeEnum.VERIFY_OTP,
      activityCategory: enumConfig.activityCategoryEnum.AUTH,
      description: activityDescriptions.OTP.VERIFY_SUCCESS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "OTP verified successfully!",
      data: { token, user: filteredUser },
    });
  } catch (error) {
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error",
      data: null,
    });
  }
};

// -----------------------------
// Resend Email OTP
// -----------------------------
// Resend OTP to the user's email for verification
const resendEmailOtp = async (req, res) => {
  try {
    const { email, role: bodyRole } = req.body;

    const role = bodyRole || enumConfig.userRoleEnum.USER;

    // ✅ User find with email + role
    let user = await userService.findOne({ email, role, is_deleted: false });

    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "Invalid email or user does not exist",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }

    const { otp, otpExpiresAt } = helper.generateOTP();
    const userRoles = Array.isArray(user.role) ? user.role : [user.role];

    // Parallel: Email send + User update + Activity log
    await Promise.all([
      emailService.sendOTPEmail({
        email,
        otp,
        otpExpiresAt,
        fullName: user.fullName,
      }),
      userService.update(
        { email, role, is_deleted: false },
        { otp, otpExpiresAt }
      ),
      activityLogService.createActivity({
        userId: user._id,
        userRole: userRoles,
        activityType: enumConfig.activityTypeEnum.RESEND_OTP,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.OTP.RESEND_SUCCESS,
        status: enumConfig.activityStatusEnum.SUCCESS,
      }),
    ]);

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "OTP has been resent to your email successfully.",
      data: null,
    });
  } catch (error) {
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error while resending OTP.",
      data: null,
    });
  }
};

// -----------------------------
// Login via Email
// -----------------------------
// Authenticates a user using email and password
const loginByEmail = async (req, res) => {
  let user = null;
  try {
    const { email, password } = req.body;
    const role = req.body.role || ["user"];

    user = await userService.findOne({ email, is_deleted: false });

    if (!user) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Email not found or account does not exist.",
      });
    }

    const dbRoles = Array.isArray(user.role) ? user.role : [user.role];
    const requestedRoles = role;
    const selectedRole = requestedRoles[0];

    // ✅ Optimized role validation
    const isTryingAdmin = requestedRoles.includes(
      enumConfig.userRoleEnum.ADMIN
    );
    const isSuperAdminUser = dbRoles.includes(
      enumConfig.userRoleEnum.SUPERADMIN
    );
    const isDefaultUserRole =
      requestedRoles.length === 1 &&
      selectedRole === enumConfig.userRoleEnum.USER;
    const isDoctorUser = dbRoles.includes(enumConfig.userRoleEnum.DOCTOR);

    const isRoleValid =
      requestedRoles.some((r) => dbRoles.includes(r)) || // normal case
      (isTryingAdmin && isSuperAdminUser) || // superadmin -> admin
      (isDefaultUserRole && isDoctorUser); // doctor -> default user

    if (!isRoleValid) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid email or user does not exist",
      });
    }

    const isAdmin = selectedRole === enumConfig.userRoleEnum.ADMIN;

    // Early validation checks
    if (user.isBlocked) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: dbRoles,
        activityType: enumConfig.activityTypeEnum.LOGIN,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.LOGIN.ACCOUNT_BLOCKED,
        status: enumConfig.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Your account has been blocked by the admin.",
      });
    }

    // Superadmin approval checks (only for admins)
    if (
      isAdmin &&
      user.superadminApproveStatus ===
        enumConfig.superadminApproveStatusEnum.REJECTED
    ) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: dbRoles,
        activityType: enumConfig.activityTypeEnum.LOGIN,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.LOGIN.ADMIN_REJECTED_BY_SUPERADMIN,
        status: enumConfig.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message:
          "Login rejected. Your admin account has been declined by the owner.",
      });
    }

    if (
      isAdmin &&
      user.superadminApproveStatus !==
        enumConfig.superadminApproveStatusEnum.APPROVED
    ) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: dbRoles,
        activityType: enumConfig.activityTypeEnum.LOGIN,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.LOGIN.ADMIN_PENDING_APPROVAL,
        status: enumConfig.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.FORBIDDEN,
        message:
          "Your admin account is pending approval. You will receive an email once approved.",
      });
    }

    if (!user.is_verified) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: dbRoles,
        activityType: enumConfig.activityTypeEnum.LOGIN,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.LOGIN.EMAIL_NOT_VERIFIED,
        status: enumConfig.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Please verify your email via OTP before logging in.",
      });
    }

    if (!user.password) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: dbRoles,
        activityType: enumConfig.activityTypeEnum.LOGIN,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.LOGIN.GOOGLE_USER,
        status: enumConfig.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        message: "This account uses Google login. Please use Google sign-in.",
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: dbRoles,
        activityType: enumConfig.activityTypeEnum.LOGIN,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.LOGIN.INVALID_PASSWORD,
        status: enumConfig.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.UNAUTHORIZED,
        message: "Incorrect password. Please try again.",
      });
    }

    // Successful login - parallel operations
    const expiresIn = isAdmin ? "24h" : "30d";

    const [token, hasOnboarding] = await Promise.all([
      helper.generateToken({ userId: user._id }, expiresIn),
      Onboarding.exists({ userId: user._id }),
    ]);

    // Update user provider info
    user.provider = enumConfig.authProviderEnum.EMAIL;
    user.providerId = null;
    await user.save();

    const filteredUser = helper.filteredUser(user);

    // Activity log after successful operations
    await activityLogService.createActivity({
      userId: user._id,
      userRole: dbRoles,
      activityType: enumConfig.activityTypeEnum.LOGIN,
      activityCategory: enumConfig.activityCategoryEnum.AUTH,
      description: activityDescriptions.LOGIN.SUCCESS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Login successful!",
      data: {
        token,
        user: { ...filteredUser, isOnboarded: !!hasOnboarding },
      },
    });
  } catch (error) {
    console.log(error);

    // Create user activity log for login failure
    await activityLogService.createActivity({
      userId: user?._id,
      userRole: user
        ? Array.isArray(user.role)
          ? user.role
          : [user.role]
        : [],
      activityType: enumConfig.activityTypeEnum.LOGIN,
      activityCategory: enumConfig.activityCategoryEnum.AUTH,
      description: activityDescriptions.LOGIN.SERVER_ERROR,
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error during login. Please try again later.",
      data: null,
    });
  }
};

// -----------------------------
// Forgot Password
// -----------------------------
// Sends OTP to user's email for password reset
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const role = req.body.role || ["user"];

    let user = await userService.findOne({ email, is_deleted: false });

    if (!user) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Email not found or account does not exist.",
      });
    }

    const dbRoles = Array.isArray(user.role) ? user.role : [user.role];

    // ✅ validate body role against DB role
    if (!role.some((r) => dbRoles.includes(r))) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Email not found or account does not exist.",
      });
    }

    if (user.is_verified === false) {
      return apiResponse({
        res,
        status: false,
        message: "User account not verified. Please verify your account.",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }

    if (user.isBlocked) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: dbRoles,
        activityType: enumConfig.activityTypeEnum.FORGOT_PASSWORD,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.FORGOT_PASSWORD.ACCOUNT_BLOCKED,
        status: enumConfig.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        message: "Account blocked by admin. Cannot reset password.",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }

    const { otp, otpExpiresAt } = helper.generateOTP();

    // Parallel: Email send + User update + Activity log
    await Promise.all([
      emailService.sendOTPEmail({ email, otp, fullName: user.fullName }),
      userService.update(user._id, { otp, otpExpiresAt }),
      activityLogService.createActivity({
        userId: user._id,
        userRole: dbRoles,
        activityType: enumConfig.activityTypeEnum.FORGOT_PASSWORD,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.FORGOT_PASSWORD.OTP_SENT_SUCCESS,
        status: enumConfig.activityStatusEnum.SUCCESS,
      }),
    ]);

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "OTP has been sent to your email successfully!",
      data: null,
    });
  } catch (error) {
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Internal server error. Please try again later.",
      data: null,
    });
  }
};

// -----------------------------
// Reset Password
// -----------------------------
// Resets password after OTP verification
const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const role = req.body.role || ["user"];

    let user = await userService.findOne({ email, is_deleted: false });

    if (!user) {
      return apiResponse({
        res,
        status: false,
        message: "User not found",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }

    const dbRoles = Array.isArray(user.role) ? user.role : [user.role];

    // ✅ validate body role against DB role
    if (!role.some((r) => dbRoles.includes(r))) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Invalid email or user does not exist",
      });
    }

    if (!user.otpVerified) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: dbRoles,
        activityType: enumConfig.activityTypeEnum.RESET_PASSWORD,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.RESET_PASSWORD.OTP_NOT_VERIFIED,
        status: enumConfig.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        message: "Please verify OTP before resetting password",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }

    if (user.isBlocked) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: dbRoles,
        activityType: enumConfig.activityTypeEnum.RESET_PASSWORD,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.RESET_PASSWORD.ACCOUNT_BLOCKED,
        status: enumConfig.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        message: "Account blocked by admin. Cannot reset password.",
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
      });
    }

    const hashPassword = await bcrypt.hash(newPassword, 10);

    // Parallel: User update + Activity log
    await Promise.all([
      userService.update(
        { _id: user._id },
        { password: hashPassword, otpVerified: false }
      ),
      activityLogService.createActivity({
        userId: user._id,
        userRole: dbRoles,
        activityType: enumConfig.activityTypeEnum.RESET_PASSWORD,
        activityCategory: enumConfig.activityCategoryEnum.AUTH,
        description: activityDescriptions.RESET_PASSWORD.SUCCESS,
        status: enumConfig.activityStatusEnum.SUCCESS,
      }),
    ]);

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Password reset successfully!",
      data: null,
    });
  } catch (error) {
    console.error("Error in resetPassword:", error);

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message:
        "Internal server error during password reset. Please try again later.",
      data: null,
    });
  }
};

// -----------------------------
// reCAPTCHA Verification
// -----------------------------
// Verifies the reCAPTCHA token provided by the client to ensure the user is human
const verifyRecaptcha = async (req, res) => {
  try {
    const { token } = req.body;

    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      new URLSearchParams({
        secret: config.google.recaptcha_secret_key,
        response: token,
      })
    );

    if (response.data.success) {
      return apiResponse({
        res,
        status: true,
        statusCode: StatusCodes.OK,
        message: "reCAPTCHA verified successfully",
        data: null,
      });
    } else {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "reCAPTCHA verification failed. Please provide a valid token.",
        data: null,
      });
    }
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message:
        "Internal server error while verifying reCAPTCHA. Please try again later.",
    });
  }
};

// -----------------------------
// Google Login/Registration
// -----------------------------
// Handles user login or registration using Google authentication
const loginByGoogle = async (req, res) => {
  try {
    const { token, role } = req.body;

    let decodedToken;

    try {
      // ✅ Role based verification
      if (Array.isArray(role) && role.includes(enumConfig.userRoleEnum.ADMIN)) {
        decodedToken = await adminFirebaseApp.auth().verifyIdToken(token);
        console.log("✅ Token verified by Admin Firebase");
      } else {
        decodedToken = await userFirebaseApp.auth().verifyIdToken(token);
        console.log("✅ Token verified by User Firebase");
      }
    } catch (err) {
      console.warn("⚠️ Primary verification failed, trying fallback...");
      // 🔄 Fallback logic
      try {
        decodedToken = await userFirebaseApp.auth().verifyIdToken(token);
        console.log("✅ Fallback verified by User Firebase");
      } catch {
        decodedToken = await adminFirebaseApp.auth().verifyIdToken(token);
        console.log("✅ Fallback verified by Admin Firebase");
      }
    }

    const { name, email, picture, uid: providerId } = decodedToken;

    // 👇 Find user
    let user = await UserModel.findOne({ email, is_deleted: false });

    if (!user) {
      // Create new user
      const newUser = {
        fullName: name,
        email,
        profileImage: picture || null,
        provider: enums.authProviderEnum.GOOGLE,
        providerId,
        is_verified: true,
        is_active: true,
        role,
        inviteCode: await helper.generateInviteCode(),
      };

      user = await userService.create(newUser);

      await activityLogService.createActivity({
        userId: user._id,
        userRole: [],
        activityType: enums.activityTypeEnum.GOOGLE_LOGIN,
        activityCategory: enums.activityCategoryEnum.AUTH,
        description: activityDescriptions.GOOGLE_LOGIN.NEW_USER_CREATED,
        status: enums.activityStatusEnum.SUCCESS,
      });
    }

    // ✅ Role-based admin check (same as loginByEmail)
    const isAdmin =
      (Array.isArray(role) && role.includes(enumConfig.userRoleEnum.ADMIN)) ||
      (Array.isArray(user.role) &&
        user.role.includes(enumConfig.userRoleEnum.ADMIN));

    // Blocked by admin
    if (user.isBlocked) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: Array.isArray(user.role) ? user.role : [user.role],
        activityType: enums.activityTypeEnum.GOOGLE_LOGIN,
        activityCategory: enums.activityCategoryEnum.AUTH,
        description: activityDescriptions.LOGIN.ACCOUNT_BLOCKED,
        status: enums.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.OK,
        message: "Your account has been blocked by the admin.",
      });
    }

    // Superadmin rejection
    if (
      isAdmin &&
      user.superadminApproveStatus ===
        enumConfig.superadminApproveStatusEnum.REJECTED
    ) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: Array.isArray(user.role) ? user.role : [user.role],
        activityType: enums.activityTypeEnum.GOOGLE_LOGIN,
        activityCategory: enums.activityCategoryEnum.AUTH,
        description: activityDescriptions.LOGIN.ADMIN_REJECTED_BY_SUPERADMIN,
        status: enums.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.OK,
        message: "Login failed! Your account has been rejected by the admin.",
      });
    }

    // Superadmin pending approval
    if (
      isAdmin &&
      user.superadminApproveStatus !==
        enumConfig.superadminApproveStatusEnum.APPROVED
    ) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: Array.isArray(user.role) ? user.role : [user.role],
        activityType: enums.activityTypeEnum.GOOGLE_LOGIN,
        activityCategory: enums.activityCategoryEnum.AUTH,
        description: activityDescriptions.LOGIN.ADMIN_PENDING_APPROVAL,
        status: enums.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.OK,
        message: "Please wait for approval. You'll be notified once approved.",
      });
    }

    // Not verified via OTP
    if (!user.is_verified) {
      await activityLogService.createActivity({
        userId: user._id,
        userRole: Array.isArray(user.role) ? user.role : [user.role],
        activityType: enums.activityTypeEnum.GOOGLE_LOGIN,
        activityCategory: enums.activityCategoryEnum.AUTH,
        description: activityDescriptions.LOGIN.EMAIL_NOT_VERIFIED,
        status: enums.activityStatusEnum.FAILED,
      });

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Please verify OTP to activate your account.",
      });
    }

    // Existing user update
    if (user.provider === enums.authProviderEnum.EMAIL) {
      await userService.update(
        { email },
        { provider: enums.authProviderEnum.GOOGLE, providerId }
      );
    } else {
      user = await userService.update(
        { email },
        {
          profileImage: picture || user.profileImage,
          provider: enums.authProviderEnum.GOOGLE,
          providerId,
        }
      );
    }

    // ✅ JWT expiry (admin = 24h, others = 7d)
    const expiresIn = isAdmin ? "24h" : "7d";

    // Parallel: Token generation + Onboarding check
    const [jwtToken, hasOnboarding] = await Promise.all([
      new Promise((resolve) => {
        const token = jwt.sign(
          { userId: user._id, email: user.email },
          config.jwt.secretKey,
          { expiresIn }
        );
        resolve(token);
      }),
      Onboarding.exists({ userId: user._id }),
    ]);

    const filteredUser = helper.filteredUser(user);

    // Success log
    await activityLogService.createActivity({
      userId: user._id,
      userRole: Array.isArray(user.role) ? user.role : [user.role],
      activityType: enums.activityTypeEnum.GOOGLE_LOGIN,
      activityCategory: enums.activityCategoryEnum.AUTH,
      description: activityDescriptions.GOOGLE_LOGIN.SUCCESS,
      status: enums.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Google login successful.",
      data: {
        token: jwtToken,
        user: { ...filteredUser, isOnboarded: !!hasOnboarding },
      },
    });
  } catch (error) {
    console.error("❌ Error during Google login:", error);
    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Google login failed. Please try again.",
      data: null,
    });
  }
};

// -----------------------------
// Apple Login/Registration
// -----------------------------
// Handles user login or registration using Apple authentication
const loginByApple = async (req, res) => {
  try {
    const { token, role } = req.body;

    // Validate token format
    if (!token || typeof token !== "string") {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message: "Invalid Apple ID token provided.",
        data: null,
      });
    }

    // Direct JWT decode without Firebase verification
    const decodedToken = jwt.decode(token);

    if (!decodedToken) {
      return apiResponse({
        res,
        statusCode: StatusCodes.BAD_REQUEST,
        status: false,
        message: "Invalid Apple ID token format.",
        data: null,
      });
    }

    const { email, uid: providerId } = decodedToken;

    let user = await userService.findOne({ email, isDeleted: false });

    if (!user) {
      const generatedEmail = email || `${providerId}@appleid.com`;

      const newUser = {
        email: generatedEmail,
        provider: enums.authProviderEnum.APPLE,
        providerId,
        isVerified: true,
        role: role || [enums.userRoleEnum.USER],
      };

      user = await userService.create(newUser);
    } else {
      await userService.update(
        { email },
        {
          provider: enums.authProviderEnum.APPLE,
          providerId,
        }
      );
    }

    // Check if user is deleted
    // if (user.is_deleted) {
    //   return apiResponse({
    //     res,
    //     statusCode: StatusCodes.FORBIDDEN,
    //     status: false,
    //     message: "Your account has been deleted. Please contact support.",
    //   });
    // }

    // Check if user is approved (for admin/superadmin roles)
    const isAdmin =
      (role && role.includes(enums.userRoleEnum.ADMIN)) ||
      (role && role.includes(enums.userRoleEnum.SUPERADMIN));

    if (isAdmin && user.status !== enums.userStatusEnum.APPROVED) {
      return apiResponse({
        res,
        statusCode: StatusCodes.FORBIDDEN,
        status: false,
        message:
          "Please wait for approval. You'll receive an email once approved.",
      });
    }

    // For Apple login, auto-verify the user (like Google login)
    if (!user.is_verified) {
      await userService.update({ email }, { is_verified: true });
      user.is_verified = true;
    }

    // Existing user update
    if (user.provider === enums.authProviderEnum.EMAIL) {
      await userService.update(
        { email },
        { provider: enums.authProviderEnum.APPLE, providerId }
      );
    } else {
      user = await userService.update(
        { email },
        {
          provider: enums.authProviderEnum.APPLE,
          providerId,
        }
      );
    }

    // ✅ JWT expiry (admin = 24h, others = 7d)
    const expiresIn = isAdmin ? "24h" : "7d";

    // Parallel: Token generation + Onboarding check
    const [jwtToken, hasOnboarding] = await Promise.all([
      new Promise((resolve) => {
        const token = jwt.sign(
          { userId: user._id, email: user.email },
          config.jwt.secretKey,
          { expiresIn }
        );
        resolve(token);
      }),
      Onboarding.exists({ userId: user._id }),
    ]);

    const filteredUser = helper.filteredUser(user);

    // Success log
    await activityLogService.createActivity({
      userId: user._id,
      userRole: Array.isArray(user.role) ? user.role : [user.role],
      activityType: enums.activityTypeEnum.APPLE_LOGIN,
      activityCategory: enums.activityCategoryEnum.AUTH,
      description: activityDescriptions.APPLE_LOGIN.SUCCESS,
      status: enums.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      message: "Apple login successful.",
      data: {
        token: jwtToken,
        user: { ...filteredUser, isOnboarded: !!hasOnboarding },
      },
    });
  } catch (error) {
    console.error("Error during Apple login:", error);

    return apiResponse({
      res,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      status: false,
      message: "Apple login failed. Please try again.",
      data: null,
    });
  }
};

export default {
  verifyToken,
  registerByEmail,
  loginByEmail,
  forgotPassword,
  verifyEmailOtp,
  resendEmailOtp,
  verifyToken,
  resetPassword,
  loginByGoogle,
  verifyRecaptcha,
  loginByApple,
};
