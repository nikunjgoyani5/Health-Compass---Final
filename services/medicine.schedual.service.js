import moment from "moment";
import MedicineScheduleModel from "../models/medicine.schedual.model.js";
import enumConfig from "../config/enum.config.js";
import UserModel from "../models/user.model.js";
import { sendPushNotificationAndSave } from "./notification.service.js";
import smsService from "./sms.service.js";
import emailService from "./email.service.js";

// Update missed doses service
export const updateMissedMedicineDoses = async () => {
  const now = moment();
  const todayDate = now.format("YYYY-MM-DD");

  const schedules = await MedicineScheduleModel.find(
    { status: enumConfig.medicineScheduleStatus.ACTIVE },
    null,
    {
      skipHook: true,
    }
  );

  for (let schedule of schedules) {
    const startDate = moment(schedule.startDate).format("YYYY-MM-DD");
    const endDate = moment(schedule.endDate).format("YYYY-MM-DD");

    if (
      moment(todayDate).isBefore(startDate) ||
      moment(todayDate).isAfter(endDate)
    ) {
      continue;
    }

    const todayLogIndex = schedule.doseLogs.findIndex(
      (log) => moment(log.date).format("YYYY-MM-DD") === todayDate
    );

    if (todayLogIndex === -1) continue;

    const todayLog = schedule.doseLogs[todayLogIndex];

    let updated = false;

    for (let dose of todayLog.doses) {
      const doseTime = moment(dose.time, ["hh:mm A"]);
      const fullDoseTime = moment(todayDate)
        .hour(doseTime.hour())
        .minute(doseTime.minute());

      if (
        dose.status === enumConfig.scheduleStatusEnums.PENDING &&
        now.isAfter(fullDoseTime)
      ) {
        dose.status = enumConfig.scheduleStatusEnums.MISSED;
        updated = true;
      }
    }

    if (updated) {
      schedule.markModified("doseLogs");
      await schedule.save();

      const userId = schedule.userId;
      const user = await UserModel.findById(userId).select(
        "fullName fcmToken profileImage phoneNumber email notificationPreferences countryCode"
      );

      const medicineData = await MedicineScheduleModel.findById(
        schedule._id
      ).populate("medicineName", "medicineName");

      const medicineName =
        medicineData?.medicineName?.medicineName || "Medicine";

      const missedMessage = `Reminder: You have missed your dose of ${medicineName} scheduled for today. Please follow up as recommended.`;

      const missedTimes = todayLog.doses
        .filter((dose) => dose.status === enumConfig.scheduleStatusEnums.MISSED)
        .map((dose) => dose.time);

      const type = enumConfig.notificationPreferencesEnum.OTHER;
      const preferences =
        user?.notificationPreferences?.preferences?.[type] || {};

      // 1. Push Notification (check if push preference is true)
      if (preferences.push) {
        await sendPushNotificationAndSave({
          user,
          message: missedMessage,
          title: "Missed Medicine Alert 🚨",
          type,
          image: user?.profileImage,
        });
      }

      // 2. Email Notification (check if email preference is true)
      if (preferences.email) {
        await emailService.missedMedicineAlertEmail({
          email: user.email,
          fullName: user.fullName,
          medicineName: medicineName,
          scheduledTime: missedTimes.join(", "),
        });
      }

      // 3. SMS Notification (check if sms preference is true)
      if (preferences.sms) {
        await smsService.sendSMS({
          to: `${user.countryCode}${user.phoneNumber}`,
          message: missedMessage,
        });
      }
    }
  }

  return true;
};

// Medicine reminder notification service
export const sendDoseReminderNotifications = async () => {
  const now = moment();
  const todayDate = now.format("YYYY-MM-DD");

  const schedules = await MedicineScheduleModel.find(
    { status: enumConfig.medicineScheduleStatus.ACTIVE },
    null,
    { skipHook: true }
  );

  for (let schedule of schedules) {
    if (
      now.isBefore(moment(schedule.startDate)) ||
      now.isAfter(moment(schedule.endDate))
    )
      continue;

    const todayLog = schedule.doseLogs.find(
      (log) => moment(log.date).format("YYYY-MM-DD") === todayDate
    );

    if (!todayLog) continue;

    const userId = schedule.userId;
    const user = await UserModel.findById(userId).select(
      "fullName fcmToken profileImage phoneNumber email notificationPreferences"
    );

    if (!user || !user.fcmToken) continue;

    const medicine = await MedicineScheduleModel.findById(
      schedule._id
    ).populate("medicineName", "medicineName");

    let isAnyReminderSent = false;

    for (let dose of todayLog.doses) {
      if (dose.status !== enumConfig.scheduleStatusEnums.PENDING) continue;
      if (dose.isReminderSent) continue;

      // Combine today's date and dose time
      const fullDoseTime = moment(
        `${todayDate} ${dose.time}`,
        "YYYY-MM-DD hh:mm A"
      );

      const reminderTime = fullDoseTime.clone().subtract(5, "minutes");

      // Check if now is exactly at reminder time (±30 seconds for safety)
      const diffInSeconds = now.diff(reminderTime, "seconds");

      if (diffInSeconds >= 0 && diffInSeconds <= 60) {
        const medicineName = medicine.medicineName?.medicineName || "Medicine";
        const message = `⏰ It's time to take your medicine: ${medicineName}. Stay healthy!`;

        const type = enumConfig.notificationPreferencesEnum.OTHER;
        const preferences =
          user?.notificationPreferences?.preferences?.[type] || {};
        const reminderFrequency =
          user?.notificationPreferences?.reminderFrequency ||
          enumConfig.notificationFrequencyEnum.DAILY;

        const shouldSendReminder = (() => {
          const now = moment();

          switch (reminderFrequency) {
            case enumConfig.notificationFrequencyEnum.DAILY:
              return true;

            case enumConfig.notificationFrequencyEnum.WEEKLY:
              return now.day() === moment(dose.date).day(); // 0 (Sunday) - 6 (Saturday)

            case enumConfig.notificationFrequencyEnum.MONTHLY:
              return now.date() === moment(dose.date).date();

            default:
              return true;
          }
        })();

        if (shouldSendReminder) {
          // 1. Push Notification
          if (preferences.push) {
            await sendPushNotificationAndSave({
              user,
              message,
              title: "Medicine Reminder ⏰",
              type,
              image: user?.profileImage,
            });
          }

          // 2. Email Notification
          if (preferences.email) {
            await emailService.medicineReminderEmail({
              email: user.email,
              fullName: user.fullName,
              medicineName,
              scheduledTime: dose.time,
            });
          }

          // 3. SMS Notification
          if (preferences.sms) {
            await smsService.sendSMS({
              to: `${user.countryCode}${user.phoneNumber}`,
              message,
            });
          }
        }

        dose.isReminderSent = true;
        isAnyReminderSent = true;
      }
    }

    if (isAnyReminderSent) {
      schedule.markModified("doseLogs");
      await schedule.save();
    }
  }
};
