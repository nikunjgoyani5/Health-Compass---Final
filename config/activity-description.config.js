const activityDescriptions = {
  // ---------- auth activities ----------
  LOGIN: {
    USER_NOT_FOUND:
      "Login attempt failed: No account found for the provided email address.",
    ACCOUNT_BLOCKED:
      "Login attempt blocked: User account is blocked by an admin.",
    ADMIN_REJECTED_BY_SUPERADMIN:
      "Login denied: Admin account rejected by superadmin.",
    ADMIN_PENDING_APPROVAL:
      "Login failed: Awaiting superadmin approval for admin access.",
    EMAIL_NOT_VERIFIED:
      "Login failed: User has not verified their email address via OTP.",
    GOOGLE_USER: "Login failed: User registered via Google OAuth.",
    INVALID_PASSWORD: "Login failed: Incorrect password entered by user.",
    SUCCESS: "Login successful: User logged in using email and password.",
    SERVER_ERROR:
      "Login error: Internal server error occurred during login process.",
  },

  OTP: {
    RESEND_SUCCESS: "OTP resent successfully to the user's email.",
    RESEND_USER_NOT_FOUND: "OTP resend failed: User not found.",
    VERIFY_SUCCESS: "OTP verified successfully.",
    VERIFY_FAILED_EXPIRED: "OTP verification failed: OTP expired.",
    VERIFY_FAILED_INVALID: "OTP verification failed: Incorrect OTP.",
    VERIFY_USER_NOT_FOUND: "OTP verification failed: User not found.",
    VERIFY_SUCCESS_ADMIN_APPROVAL_PENDING:
      "OTP verified successfully, but admin approval is pending.",
  },

  REGISTER: {
    VERIFIED_ALREADY: "User tried to register with an already verified email.",
    UNVERIFIED_RETRY:
      "User re-initiated registration with an existing but unverified email.",
    SUCCESS: "User registered successfully via email.",
  },

  FORGOT_PASSWORD: {
    USER_NOT_FOUND:
      "Forgot password failed: No verified user found with this email.",
    ACCOUNT_BLOCKED: "Forgot password failed: Account is blocked by admin.",
    OTP_SENT_SUCCESS: "Forgot password OTP sent successfully to user's email.",
    SERVER_ERROR: "Forgot password failed: Internal server error occurred.",
  },

  RESET_PASSWORD: {
    USER_NOT_FOUND:
      "Reset password failed: No user found with the provided email.",
    OTP_NOT_VERIFIED: "Reset password blocked: User has not verified OTP.",
    ACCOUNT_BLOCKED: "Reset password failed: Account is blocked by admin.",
    SUCCESS: "Password reset successful.",
    SERVER_ERROR: "Reset password failed: Internal server error occurred.",
  },

  GOOGLE_LOGIN: {
    NEW_USER_CREATED: "Google login: New user registered via Google account.",
    USER_CONVERTED_FROM_EMAIL:
      "Google login: Existing email-based user converted to Google account.",
    USER_PROFILE_UPDATED:
      "Google login: Existing Google user logged in, profile updated.",
    SUCCESS: "Google login successful.",
    FAILED: "Google login failed: Invalid or expired Firebase token.",
  },

  APPLE_LOGIN: {
    NEW_USER_CREATED: "Apple login: New user registered via Apple account.",
    USER_CONVERTED_FROM_EMAIL:
      "Apple login: Existing email-based user converted to Apple account.",
    USER_PROFILE_UPDATED:
      "Apple login: Existing Apple user logged in, profile updated.",
    SUCCESS: "Apple login successful.",
    FAILED: "Apple login failed: Invalid or expired Firebase token.",
  },

  // ---------- supplement activities ----------
  SUPPLEMENT: {
    ADD_SUCCESS: "Supplement added successfully.",
    UPDATE_SUCCESS: "Supplement updated successfully.",
    DELETE_SUCCESS: "Supplement deleted successfully.",
    BULK_IMPORT_SUCCESS: "Bulk import of supplements completed successfully.",
    BULK_DELETE_SUCCESS: "Bulk deletion of supplements completed successfully.",
    FETCH_ALL_SUCCESS: "Fetched all supplements successfully.",
    FETCH_SINGLE_SUCCESS: "Fetched single supplement details successfully.",
    STOCK_STATUS_FETCHED: "Fetched stock status of supplements successfully.",
    JSON_IMPORT_SUCCESS: "JSON import of supplements completed successfully.",
  },

  // ---------- admin activities ----------
  ADMIN: {
    SUCCESS: {
      GET_ALL_USER_PROFILE: "success.",
      GET_MEDICINE_SCHEDULE: "Filtered medicine schedules fetched successfully",
      GET_VACCINE_SCHEDULE: "Vaccine schedules fetched successfully.",
      GET_VACCINE_SCHEDULE: "Vaccine schedules fetched successfully.",
      GET_DOCTOR_AVAILABILITIES: "Doctor availabilities fetched successfully.",
      GET_TELEMEDICINE: "Telemedicine appointments fetched successfully.",
      CREATE_SUPPLEMENT_TAG: "Supplement tag created successfully.",
      GET_SUPPLEMENT_TAGS: "Supplement tags fetch successfully.",
      UPDATE_SUPPLEMENT_TAGS: "Supplement tags update successfully.",
      DELETE_SUPPLEMENT_TAG: "Supplement tag delete successfully.",
      GET_FEATURED_FLAGS: "Feature flags fetched successfully.",
      UPDATE_FEATURED_FLAG: "Feature flags updated successfully.",
      AVAILABILITY: "Doctor Availability fetch successfully.",
      UPDATE_AVAILABILITY: "Doctor Availability updated successfully.",
      ADD_CAREGIVER_NOTE: "Caregiver note added successfully.",
      GET_CAREGIVER_NOTE: "Caregiver notes fetched successfully.",
      IS_SENT_CAREGIVER_NOTE:
        "Notes you sent as a caregiver fetched successfully.",
      GET_CAREGIVER: "Caregivers fetched successfully.",
      I_CARE_FOR: "Users you care for fetched successfully.",
      GET_CONTENT_HUB: "Content fetched successfully.",
      ADD_CONTENT_HUB: "Content hub created successfully.",
      UPDATE_CONTENT_HUB: "Content updated successfully.",
      DELETE_CONTENT_HUB: "Content and associated files deleted successfully.",
    },
  },

  // ---------- doctor activities ----------
  DOCTOR: {
    CREATE_ACCOUNT:
      "Doctor account created successfully. Login credentials have been sent to the registered email.",
    GET_LIST: "Doctor detail fetched successfully.",
    UPDATE_ACCOUNT: "Doctor detail updated successfully.",
    GET_APPOINTMENT: "Appointments fetched successfully.",
  },

  // ---------- feedback activities ----------
  FEEDBACK: {
    CREATE:
      "Your feedback has been submitted successfully. Thank you for your contribution.",
    GET: "Feedback fetched successfully.",
    DELETE: "Feedback deleted successfully.",
  },

  // ---------- health goal activities ----------
  HEALTH_GOAL: {
    SAVE: "Health goal saved successfully.",
    GET: "Health goal fetched successfully.",
  },

  // ---------- health score activities ----------
  HEALTH_SCORE: {
    ADD: "Health score added successfully.",
    GET: "Health scores retrieved successfully.",
  },

  // ---------- ingredient activities ----------
  INGREDIENT: {
    ADD: "Ingredient created successfully.",
    GET: "Ingredients fetched successfully.",
    UPDATE: "Ingredient updated successfully.",
    DELETE: "Ingredient deleted successfully.",
  },

  // ---------- medicine activities ----------
  MEDICINE: {
    ADD: "medicine added successfully.",
    UPDATE: "Medicine updated successfully.",
    DELETE: "Medicine deleted successfully.",
    GET: "Medicine fetched successfully.",
    GET_STOCK: "Medicine stock fetched successfully.",
    ADD_QUANTITY: "Quantity added successfully.",
  },

  // ---------- medicine schedule activities ----------
  MEDICINE_SCHEDULE: {
    SCHEDULE: "Medicine schedule successfully.",
    GET_LIST: "Medicine schedule list fetch successfully.",
    UPDATE: "Medicine schedule is updated successfully.",
    UPDATE_DOSE: "Medicine schedule's dose is updated successfully.",
    GET_DOSE_LOGS: "Medicine schedule's dose logs is fetch successfully.",
    GET_DOSE_WITH_QUANTITY: "Doses fetch successfully.",
    ADD_QUANTITY: "Quantity added successfully.",
    GET_DOSE_BY_DATE: "Medicine doses is fetched by date.",
    SCHEDULE_BY_BOT: "Medicine is schedule by bot successfully.",
  },

  // ---------- onboarding activities ----------
  ONBOARDING: {
    ENTRY: "Onboarding entry created successfully.",
    GET: "Onboarding entry fetched successfully.",
    UPDATE: "Onboarding entry updated successfully.",
    DETECT_CITY: "City detected successfully from coordinates.",
  },

  // ---------- privacy-policy activities ----------
  PRIVACY_POLICY: {
    UPDATE: "Privacy setting updated successfully.",
    GET: "Privacy policy list fetch successfully.",
  },

  // ---------- question activities ----------
  QUESTION: {
    ADD: "Question added successfully.",
    GET: "Questions fetch successfully.",
    UPDATE: "Question updated successfully.",
    DELETE: "Question deleted successfully.",
  },

  // ---------- quiz activities ----------
  QUIZ: {
    FETCH_STATUS: "Quiz status fetched successfully.",
    CREATE: "Quiz created successfully.",
    GET: "Quiz fetch successfully.",
    UPDATE: "Quiz updated successfully.",
    DELETE: "Quiz deleted successfully.",
  },

  // ---------- result activities ----------
  RESULT: {
    SUBMIT_ANSWER: "Answer submitted successfully.",
    FETCH: "Result fetch successfully.",
  },

  // ---------- stripe activities ----------
  STRIPE: {
    CREATE_CHECKOUT_SESSION: "Checkout session created successfully.",
    SESSION_DETAILS: "Checkout session details retrieved successfully.",
    GET_SUBSCRIPTION: "Subscription details retrieved successfully.",
    CANCEL_SUB: "Subscription will be canceled at period end.",
    UPDATE_SUB: "Subscription plan updated successfully.",
    REACTIVATE_SUB: "Subscription reactivated successfully.",
  },

  // ---------- super-admin activities ----------
  SUPER_ADMIN: {
    FETCH_ADMIN: "Admins fetched successfully.",
  },

  // ---------- support request activities ----------
  SUPPORT: {
    SENT_REQ: "Support request sent successfully!",
    UPDATE_REQ_STATUS: "Request status updated successfully.",
    GET: "Support requests fetched successfully.",
  },

  // ---------- telemedicine activities ----------
  TELEMEDICINE: {
    CREATE: "Telemedicine appointment created successfully.",
    GET: "Telemedicine detail fetched successfully.",
    UPDATE: "Telemedicine status updated successfully.",
    DELETE: "Telemedicine deleted successfully.",
    UPDATE_STATUS: "Telemedicine status updated successfully",
  },

  // ---------- user activities ----------
  USER: {
    GET_PROFILE: "User profile fetched successfully.",
    UPDATE_PROFILE: "User profile updated successfully.",
    DELETE_ACCOUNT: "User permanently deleted successfully.",
    ENABLE_2_FA: "Two factor authenticate enable successfully.",
    DISABLE_2_FA: "Two factor authenticate disable successfully",
    REGENERATE_RECOVERY_CODE: "Regenerate Recovery Code successfully.",
    UPDATE_FCM_TOKEN: "User fcm token updated successfully.",
    GET: "User list fetched successfully.",
    SET_PASS: "Password set successfully.",
    GET_NOTI_PREF: "Notification preferences fetched successfully.",
    UPDATE_NOTI_PREF: "Notification preferences updated successfully.",
  },

  // ---------- vaccine activities ----------
  VACCINE: {
    CREATE: "Vaccine created successfully.",
    GET: "Vaccine fetched successfully.",
    UPDATE: "Vaccine updated successfully.",
    DELETE: "Vaccine deleted successfully.",
    IMPORT_JSON: "Vaccines imported successfully.",
  },

  // ---------- vaccine schedule activities ----------
  VACCINE_SCHEDULE: {
    SCHEDULE: "Vaccine schedule successfully.",
    GET: "Vaccine schedule retrieved successfully.",
    UPDATE_STATUS: "Vaccine schedule status updated successfully.",
    DELETE: "Vaccine schedule deleted successfully.",
    UPDATE: "Vaccine schedule updated successfully.",
  },
};

export default activityDescriptions;
