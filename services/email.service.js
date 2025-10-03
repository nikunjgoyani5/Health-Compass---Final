import config from "../config/config.js";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import dayjs from "dayjs";

const sendEmail = async ({
  from = config.email.from,
  to,
  subject,
  templateVariables,
  filename,
}) => {
  try {
    console.log("📧 [EMAIL SERVICE] Starting email sending process...");
    console.log("📧 [EMAIL SERVICE] Email details:");
    console.log("  - From:", from);
    console.log("  - To:", to);
    console.log("  - Subject:", subject);
    console.log("  - Template:", filename);
    
    // Read html template
    console.log("📧 [EMAIL SERVICE] Reading HTML template...");
    let html = fs.readFileSync(
      path.join(process.cwd(), "html-templates", filename),
      "utf-8"
    );
    console.log("✅ [EMAIL SERVICE] HTML template loaded successfully");

    // Replace template variables with their values
    console.log("📧 [EMAIL SERVICE] Replacing template variables...");
    console.log("📧 [EMAIL SERVICE] Template variables:", templateVariables);
    Object.keys(templateVariables).forEach((key) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      html = html.replace(regex, templateVariables[key]);
    });
    console.log("✅ [EMAIL SERVICE] Template variables replaced");

    // create transporter
    console.log("📧 [EMAIL SERVICE] Creating SMTP transporter...");
    console.log("📧 [EMAIL SERVICE] SMTP config:", {
      host: config.nodemailer.host,
      port: config.nodemailer.port,
      user: config.nodemailer.auth.user
    });
    
    const mailTransport = nodemailer.createTransport({
      host: config.nodemailer.host,
      port: config.nodemailer.port,
      secure: false,
      auth: {
        user: config.nodemailer.auth.user,
        pass: config.nodemailer.auth.pass,
      },
    });
    console.log("✅ [EMAIL SERVICE] SMTP transporter created");

    // Send email
    console.log("📧 [EMAIL SERVICE] Sending email...");
    const result = await mailTransport.sendMail({
      from: from,
      to,
      subject,
      html,
    });

    console.log("✅ [EMAIL SERVICE] Email sent successfully!");
    console.log("📧 [EMAIL SERVICE] Email result:", {
      accepted: result.accepted,
      rejected: result.rejected,
      messageId: result.messageId,
      response: result.response,
      envelopeTime: result.envelopeTime,
      messageTime: result.messageTime,
      messageSize: result.messageSize
    });
    
    if (result.accepted && result.accepted.length > 0) {
      console.log("✅ [EMAIL SERVICE] Email successfully delivered to:", result.accepted.join(", "));
    }
    
    if (result.rejected && result.rejected.length > 0) {
      console.log("❌ [EMAIL SERVICE] Email rejected for:", result.rejected.join(", "));
    }
    
    return result;
  } catch (error) {
    console.error("❌ [EMAIL SERVICE] Email sending failed:", error);
    console.error("❌ [EMAIL SERVICE] Error details:", {
      message: error.message,
      stack: error.stack,
      code: error.code,
      command: error.command
    });
    throw error; // Re-throw to let caller handle
  }
};

const sendOTPEmail = async ({ email, otp, otpExpiresAt, fullName }) => {
  return sendEmail({
    to: email,
    subject: "OTP verification",
    templateVariables: {
      otp: otp,
      otpExpiresAt: otpExpiresAt,
      fullName: fullName,
      year: dayjs().format("YYYY"),
    },
    filename: "verifyOTP.html",
  });
};

const sendDoctorCredentialsEmail = async ({ email, fullName, password }) => {
  return sendEmail({
    to: email,
    subject: "Doctor Account Created – Login Credentials",
    templateVariables: {
      email,
      fullName,
      password,
      year: dayjs().format("YYYY"),
    },
    filename: "doctorCredentials.html",
  });
};

const send2FaEmail = async ({ email, username, twofactorqr }) => {
  return sendEmail({
    to: email,
    subject: "Set Up Google Two-Step Authentication for Your VA-BOT Account",
    templateVariables: {
      username,
      twofactorqr,
      year: dayjs().format("YYYY"),
    },
    filename: "qrcode.html",
  });
};

const sendAdminApprovalEmail = async ({ email, fullName }) => {
  return sendEmail({
    to: email,
    subject: "Admin Account Approved",
    templateVariables: {
      email: email,
      fullName,
      year: dayjs().format("YYYY"),
    },
    filename: "admin-approve-email.html",
  });
};

const sendAdminRejectEmail = async ({ email, fullName }) => {
  return sendEmail({
    to: email,
    subject: "Admin Account Rejected",
    templateVariables: {
      email: email,
      fullName,
      year: dayjs().format("YYYY"),
    },
    filename: "admin-reject-email.html",
  });
};

const sendAdminBlockEmail = async ({ email, fullName }) => {
  return sendEmail({
    to: email,
    subject: "Admin Account Blocked",
    templateVariables: {
      email: email,
      fullName,
      year: dayjs().format("YYYY"),
    },
    filename: "admin-block-email.html",
  });
};

const sendAdminUnblockEmail = async ({ email, fullName }) => {
  return sendEmail({
    to: email,
    subject: "Admin Account Unblocked",
    templateVariables: {
      email: email,
      fullName,
      year: dayjs().format("YYYY"),
    },
    filename: "admin-unblock-email.html",
  });
};

const cancelledAppointmentByDoctorEmail = async ({
  email,
  fullName,
  doctorName,
  appointmentDate,
  appointmentTime,
}) => {
  return sendEmail({
    to: email,
    subject: "Appointment Cancelled",
    templateVariables: {
      fullName,
      doctorName,
      appointmentDate,
      appointmentTime,
      year: dayjs().format("YYYY"),
    },
    filename: "cancelled-appointment-by-doctor-email.html",
  });
};

const missedMedicineAlertEmail = async ({
  email,
  fullName,
  medicineName,
  scheduledTime,
}) => {
  return sendEmail({
    to: email,
    subject: "Missed Medicine Alert 🚨",
    templateVariables: {
      fullName,
      medicineName,
      scheduledTime,
      date: dayjs().format("DD/MM/YYYY"),
      year: dayjs().format("YYYY"),
    },
    filename: "missed-medicine-alert-email.html",
  });
};

const medicineReminderEmail = async ({
  email,
  fullName,
  medicineName,
  scheduledTime,
}) => {
  return sendEmail({
    to: email,
    subject: "Medicine Reminder ⏰",
    templateVariables: {
      fullName,
      medicineName,
      scheduledTime,
      date: dayjs().format("DD/MM/YYYY"),
      year: dayjs().format("YYYY"),
    },
    filename: "medicine-reminder-email.html",
  });
};

const sendMissedAppointmentByDoctorEmail = async ({
  email,
  fullName,
  doctorName,
  appointmentDate,
  appointmentTime,
}) => {
  return sendEmail({
    to: email,
    subject: "Missed Appointment Notification",
    templateVariables: {
      fullName,
      doctorName,
      appointmentDate: dayjs(appointmentDate).format("DD/MM/YYYY"),
      appointmentTime,
      year: dayjs().format("YYYY"),
    },
    filename: "appointment-missed-by-doctor-email.html",
  });
};

const missedVaccineScheduleEmail = async ({
  email,
  fullName,
  vaccineName,
  scheduledTime,
}) => {
  return sendEmail({
    to: email,
    subject: "Missed Vaccine Dose Alert 🚨",
    templateVariables: {
      fullName,
      vaccineName,
      scheduledTime,
      date: dayjs().format("DD/MM/YYYY"),
      year: dayjs().format("YYYY"),
    },
    filename: "missed-vaccine-schedule-email.html",
  });
};

const vaccineReminderEmail = async ({
  email,
  fullName,
  vaccineName,
  scheduledTime,
}) => {
  return sendEmail({
    to: email,
    subject: "Vaccine Reminder ⏰",
    templateVariables: {
      fullName,
      vaccineName,
      scheduledTime,
      scheduledDate: dayjs().format("DD/MM/YYYY"),
      year: dayjs().format("YYYY"),
    },
    filename: "vaccine-reminder-email.html",
  });
};

const sendCaregiverInviteEmail = async ({
  email,
  caregiverName,
  requesterName,
  requestDate,
  dashboardLink,
  brandName = "Health Compass",
}) => {
  console.log("📧 [CAREGIVER INVITE EMAIL] Starting caregiver invite email...");
  console.log("📧 [CAREGIVER INVITE EMAIL] Parameters:", {
    email,
    caregiverName,
    requesterName,
    requestDate,
    dashboardLink,
    brandName
  });
  
  return sendEmail({
    to: email,
    subject: "Caregiver Invitation - Health Compass",
    templateVariables: {
      caregiverName,
      requesterName,
      requestDate,
      dashboardLink,
      brandName,
      year: dayjs().format("YYYY"),
    },
    filename: "caregiver-invite-email.html",
  });
};

const sendCaregiverRequestStatusEmail = async ({
  email,
  status,
  requesterName,
  caregiverName,
  actionDate,
  dashboardLink,
  brandName = "Health Compass",
}) => {
  // Set colors based on status
  const isAccepted = status.toLowerCase() === "accepted";
  const borderColor = isAccepted ? "#2d918c" : "#d9534f";
  const headerColor = isAccepted ? "#004d49" : "#a94442";
  const infoBg = isAccepted ? "#f1f8f7" : "#fdf2f2";
  const buttonColor = isAccepted ? "#2d918c" : "#d9534f";

  return sendEmail({
    to: email,
    subject: `Caregiver Request ${status} - Health Compass`,
    templateVariables: {
      status,
      requesterName,
      caregiverName,
      actionDate,
      dashboardLink,
      brandName,
      borderColor,
      headerColor,
      infoBg,
      buttonColor,
      year: dayjs().format("YYYY"),
    },
    filename: "caregiver-request-email.html",
  });
};

export default {
  sendOTPEmail,
  sendEmail,
  sendDoctorCredentialsEmail,
  send2FaEmail,
  sendAdminApprovalEmail,
  sendAdminRejectEmail,
  sendAdminBlockEmail,
  sendAdminUnblockEmail,
  cancelledAppointmentByDoctorEmail,
  missedMedicineAlertEmail,
  medicineReminderEmail,
  sendMissedAppointmentByDoctorEmail,
  missedVaccineScheduleEmail,
  vaccineReminderEmail,
  sendCaregiverInviteEmail,
  sendCaregiverRequestStatusEmail,
};
