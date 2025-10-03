import AiQueryLog from "../models/aiQuery-log.model.js";

export const logQueryToDB = async ({
  anonToken,
  query,
  aiResponse,
  model,
  tokensUsed,
  success,
  errorMessage,
  ip,
}) => {
  try {
    const logData = {
      anonToken,
      query,
      model,
      tokensUsed,
      success,
      errorMessage,
      ip,
    };

    if (aiResponse) {
      // Ensure aiResponse is a string before calling substring
      const responseText = typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse);
      logData.aiResponse = responseText.substring(0, 1500); // truncate long responses
    }

    await AiQueryLog.create(logData);
  } catch (err) {
    console.error("Failed to log AI query:", err.message);
  }
};
