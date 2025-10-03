import moment from "moment";
import enumConfig from "../config/enum.config.js";
import VaccineSchedule from "../models/vaccine.schedule.model.js";
import { sendPushNotificationAndSave } from "./notification.service.js";
import UserModel from "../models/user.model.js";
import VaccineModel from "../models/vaccine.model.js";
import emailService from "./email.service.js";
import smsService from "./sms.service.js";

export const checkAndUpdateMissedVaccineSchedules = async () => {
  try {
    const allVaccines = await VaccineSchedule.find({}, null, {
      skipHook: true,
    });

    for (const vaccine of allVaccines) {
      let isModified = false;

      if (
        vaccine.scheduleStatus === enumConfig.scheduleStatusEnums.PENDING &&
        vaccine.date &&
        vaccine.doseTime
      ) {
        const scheduleDateTime = moment(
          `${moment(vaccine.date).format("YYYY-MM-DD")} ${vaccine.doseTime}`,
          "YYYY-MM-DD hh:mm A"
        );

        if (moment().isAfter(scheduleDateTime)) {
          vaccine.scheduleStatus = enumConfig.scheduleStatusEnums.MISSED;
          isModified = true;

          const user = await UserModel.findById(vaccine.scheduleBy).select(
            "fullName fcmToken profileImage phoneNumber email countryCode notificationPreferences"
          );

          const vaccineDetails = await VaccineModel.findById(vaccine.vaccineId);

          const vaccineName = vaccineDetails?.vaccineName || "Unknown Vaccine";

          const missedMessage = `${
            user.fullName
          } has missed vaccine dose for ${vaccineName} on ${moment(
            vaccine.date
          ).format("DD/MM/YYYY")} at ${vaccine.doseTime}.`;

          const type = enumConfig.notificationPreferencesEnum.OTHER;
          const preferences =
            user?.notificationPreferences?.preferences?.[type] || {};

          // 1. Push Notification (check if push preference is true)
          if (preferences.push) {
            await sendPushNotificationAndSave({
              user,
              message: missedMessage,
              title: "Missed Vaccine Dose Alert 🚨",
              type,
              image: user?.profileImage,
            });
          }

          // 2. Email Notification (check if email preference is true)
          if (preferences.email) {
            await emailService.missedVaccineScheduleEmail({
              email: user.email,
              fullName: user.fullName,
              vaccineName: vaccineName,
              scheduledTime: vaccine.doseTime,
            });
          }

          // 3. SMS Notification (check if sms preference is true)
          if (preferences.sms && user.phoneNumber) {
            const smsResult = await smsService.sendSMS({
              to: `${user.countryCode}${user.phoneNumber}`,
              message: missedMessage,
            });
            if (!smsResult.success) {
              console.warn(
                `Failed to send SMS to user ${user._id}: ${smsResult.message}`
              );
            }
          }
        }
        if (isModified) {
          await vaccine.save();
        }
      }
    }

    console.log("🕒 Missed vaccine schedules updated successfully.");
  } catch (error) {
    console.error("Error checking and updating missed schedules:", error);
  }
};

export const sendVaccineScheduleReminder = async () => {
  try {
    const pendingVaccines = await VaccineSchedule.find(
      {
        scheduleStatus: enumConfig.scheduleStatusEnums.PENDING,
        isReminderSent: { $ne: true },
      },
      null,
      { skipHook: true }
    );

    const now = moment();
    const todayDate = now.format("YYYY-MM-DD");

    for (const vaccine of pendingVaccines) {
      if (!vaccine.date || !vaccine.doseTime) continue;

      const scheduleDateTime = moment(
        `${todayDate} ${vaccine.doseTime}`,
        "YYYY-MM-DD hh:mm A"
      );

      const reminderTime = scheduleDateTime.clone().subtract(5, "minutes");
      const diffInSeconds = now.diff(reminderTime, "seconds");

      if (diffInSeconds >= 0 && diffInSeconds <= 60) {
        const user = await UserModel.findById(vaccine.scheduleBy).select(
          "fullName fcmToken profileImage phoneNumber email notificationPreferences countryCode"
        );

        const vaccineDetails = await VaccineModel.findById(vaccine.vaccineId);
        const vaccineName = vaccineDetails?.vaccineName || "your vaccine";

        const reminderMessage = `Hi ${
          user.fullName
        }, this is a reminder that your vaccine dose for ${vaccineName} is scheduled at ${
          vaccine.doseTime
        } on ${moment(vaccine.date).format("DD/MM/YYYY")}.`;

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
              return now.day() === moment(vaccine.date).day(); // Sunday=0, Saturday=6

            case enumConfig.notificationFrequencyEnum.MONTHLY:
              return now.date() === moment(vaccine.date).date();

            default:
              return true;
          }
        })();

        if (shouldSendReminder) {
          // 1. Push Notification
          if (preferences.push) {
            await sendPushNotificationAndSave({
              user,
              message: reminderMessage,
              title: "Vaccine Reminder ⏰",
              type,
              image: user?.profileImage,
            });
          }

          // 2. Email Notification
          if (preferences.email) {
            await emailService.vaccineReminderEmail({
              email: user.email,
              fullName: user.fullName,
              vaccineName,
              scheduledTime: vaccine.doseTime,
              scheduledDate: moment(vaccine.date).format("DD/MM/YYYY"),
            });
          }

          // 3. SMS Notification
          if (preferences.sms && user.phoneNumber) {
            const smsResult = await smsService.sendSMS({
              to: `${user.countryCode}${user.phoneNumber}`,
              message: reminderMessage,
            });
            if (!smsResult.success) {
              console.warn(
                `Failed to send vaccine reminder SMS to user ${user._id}: ${smsResult.message}`
              );
            }
          }
        }

        vaccine.isReminderSent = true;
        await vaccine.save();
      }
    }

    console.log("🕒 Vaccine reminders sent successfully.");
  } catch (error) {
    console.error("❌ Error sending vaccine schedule reminders:", error);
  }
};
