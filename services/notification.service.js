import userFirebaseApp from "../firebase/user.config.firebase.js";
import Notification from "../models/notification.model.js";
import UserModel from "../models/user.model.js";

const removeInvalidTokenFromDB = async (token) => {
  try {
    const result = await UserModel.updateMany(
      { fcmToken: token },
      { $set: { fcmToken: null } }
    );

    if (result.modifiedCount > 0) {
      console.log(
        `✅ Removed invalid FCM token from ${result.modifiedCount} user(s): ${token}`
      );
    } else {
      console.log(`⚠️ No user found with FCM token: ${token}`);
    }
  } catch (err) {
    console.error("Error removing invalid FCM token:", err);
  }
};

// -------- Send notification using firebase -----------
export const sendFCMNotification = async ({ token, title, message, image }) => {
  try {
    if (!userFirebaseApp) {
      console.warn("Firebase not available, skipping FCM notification");
      return { success: false, message: "Firebase not available" };
    }

    if (!token) {
      console.warn("No FCM token provided, skipping FCM notification");
      return { success: false, message: "No FCM token provided" };
    }

    const messagePayload = {
      token,
      notification: { title, body: message, image },
      webpush: {
        headers: { Urgency: "high" },
        notification: { icon: image },
      },
    };

    const response = await userFirebaseApp.messaging().send(messagePayload);
    return { success: true, response };
  } catch (error) {
    console.error("FCM Notification Error:", error);

    // ✅ Handle expired/invalid token
    if (
      error.errorInfo?.code === "messaging/registration-token-not-registered"
    ) {
      // remove this token from your DB
      console.warn(`Invalid FCM token detected: ${token}`);
      await removeInvalidTokenFromDB(token); // implement this function
    }

    return { success: false, message: error.message };
  }
};

export const sendPushNotificationAndSave = async ({
  user,
  message,
  title,
  type,
  image,
}) => {
  await sendFCMNotification({
    token: user?.fcmToken,
    title,
    message,
    image,
  });

  const notificationData = {
    title,
    message,
    type,
    actionUrl: "https://health-compass-60829.web.app/#/dashboard",
    image,
    isRead: false,
    createdAt: new Date(),
  };

  let userNotification = await Notification.findOne({
    userId: user._id || user,
  });

  console.log("Notification sent to user:", user._id);

  if (userNotification) {
    userNotification.notifications.push(notificationData);
    await userNotification.save();
  } else {
    await Notification.create({
      userId: user._id || user,
      notifications: [notificationData],
    });
  }
};
