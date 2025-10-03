import speech from "@google-cloud/speech";
import fs from "fs";
import axios from "axios";
import dotenv from "dotenv";
import config from "../config/config.js";

dotenv.config();

const client = new speech.SpeechClient(
  config.google?.app_credentials
    ? {} 
    : {
        credentials: {
          client_email: config.gcp.client_email,
          private_key: process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, "\n") || config.gcp.private_key,
        },
      }
);

export const transcribeAudio = async ({ filePath, audioUrl }) => {
  try {
    let audioBytes;

    if (filePath) {
      console.log("🎙 Reading audio from local file...");
      audioBytes = fs.readFileSync(filePath).toString("base64");
    } else if (audioUrl) {
      console.log("🎙 Downloading audio from URL...");
      const audioResponse = await axios.get(audioUrl, { responseType: "arraybuffer" });
      audioBytes = Buffer.from(audioResponse.data).toString("base64");
    } else {
      throw new Error("Either filePath or audioUrl must be provided.");
    }

    const request = {
      audio: { content: audioBytes },
      config: {
        encoding: "MP3", 
        sampleRateHertz: 44100, 
        languageCode: "en-US",
        enableAutomaticPunctuation: true,
        model: "default",
        useEnhanced: true,
      },
    };

    console.log("🎙 Transcribing audio...");

    const [response] = await client.recognize(request);

    if (!response.results.length) return "";

    const transcription = response.results
      .map((r) => r.alternatives?.[0]?.transcript || "")
      .join(" ")
      .trim();

    console.log("🧠 Transcription result:", transcription);

    return transcription;
  } catch (err) {
    console.error("🎙 STT Error:", err.message);
    throw new Error("Failed to transcribe audio.");
  }
};
