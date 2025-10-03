import {
  connectToWebRTC,
  handleCallForwarding,
  handleIncomingCall,
} from "../services/twillio.service.js";

const incomingCall = async (req, res) => {
  try {
    const twilioResponse = await handleIncomingCall(req.body);
    res.type("text/xml");
    res.send(twilioResponse);
  } catch (error) {
    console.error("Error in incomingCall controller:", error);
    res.status(500).send("Internal Server Error");
  }
};

const callForwarding = async (req, res) => {
  try {
    const twilioResponse = await handleCallForwarding(req.body);
    res.type("text/xml");
    res.send(twilioResponse);
  } catch (error) {
    console.error("Error in callForwarding controller:", error);
    res.status(500).send("Internal Server Error");
  }
};

const webRTCConnect = async (req, res) => {
  try {
    const result = await connectToWebRTC(req.body);
    res.json(result);
  } catch (error) {
    console.error("Error in webRTCConnect controller:", error);
    res.status(500).send("Internal Server Error");
  }
};

export default {
  incomingCall,
  callForwarding,
  webRTCConnect,
};
