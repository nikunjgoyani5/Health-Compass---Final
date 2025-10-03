import OpenAI from "openai";
import enumConfig from "../config/enum.config.js";

const openai = new OpenAI({ apiKey: enumConfig.openAiApiKey });

// -- extract time from prompt 🕒
const extractTimeFromPrompt = (prompt) => {
  const todayPattern = /\b(today|today's)\b/i;
  const tomorrowPattern = /\b(tomorrow)\b/i;
  const yesterdayPattern = /\b(yesterday|previous day)\b/i;
  const allPattern = /\b(all data|all)\b/i;

  if (todayPattern.test(prompt)) {
    return "today";
  }
  if (tomorrowPattern.test(prompt)) {
    return "tomorrow";
  }
  if (allPattern.test(prompt)) {
    return "all";
  }
  if (yesterdayPattern.test(prompt)) {
    return "yesterday";
  }

  return null;
};

// --- detect prompt type from prompt 🔍
export const detectPromptTypeWithOpenAI = async (prompt) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `
You are a helpful assistant that classifies user health-related prompts.

Only return one of the following exact types based on user input:

- fetch_medicine
- fetch_medicine_schedule
- fetch_vaccine_schedule
- fetch_vaccine
- fetch_appointment_details
- fetch_health_info
- fetch_doctor_info
- create_medicine_schedule
- create_vaccine_schedule
- greeting
- other

Examples:
- "Fetch my medicine schedule for today" → fetch_medicine_schedule
- "Fetch my vaccine schedule for today" → fetch_vaccine_schedule
- "Create a new vaccine schedule" → create_vaccine_schedule
- "What vaccine do I need?" → fetch_vaccine
- "Add my medicine dose schedule" → create_medicine_schedule
- "Give me my appointment details" → fetch_appointment_details
- "Show general health info" → fetch_health_info
- "Who is my doctor?" → fetch_doctor_info
- "Hello, good morning!" → greeting
- "Thanks" → greeting
- "If the prompt is unrelated to health (like Weather, Technology (Node.js, JavaScript, Python, etc.), Travel, Finance, Entertainment etc.)" → other

Return only the type name.
          `,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const classification = response.choices[0].message.content
      .trim()
      .toLowerCase();

    const baseResponse = { type: classification };

    if (
      ["fetch_medicine_schedule", "fetch_appointment_details"].includes(
        classification
      )
    ) {
      baseResponse.query = extractTimeFromPrompt(prompt); // e.g. today, tomorrow
    }

    return baseResponse;
  } catch (error) {
    console.error("OpenAI Error:", error);
    return { type: "error", message: "Classification failed" };
  }
};

// --- extract medicine schedule data from prompt 💊
export const extractMedicineScheduleDataFromPrompt = async (prompt) => {
  const extractResponse = await openai.chat.completions.create({
    model: "gpt-4",
    max_tokens: 300,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You are a helpful assistant that extracts the following fields from a prompt:
medicineName (as string or ID), quantity (number), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), doseTimes (array of times like "11:00 AM"), totalDosesPerDay (number).

Respond in this exact JSON format:
{
  "medicineName": "",
  "quantity": 0,
  "startDate": "",
  "endDate": "",
  "doseTimes": [],
  "totalDosesPerDay": 0
}`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const jsonString = extractResponse.choices[0].message.content.trim();
  console.log(jsonString);

  try {
    const parsed = JSON.parse(jsonString) ? JSON.parse(jsonString) : jsonString;
    return parsed;
  } catch (err) {
    // console.error("Failed to parse extracted data:", err);
    return null;
  }
};

// --- extract vaccine schedule data from prompt 💉
export const extractVaccineScheduleDataFromPrompt = async (prompt) => {
  const response = await openai.chat.completions.create({
    model: "gpt-4", // or "gpt-3.5-turbo"
    temperature: 0.2,
    max_tokens: 200,
    messages: [
      {
        role: "system",
        content: `You are a helpful assistant that extracts the following fields from a prompt: Respond with a JSON object with keys: vaccineName (as string), date (YYYY-MM-DD), doseTime (hh:mm AM/PM).
            Respond in this exact JSON format:
            {
              "vaccineName": "",
              "date": "",
              "doseTime": "",
            }`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const jsonString = response.choices[0].message.content.trim();
  console.log({ jsonString });

  try {
    const parsed = JSON.parse(jsonString);
    return parsed;
  } catch (err) {
    // console.error("Failed to parse extracted data:", err);
    return null;
  }
};

// --- handle greeting prompt with openAi 👋
export const handleGreetingPromptWithOpenAI = async (prompt) => {
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    max_tokens: 80,
    messages: [
      {
        role: "system",
        content: `You are a friendly virtual health assistant. When the user greets you (like saying hello, thank you, or good morning etc.), you respond kindly and introduce yourself as a health assistant. Keep your reply short, warm, and professional with emoji.`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return completion.choices[0].message.content.trim();
};

// --- handle health info prompt with openAi 🧠
export const handleHealthInfoPromptWithOpenAI = async (prompt) => {
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    max_tokens: 100,
    messages: [
      {
        role: "system",
        content: `
You are a friendly and helpful virtual health assistant. Your job is to provide clear, simple, and accurate information related to health topics such as:

- Medicines (e.g., what is Paracetamol used for?)
- Vaccines (e.g., what is the Hepatitis B vaccine for?)
- Diet (e.g., what is a healthy diet for diabetics?)
- General health guidance (e.g., how to stay hydrated)

Respond in a warm, respectful tone with emoji. If the question is not related to health, say you can only provide health-related information.
        `,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  return completion.choices[0].message.content.trim();
};

// --- handle medicine query with bot 🩺
export const handleMedicineQueryWithBot = async (medicineList, prompt) => {
  if (!medicineList?.length) return "No medicine records found.";

  const formattedData = medicineList
    .map((med, index) => {
      return `Medicine ${index + 1}:
- Name: ${med.medicineName}
- Dosage: ${med.dosage}
- Description: ${med.description}
- Taken For: ${med.takenForSymptoms}
- Risks: ${med.associatedRisks}
- Quantity: ${med.quantity}
- Single Pack: ${med.singlePack === "true" ? "Yes" : "No"}
- Price: ₹${med.price}
- MFG Date: ${new Date(med.mfgDate).toDateString()}
- EXP Date: ${new Date(med.expDate).toDateString()}
- Created By Admin: ${med.createdByAdmin ? "Yes" : "No"}
- Added By: ${med.userId?.fullName || "Unknown"} (${
        med.userId?.email || "N/A"
      })`;
    })
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content: `You are a friendly health assistant. You help users understand and retrieve medicine data. Respond in a friendly, clear tone. You have access to a list of medicines with full data. Answer only based on the data provided below.`,
      },
      {
        role: "user",
        content: `Here is the medicine data:\n\n${formattedData}\n\nUser's Question:\n${prompt}`,
      },
    ],
  });

  return completion.choices[0].message.content.trim();
};

// --- handle vaccine query with bot 🔍
export const handleVaccineInfoQueryWithBot = async (vaccineData, prompt) => {
  if (!vaccineData || vaccineData.length === 0) {
    return "No vaccines found.";
  }

  const formatted = vaccineData
    .map((vaccine, i) => {
      return `Vaccine ${i + 1}:
- Name: ${vaccine.vaccineName}
- Provider: ${vaccine.provider}
- Description: ${vaccine.description}
- Created By: ${vaccine.createdBy?.fullName || "N/A"} (${
        vaccine.createdBy?.email || "N/A"
      })
- Created By Admin: ${vaccine.createdByAdmin ? "Yes" : "No"}
- Created At: ${new Date(vaccine.createdAt).toDateString()}`;
    })
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    max_tokens: 1000,
    messages: [
      {
        role: "system",
        content: `You are a vaccine assistant AI. Based on the given vaccine data, respond to the user's query with clear and accurate information.`,
      },
      {
        role: "user",
        content: `Vaccine data:\n\n${formatted}\n\nNow answer this:\n${prompt}`,
      },
    ],
  });

  return completion.choices[0].message.content.trim();
};

// --- handle medicine schedule query with bot 💊 🗓️
export const handleMedicineScheduleQueryWithBot = async (
  scheduleData,
  prompt
) => {
  if (!scheduleData?.length) return "No medicine schedule found.";

  const formatted = scheduleData
    .map((item, index) => {
      const medicine = item.medicineName;
      const doseLogs = item.doseLogs
        ?.map((log) => {
          const date = new Date(log.date).toDateString();
          const doses = log.doses
            ?.map((dose) => `- ${dose.time}: ${dose.status}`)
            .join("\n");
          return `Date: ${date}\n${doses}`;
        })
        .join("\n\n");

      return `Schedule ${index + 1}:
- Medicine Name: ${medicine.medicineName}
- Dosage: ${medicine.dosage}
- Description: ${medicine.description}
- Taken For: ${medicine.takenForSymptoms}
- Risks: ${medicine.associatedRisks}
- Total Doses Per Day: ${item.totalDosesPerDay}
- Quantity Left: ${item.quantity}
- Status: ${item.status}
- Start Date: ${new Date(item.startDate).toDateString()}
- End Date: ${new Date(item.endDate).toDateString()}
- Dose Logs:
${doseLogs}`;
    })
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content: `You are a helpful and friendly health assistant. The user has asked a question related to their medicine schedule. You will respond in a conversational, polite tone using the provided data. Always base your answer strictly on the data below.`,
      },
      {
        role: "user",
        content: `Here is the user's medicine schedule:\n\n${formatted}\n\nNow, answer this query:\n${prompt}`,
      },
    ],
  });

  return completion.choices[0].message.content.trim();
};

// --- handle vaccine schedule query with bot 💉 🗓️
export const handleVaccineScheduleQueryWithBot = async (
  scheduleData,
  prompt
) => {
  if (!scheduleData?.length) return "No vaccine schedule found.";

  const formatted = scheduleData
    .map((item, index) => {
      const vaccine = item.vaccineId;
      return `Schedule ${index + 1}:
- Vaccine Name: ${vaccine.vaccineName}
- Provider: ${vaccine.provider}
- Description: ${vaccine.description}
- Scheduled Date: ${new Date(item.date).toDateString()}
- Dose Time: ${item.doseTime}
- Status: ${item.scheduleStatus}`;
    })
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content: `You are a helpful and informative vaccine assistant. You are given the user's vaccine schedule and must answer their query using this data in a clear, user-friendly way.`,
      },
      {
        role: "user",
        content: `Here is the user's vaccine schedule:\n\n${formatted}\n\nNow answer this query:\n${prompt}`,
      },
    ],
  });

  return completion.choices[0].message.content.trim();
};

// --- handle appointment info query with bot 🩺 📅
export const handleAppointmentInfoQueryWithBot = async (
  appointmentData,
  prompt
) => {
  if (!appointmentData || appointmentData.length === 0) {
    return "No appointments found.";
  }

  const formatted = appointmentData
    .map((item, i) => {
      const doctor = item.doctorId;
      const user = item.userId;
      return `Appointment ${i + 1}:
- User: ${user?.fullName || "N/A"} (${user?.role || "N/A"})
- Doctor: ${doctor?.fullName || "N/A"} (${doctor?.role || "N/A"})
- Doctor Specialization: ${doctor?.specialization?.join(", ") || "N/A"}
- Appointment Type: ${item.appointmentType}
- Date: ${new Date(item.appointmentDate).toDateString()}
- Time: ${item.appointmentStartTime} - ${item.appointmentEndTime}
- Status: ${item.status}
- Video Call Successful: ${item.videoCall?.wasSuccessful ? "Yes" : "No"}
- Created At: ${new Date(item.createdAt).toLocaleString()}`;
    })
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    max_tokens: 1000,
    messages: [
      {
        role: "system",
        content: `You are a healthcare assistant AI. Based on the given telemedicine appointment data, respond to the user's query in a descriptive format.`,
      },
      {
        role: "user",
        content: `Appointment Data:\n\n${formatted}\n\nNow answer this:\n${prompt}`,
      },
    ],
  });

  return completion.choices[0].message.content.trim();
};
