import moment from "moment";
import Telemedicine from "../models/telemedicine.model.js";
import enumConfig from "../config/enum.config.js";
import UserModel from "../models/user.model.js";
import { sendPushNotificationAndSave } from "./notification.service.js";
import emailService from "./email.service.js";

export const updateMissedAppointmentByDoctor = async () => {
  try {
    const scheduledAppointments = await Telemedicine.find(
      {
        status: enumConfig.appointmentStatusEnums.CONFIRM,
      },
      null,
      { skipHook: true }
    );

    const currentDateTime = moment();
    const updates = [];

    for (const appointment of scheduledAppointments) {
      const appointmentDate = appointment.appointmentDate;
      const appointmentStartTime = appointment.appointmentStartTime;

      if (!appointmentDate || !appointmentStartTime) {
        continue;
      }

      // Combine date and time, and add 5 minutes buffer
      const appointmentDateTime = moment(appointmentDate).set({
        hour: moment(appointmentStartTime, ["h:mm A"]).hour(),
        minute: moment(appointmentStartTime, ["h:mm A"]).minute(),
        second: 0,
        millisecond: 0,
      });

      const appointmentMissedThreshold = moment(appointmentDateTime).add(
        5,
        "minutes"
      );

      // Check if current time is after the 5-minute threshold
      if (currentDateTime.isAfter(appointmentMissedThreshold)) {
        updates.push(
          Telemedicine.updateOne(
            { _id: appointment._id },
            { $set: { status: enumConfig.appointmentStatusEnums.MISSED } }
          )
        );

        const user = await UserModel.findById(appointment.userId);
        const message = `Your telemedicine appointment scheduled on ${moment(
          appointmentDate
        ).format(
          "YY/MM/DD"
        )} at ${appointmentStartTime} was missed by the doctor. We apologize for the inconvenience and will help you reschedule.`;

        const type = enumConfig.notificationPreferencesEnum.OTHER;
        const preferences =
          user?.notificationPreferences?.preferences?.[type] || {};

        // 1. Push Notification
        if (preferences.push) {
          await sendPushNotificationAndSave({
            user,
            message,
            title: "Doctor Missed Appointment",
            type,
            image: user?.profileImage,
          });
        }

        const doctorName = await UserModel.findById(
          appointment.doctorId
        ).select("fullName");

        // 2. Email Notification
        if (preferences.email) {
          await emailService.sendMissedAppointmentByDoctorEmail({
            email: user.email,
            fullName: user.fullName,
            doctorName: doctorName?.fullName,
            appointmentDate,
            appointmentTime: appointmentStartTime,
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
    }

    if (updates.length > 0) {
      await Promise.all(updates);
      console.log(
        `${updates.length} telemedicine appointments marked as missed.`
      );
    } else {
      console.log("🕒 No telemedicine appointments to mark as missed.");
    }
  } catch (error) {
    console.error("Error updating missed telemedicines:", error);
  }
};
