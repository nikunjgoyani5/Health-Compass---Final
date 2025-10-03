import cron from "node-cron";
import { updateMissedAppointmentByDoctor } from "./telemedicine.service.js";
import {
  sendDoseReminderNotifications,
  updateMissedMedicineDoses,
} from "./medicine.schedual.service.js";
import {
  checkAndUpdateMissedVaccineSchedules,
  sendVaccineScheduleReminder,
} from "./vaccine.service.js";

// Helper function to run service with error handling
const runServiceSafely = async (serviceName, serviceFunction) => {
  try {
    await serviceFunction();
    console.log(`✅ ${serviceName} completed successfully`);
  } catch (error) {
    console.error(`❌ Error in ${serviceName}:`, error.message);
    // Don't throw error, continue with other services
  }
};

// Schedule the job to run every 1 minute
cron.schedule("*/1 * * * *", async () => {
  console.log("⏰ Cron job running...");
  const start = Date.now();
  
  // Run each service independently with error handling
  await runServiceSafely("Update Missed Appointments", updateMissedAppointmentByDoctor);
  await runServiceSafely("Send Medicine Dose Reminders", sendDoseReminderNotifications);
  await runServiceSafely("Update Missed Medicine Doses", updateMissedMedicineDoses);
  await runServiceSafely("Check Missed Vaccine Schedules", checkAndUpdateMissedVaccineSchedules);
  await runServiceSafely("Send Vaccine Schedule Reminders", sendVaccineScheduleReminder);

  console.log(">>>>>> Cron finished in", Date.now() - start, "ms");
});
