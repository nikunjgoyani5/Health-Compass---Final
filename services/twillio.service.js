import { twiml } from "twilio";
import Call from "../models/call.model.js";

export const handleIncomingCall = async (twilioData) => {
  const { CallSid, From, To } = twilioData;

  try {
    const call = new Call({
      callSid: CallSid,
      webRTCClientId: "",
    });

    await call.save();

    const response = new twiml.VoiceResponse();
    response.say("Please wait while we connect your call to WebRTC.");
    response
      .dial({
        action: "/twilio/call/forward",
        method: "POST",
      })
      .conference({
        endConferenceOnExit: true,
      })
      .say("Connecting to WebRTC...");

    return response.toString();
  } catch (error) {
    console.error("Error in handleIncomingCall service:", error);
    throw new Error("Error handling incoming call");
  }
};

export const handleCallForwarding = async (twilioData) => {
  const { CallSid } = twilioData;

  try {
    const call = await Call.findOne({ callSid: CallSid });

    if (!call) {
      throw new Error("Call not found");
    }

    // Logic to forward the call to WebRTC client
    // Implement the WebRTC client forwarding logic here
    const response = new twiml.VoiceResponse();
    response.say("Call forwarded to WebRTC client.");
    return response.toString();
  } catch (error) {
    console.error("Error in handleCallForwarding service:", error);
    throw new Error("Error forwarding call");
  }
};

export const connectToWebRTC = async (data) => {
  const { callSid, webRTCClientId } = data;

  try {
    const updatedCall = await Call.findOneAndUpdate(
      { callSid },
      { webRTCClientId, status: "connected" },
      { new: true }
    );

    if (!updatedCall) {
      throw new Error("Call not found");
    }

    return {
      message: "WebRTC client connected",
      call: updatedCall,
    };
  } catch (error) {
    console.error("Error in connectToWebRTC service:", error);
    throw new Error("Error connecting to WebRTC");
  }
};
