import twilio from "twilio";
import config from "../config/config.js";

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

const sendSMS = async ({ to, message }) => {
  try {
    // Validate phone number
    if (!to || to === 'null' || to === 'undefined') {
      console.warn(`Invalid phone number provided: ${to}`);
      return { success: false, message: "Invalid phone number" };
    }

    const text = await client.messages.create({
      body: message,
      from: config.twilio.from,
      to: to,
    });
    console.log(`SMS successfully sent to ${to}`);
    return { success: true, data: text };
  } catch (error) {
    console.error(`Failed to send SMS to ${to}:`, error);
    return { success: false, error: error.message };
  }
};

export default {
  sendSMS,
};
