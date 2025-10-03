import textToSpeech from "@google-cloud/text-to-speech";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import config from "../config/config.js";
import dotenv from "dotenv";

dotenv.config();

// 🔐 Load credentials if not using GOOGLE_APPLICATION_CREDENTIALS env variable
const client = new textToSpeech.TextToSpeechClient(
  config.google.app_credentials
    ? {} // auto-load from env
    : {
        credentials: {
          client_email: config.gcp.client_email,
          private_key:
            process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, "\n") ||
            config.gcp.private_key,
        },
      }
);

export const generateSpeech = async (text) => {
  try {
    const request = {
      input: { text },
      voice: {
        languageCode: "en-US",
        ssmlGender: "NEUTRAL",
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate: 0.94,
      },
    };

    const [response] = await client.synthesizeSpeech(request);

    const filename = `voice_${uuidv4()}.mp3`;
    const outputDir = path.join("public", "audio");
    const outputPath = path.join(outputDir, filename);

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, response.audioContent, "binary");

    return `/audio/${filename}`;
  } catch (err) {
    console.error("🔊 TTS generation failed:", err.message);
    throw new Error("Failed to generate audio from text.");
  }
};
