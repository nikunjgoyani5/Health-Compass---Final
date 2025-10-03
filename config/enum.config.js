const nodeEnvEnums = {
  PRODUCTION: "production",
  DEVELOPMENT: "development",
};

const authProviderEnum = {
  GOOGLE: "google",
  EMAIL: "email",
};

const userRoleEnum = {
  USER: "user",
  ADMIN: "admin",
  DOCTOR: "doctor",
  CAREGIVER: "caregiver",
  SUPERADMIN: "superadmin",
};

const socketEventEnums = {
  SEND_MESSAGE: "send_message",
};

const scheduleStatusEnums = {
  TAKEN: "taken",
  MISSED: "missed",
  PENDING: "pending",
};

const progressStatusEnums = {
  COMPLETED: "completed",
  IN_PROGRESS: "in_progress",
  NOT_STARTED: "not_started",
  TIMEOUT: "timeout",
};

const resultStatusEnums = {
  PASSED: "passed",
  FAILED: "failed",
  PENDING: "pending",
  TIMEOUT: "timeout",
};

const contentHubTypeEnums = {
  HEALTH_TIPS: "health_tips",
  LATEST_ARTICLES: "latest_articles",
  COMMUTINY_SUCCESS_STORIES: "community_success_stories",
  FEATURED_VIDEOS: "featured_videos",
  HEALTH_QNA: "health_qna",
};

const requestStatusEnum = {
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  PENDING: "pending",
};

const appointmentTypeEnums = {
  URGENT_CARE: "urgent_care",
  MENTAL_HEALTH: "mental_health",
};

const appointmentStatusEnums = {
  SCHEDULED: "scheduled",
  CONFIRM: "confirm",
  STARTED: "started",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  MISSED: "missed",
};

const doctorAvailabilityEnums = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

const genderEnums = {
  MALE: "Male",
  FEMALE: "Female",
  NON_BINARY: "Non Binary",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

const goalEnums = {
  LOSE_WEIGHT: "Lose Weight",
  MAINTAIN_WEIGHT: "Maintain Weight",
  GAIN_MUSCLE: "Gain Muscle",
  IMPROVE_SLEEP: "Improve Sleep",
  BUILD_IMMUNITY: "Build Immunity",
  STRENGTH_BONES: "Strength Bones",
  BOOST_ENERGY: "Boost Energy",
  MENTAL_CLARITY: "Mental Clarity",
};

const activityLevelEnums = {
  SEDENTARY: "Sedentary",
  LIGHTLY_ACTIVE: "Lightly Active",
  MODERATELY_ACTIVE: "Moderately Active",
  VERY_ACTIVE: "Very Active",
  ATHLETE_EXTRA_ACTIVE: "Athlete / Extra Active",
};

const statusSupportEnum = {
  OPEN: "open",
  CLOSE: "close",
};

const activityCategoryEnum = {
  AUTH: "Auth",
  SUPPLEMENT: "Supplement",
  ADMIN: "Admin",
  DASHBOARD: "Dashboard",
  DOCTOR: "Doctor",
  FEEDBACK: "Feedback",
  HEALTH_GOAL: "Health Goal",
  HEALTH_SCORE: "Health Score",
  INGREDIENT: "Ingredient",
  MEDICINE_USAGES: "Medicine Usages",
  MEDICINE: "Medicine",
  MEDICINE_SCHEDULE: "Medicine Schedule",
  ONBOARDING: "Onboarding",
  PRIVACY_POLICY: "Privacy Policy",
  QUESTION: "Question",
  QUIZ: "Quiz",
  RESULT: "Result",
  STRIPE: "Stripe",
  SUPER_ADMIN: "Superadmin",
  SUPPORT: "Support",
  TELEMEDICINE: "Telemedicine",
  USER: "User",
  VACCINE: "Vaccine",
  VACCINE_SCHEDULE: "Vaccine Schedule",
  SUPPLEMENT_RECOMMENDATION: "Supplement Recommendation",
  WEATHER: "Weather",
};

const activityTypeEnum = {
  REGISTER: "Register",
  LOGIN: "Login",
  VERIFY_OTP: "Verify OTP",
  RESEND_OTP: "Resend OTP",
  GOOGLE_LOGIN: "Google Login",
  APPLE_LOGIN: "Apple Login",
  FORGOT_PASSWORD: "Forgot Password",
  RESET_PASSWORD: "Reset Password",

  ADD_SUPPLEMENT: "Create Supplement",
  UPDATE_SUPPLEMENT: "Update Supplement",
  DELETE_SUPPLEMENT: "Delete Supplement",
  BULK_IMPORT_SUPPLEMENT: "Bulk Import Supplements",
  GET_SINGLE_SUPPLEMENT: "Get Supplement",
  GET_ALL_SUPPLEMENT: "Get Supplements",
  BULK_DELETE_SUPPLEMENT: "Bulk Delete Supplements",
  JSON_IMPORT_SUPPLEMENT: "Import Supplements (JSON)",

  ADMIN: {
    GET_ALL_USER_PROFILE: "Get User Profiles",
    BLOCK_UNBLOCK_USER_PROFILE: "Block / Unblock User",
    GET_MEDICINE_SCHEDULE: "Get Medicine Schedule",
    GET_VACCINE_SCHEDULE: "Get Vaccine Schedule",
    GET_DOCTOR_AVAILABILITIES: "Get Doctor Availabilities",
    GET_TELEMEDICINE: "Get Telemedicine",
    ASSIGN_ROLE: "Assign Role",
    REMOVE_ROLE: "Remove Role",
    GET_MEDICINE_USAGES: "Get Medicine Usages",
    GET_VACCINE_USAGES: "Get Vaccine Usages",
    CREATE_SUPPLEMENT_TAG: "Create Supplement Tag",
    GET_SUPPLEMENT_TAGS: "Get Supplement Tags",
    UPDATE_SUPPLEMENT_TAGS: "Update Supplement Tag",
    DELETE_SUPPLEMENT_TAG: "Delete Supplement Tag",
    GET_FEATURED_FLAGS: "Get Featured Flags",
    UPDATE_FEATURED_FLAG: "Update Featured Flag",
    AVAILABILITY: "Availability",
    UPDATE_AVAILABILITY: "Update Availability",
    CAREGIVER_NOTE: "Caregiver Note",
    CAREGIVER: "Caregiver",
    CONTENT_HUB: "Content Hub",
    GET_DASHBOARD: "Dashboard",
  },

  DOCTOR: {
    CREATE_ACCOUNT: "Create Doctor Account",
    GET_LIST: "Get Doctors",
    UPDATE_ACCOUNT: "Update Doctor Account",
    GET_APPOINTMENT: "Get Appointments",
  },

  FEEDBACK: {
    CREATE: "Create Feedback",
    GET: "Get Feedbacks",
    DELETE: "Delete Feedback",
  },

  HEALTH_GOAL: {
    SAVE: "Save Health Goal",
    GET: "Get Health Goal",
    DELETE: "Delete Health Goal",
  },

  HEALTH_SCORE: {
    ADD: "Add Health Score",
    GET: "Get Health Score",
  },

  INGREDIENT: {
    ADD: "Add Ingredient",
    GET: "Get Ingredient",
    GET_LIST: "Get Ingredients",
    UPDATE: "Update Ingredient",
    DELETE: "Delete Ingredient",
    BULK_IMPORT: "Bulk Import Ingredients",
    BULK_DELETE: "Bulk Delete Ingredients",
    IMPORT_JSON: "Import Ingredients (JSON)",
  },

  MEDICINE_USAGES: "Medicine Usages",

  MEDICINE: {
    ADD: "Add Medicine",
    UPDATE: "Update Medicine",
    DELETE: "Delete Medicine",
    GET: "Get Medicine",
    BULK_IMPORT: "Bulk Import Medicines",
    BULK_DELETE: "Bulk Delete Medicines",
    GET_STOCK: "Get Medicine Stock",
    ADD_QUANTITY: "Add Medicine Quantity",
    IMPORT_JSON: "Import Medicines (JSON)",
  },

  MEDICINE_SCHEDULE: {
    SCHEDULE: "Schedule Medicine",
    GET_LIST: "Get Medicine Schedules",
    UPDATE: "Update Medicine Schedule",
    UPDATE_DOSE: "Update Medicine Dose",
    GET_DOSE_LOGS: "Get Medicine Dose Logs",
    GET_TODAY_DOSE_LOGS: "Get Today's Medicine Doses",
    GET_DOSE_WITH_QUANTITY: "Get Medicine Dose with Quantity",
    ADD_QUANTITY: "Add Medicine Schedule Quantity",
    GET_DOSE_BY_DATE: "Get Medicine Dose by Date",
    SCHEDULE_BY_BOT: "Schedule Medicine (Bot)",
    GET_REPORT: "Medicine Schedule Report",
  },

  ONBOARDING: {
    ENTRY: "Create Onboarding Entry",
    GET: "Get Onboarding",
    UPDATE: "Update Onboarding",
    DETECT_CITY: "Detect User City",
  },

  PRIVACY_POLICY: {
    UPDATE: "Update Privacy Policy",
    GET: "Get Privacy Policy",
  },

  QUESTION: {
    ADD: "Add Question",
    GET: "Get Question",
    UPDATE: "Update Question",
    DELETE: "Delete Question",
  },

  QUIZ: {
    FETCH_STATUS: "Fetch Quiz Status",
    CREATE: "Create Quiz",
    GET: "Get Quiz",
    UPDATE: "Update Quiz",
    DELETE: "Delete Quiz",
  },

  RESULT: {
    SUBMIT_ANSWER: "Submit Answer",
    FETCH: "Get Result",
  },

  STRIPE: {
    CREATE_CHECKOUT_SESSION: "Create Checkout Session",
    SESSION_DETAILS: "Get Session Details",
    GET_SUBSCRIPTION: "Get Subscription",
    CANCEL_SUB: "Cancel Subscription",
    UPDATE_SUB: "Update Subscription",
    REACTIVATE_SUB: "Reactivate Subscription",
  },

  SUPER_ADMIN: {
    FETCH_ADMIN: "Fetch Admin",
    APPROVED_REJECT_ADMIN: "Approve / Reject Admin",
    BLOCK_UNBLOCK_ADMIN: "Block / Unblock Admin",
  },

  SUPPORT: {
    SENT_REQ: "Send Support Request",
    UPDATE_REQ_STATUS: "Update Support Request Status",
    GET: "Get Support Requests",
  },

  TELEMEDICINE: {
    CREATE: "Create Telemedicine",
    GET: "Get Telemedicine",
    GET_DOC_AVAILABILITY: "Get Doctor Availability",
    UPDATE: "Update Telemedicine",
    DELETE: "Delete Telemedicine",
    UPDATE_STATUS: "Update Telemedicine Status",
  },

  USER: {
    GET_PROFILE: "Get Profile",
    DELETE_ACCOUNT: "Delete Account",
    UPDATE: "Update Profile",
    VERIFY_2_FA_OTP: "Verify 2FA OTP",
    ENABLE_2_FA: "Enable 2FA",
    DISABLE_2_FA: "Disable 2FA",
    REGENERATE_RECOVERY_CODE: "Regenerate Recovery Code",
    CHANGE_PASS: "Change Password",
    UPDATE_ROLE: "Update Role",
    UPDATE_FCM_TOKEN: "Update FCM Token",
    UPDATE_ACTIVITY_STATUS: "Update Activity Status",
    GET: "Get Users",
    SET_PASS: "Set Password",
    GET_NOTI_PREF: "Get Notification Preferences",
    UPDATE_NOTI_PREF: "Update Notification Preferences",
  },

  VACCINE: {
    CREATE: "Create Vaccine",
    GET: "Get Vaccine",
    UPDATE: "Update Vaccine",
    DELETE: "Delete Vaccine",
    BULK_IMPORT: "Bulk Import Vaccines",
    BULK_DELETE: "Bulk Delete Vaccines",
    IMPORT_JSON: "Import Vaccines (JSON)",
  },

  VACCINE_SCHEDULE: {
    SCHEDULE: "Create Vaccine Schedule",
    SCHEDULE_BY_BOT: "Create Vaccine Schedule (Bot)",
    GET: "Get Vaccine Schedule",
    UPDATE: "Update Vaccine Schedule",
    DELETE: "Delete Vaccine Schedule",
    UPDATE_STATUS: "Update Vaccine Schedule Status",
  },

  SUPPLEMENT_RECOMMENDATION: {
    GET: "Get Supplement Recommendations",
    ANALYTICS: "Supplement Analytics",
  },

  SUPPLEMENT: {
    GET_ALL_SUPPLEMENT_FILTERS: "Get All Supplement Filters",
    SUGGESTION_LOG: "Supplement Suggestion Log",
  },
};

const medicineScheduleStatus = {
  ACTIVE: "active",
  PAUSE: "pause",
  ENDED: "ended",
  INACTIVE: "inactive",
};

const feedbackTagEnums = {
  BUG: "bug",
  REQUEST: "request",
  OTHER: "other",
};

const superadminApproveStatusEnum = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const mediaTypeStatusEnum = {
  IMAGE: "image",
  VIDEO: "video",
  FILE: "file",
  AUDIO: "audio",
};

const notificationPreferencesEnum = {
  MEDICATIONS: "medications",
  WATER_INTAKE: "waterIntake",
  EXERCISE: "exercise",
  OTHER: "other",
};

const preferedNotificationMethods = {
  PUSH: "push",
  EMAIL: "email",
  SMS: "sms",
};

const notificationFrequencyEnum = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
};

const reasonForAppointmentEnums = {
  GENERAL_CHECKUP: "general_checkup",
  EMERGENCY: "emergency",
  CONSULTATION: "consultation",
  OTHER: "other",
};

const activityStatusEnum = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  SUCCESS: "success",
  FAILED: "failed",
};

const subscriptionPlanEnum = {
  WEEKLY: "weekly",
  YEARLY: "yearly",
  MONTHLY: "monthly",
  LIFETIME: "lifetime",
};

const priceIdToPlan = {
  // local
  price_1Ro14oGhoBwNfpLsXyqy4tmX: subscriptionPlanEnum.WEEKLY,
  price_1RnfbNGhoBwNfpLs8mf4C5s9: subscriptionPlanEnum.MONTHLY,
  price_1Ro16ZGhoBwNfpLsBDTmdPFu: subscriptionPlanEnum.YEARLY,
  price_1Ro17yGhoBwNfpLsviHBp1TX: subscriptionPlanEnum.LIFETIME,

  // live
  price_1Ro14oGhoBwNfpLsXyqy4tmX: subscriptionPlanEnum.WEEKLY,
  price_1RnfbNGhoBwNfpLs8mf4C5s9: subscriptionPlanEnum.MONTHLY,
  price_1Ro16ZGhoBwNfpLsBDTmdPFu: subscriptionPlanEnum.YEARLY,
  price_1Ro17yGhoBwNfpLsviHBp1TX: subscriptionPlanEnum.LIFETIME,
};

const subscriptionPaymentStatusEnum = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
  REFUNDED: "refunded",
};

const stripePaymentStatusEnum = {
  PENDING: "pending",
  COMPLETED: "completed",
  FAILED: "failed",
};

const accessControllerEnum = {
  public: "public",
  premium: "premium",
};

const subscriptionTypeEnum = {
  FREE: "free",
  PREMIUM: "premium",
  PROMO_CODE: "promo_code",
};

const revenueCatEventType = {
  INITIAL_PURCHASE: "initial_purchase",
  RENEWAL: "renewal",
  CANCELLATION: "cancellation",
  EXPIRATION: "expiration",
  BILLING_ISSUE: "billing_issue",
};

const recommendationQueryLog = {
  USAGE_GROUP: "usage_group",
  DESCRIPTION_SEARCH: "description_search",
  CLAIMS_BASED: "claims_based",
  RELATED_INGREDIENTS: "related_ingredients",
  TAG_BASED: "tag_based",
};

const intervalEnum = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
};

const discountTypeEnum = {
  PERCENTAGE: "percentage",
  FLAT: "flat",
};

const subscriptionStatusEnum = {
  ACTIVE: "active",
  TRIALING: "trialing",
  CANCELED: "canceled",
  EXPIRED: "expired",
  PAST_DUE: "past_due",
};

const paymentStatusEnum = {
  PENDING: "pending",
  PAID: "paid",
  REQUIRES_ACTION: "requires_action",
  CANCELED: "canceled",
  FAILED: "failed",
  EXPIRED: "expired",
};

const healthEffectTypeEnum = {
  POSITIVE: "positive",
  NEGATIVE: "negative",
  NEUTRAL: "neutral",
};

const mailchimpEventStatusEnum = {
  SUBSCRIBED: "subscribed",
  FAILED: "failed",
  UNSUBSCRIBE: "unsubscribe",
  CLEANED: "cleaned",
  PROFILE: "profile",
};

const supplementRecommendationLogEnums = {
  SUGGESTED: "suggested",
  DISLIKED: "disliked",
  ADDED: "added",
  LIST_SUGGESTED: "list_suggested",
};

const confidenceLabelEnums = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const recommendationTagEnums = {
  AI_SELECTED: "AI Selected",
  SMART_SUGGESTION: "Smart Suggestion",
};

const perspectiveEnums = {
  BALANCED: "Balanced",
  SECULAR: "Secular",
  SPIRITUAL: "Spiritual",
};

const interactionItemTypeEnums = {
  MEDICINE: "medicine",
  SUPPLEMENT: "supplement",
};

const severityLevelEnums = {
  MINOR: "Minor",
  MODERATE: "Moderate",
  SEVERE: "Severe",
};

const interactionSourceEnums = {
  AI: "ai",
  MANUAL: "Manual",
  VERIFIED: "Verified",
};

const intersactionDefaultEnums = {
  EXPLANATION:
    "A potential interaction could not be determined confidently. Consult your healthcare provider.",
  AI_DISCLAIMER:
    "This information was generated by AI and is for informational purposes only.",
  ROOT_DISCLAIMER:
    "These results are for informational purposes only. Always consult your healthcare provider.",
};

const deviceTypeEnum = {
  APPLE_WATCH: "Apple Watch",
  SAMSUNG: "Samsung",
  OTHER: "Other",
};

export default {
  nodeEnvEnums,
  authProviderEnum,
  userRoleEnum,
  socketEventEnums,
  scheduleStatusEnums,
  progressStatusEnums,
  resultStatusEnums,
  contentHubTypeEnums,
  requestStatusEnum,
  appointmentTypeEnums,
  appointmentStatusEnums,
  doctorAvailabilityEnums,
  genderEnums,
  goalEnums,
  activityLevelEnums,
  statusSupportEnum,
  activityCategoryEnum,
  activityTypeEnum,
  medicineScheduleStatus,
  feedbackTagEnums,
  superadminApproveStatusEnum,
  mediaTypeStatusEnum,
  notificationPreferencesEnum,
  preferedNotificationMethods,
  notificationFrequencyEnum,
  reasonForAppointmentEnums,
  activityStatusEnum,
  subscriptionPlanEnum,
  subscriptionPaymentStatusEnum,
  stripePaymentStatusEnum,
  accessControllerEnum,
  subscriptionTypeEnum,
  revenueCatEventType,
  priceIdToPlan,
  recommendationQueryLog,
  intervalEnum,
  subscriptionStatusEnum,
  paymentStatusEnum,
  healthEffectTypeEnum,
  mailchimpEventStatusEnum,
  supplementRecommendationLogEnums,
  discountTypeEnum,
  recommendationTagEnums,
  confidenceLabelEnums,
  perspectiveEnums,
  interactionItemTypeEnums,
  severityLevelEnums,
  interactionSourceEnums,
  intersactionDefaultEnums,
  deviceTypeEnum,
};
