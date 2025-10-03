import { StatusCodes } from "http-status-codes";
import StaticHealthBot from "../models/static-bot.model.js";
import { apiResponse } from "../helper/api-response.helper.js";
import {
  detectPromptTypeWithOpenAI,
  extractMedicineScheduleDataFromPrompt,
  extractVaccineScheduleDataFromPrompt,
  handleAppointmentInfoQueryWithBot,
  handleGreetingPromptWithOpenAI,
  handleHealthInfoPromptWithOpenAI,
  handleMedicineQueryWithBot,
  handleMedicineScheduleQueryWithBot,
  handleVaccineInfoQueryWithBot,
  handleVaccineScheduleQueryWithBot,
} from "../services/static-bot.service.js";
import MedicineSchedule from "../models/medicine.schedual.model.js";
import VaccineSchedule from "../models/vaccine.schedule.model.js";
import VaccineModel from "../models/vaccine.model.js";
import Telemedicine from "../models/telemedicine.model.js";
import UserModel from "../models/user.model.js";
import enumConfig from "../config/enum.config.js";
import DoctorAvailability from "../models/availability.model.js";
import axios from "axios";
import Medicine from "../models/medicine.model.js";

const addModule = async (req, res) => {
  try {
    const data = req.body;
    data.createdBy = req.user._id;

    const findedModule = await StaticHealthBot.findOne({
      title: data.title,
      description: data.description,
      createdBy: data.createdBy,
    });
    if (findedModule) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.CONFLICT,
        data: null,
        message: "Module already exists.",
      });
    }

    const module = await StaticHealthBot.create(data);
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: module,
      message: "Module added successfully.",
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Failed to add module.",
    });
  }
};

const addPrompts = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const { prompts } = req.body;

    const module = await StaticHealthBot.findById(moduleId);
    if (!module) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Module not found.",
      });
    }
    module.prompts.push(...prompts);
    await module.save();
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: module,
      message: "Prompts added successfully.",
    });
  } catch (error) {
    console.log(error);

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Failed to add prompts.",
    });
  }
};

const getPrompts = async (req, res) => {
  try {
    const { moduleId } = req.params;

    const module = await StaticHealthBot.findById(moduleId);
    if (!module) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Module not found.",
      });
    }
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: module.prompts,
      message: "Prompts retrieved successfully.",
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Failed to retrieve prompts.",
    });
  }
};

const deleteRecords = async (req, res) => {
  try {
    const { moduleId } = req.params;

    const module = await StaticHealthBot.findByIdAndDelete(moduleId);
    if (!module) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Module not found.",
      });
    }
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: null,
      message: "Data is deleted successfully.",
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Failed to delete module and prompts.",
    });
  }
};

const updateData = async (req, res) => {
  try {
    const { moduleId } = req.params;
    const data = req.body;

    const module = await StaticHealthBot.findByIdAndUpdate(
      moduleId,
      { $set: data },
      { new: true }
    ).lean();
    if (!module) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Module not found.",
      });
    }
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: module,
      message: "Module updated successfully.",
    });
  } catch (error) {
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Failed to update module.",
    });
  }
};

const askQuestion = async (req, res) => {
  try {
    const { prompt } = req.body;
    const userId = req.user._id;
    const token = req.headers.authorization;

    const detectPromptType = await detectPromptTypeWithOpenAI(prompt);
    console.log({ detectPromptType });

    let botReply = "";

    // 💊 Handle Medicine Schedule Creation
    if (detectPromptType.type == "create_medicine_schedule") {
      const extractedData = await extractMedicineScheduleDataFromPrompt(prompt);

      const requiredFields = [
        "medicineName",
        "quantity",
        "startDate",
        "endDate",
        "doseTimes",
        "totalDosesPerDay",
      ];

      const missingFields = requiredFields.filter(
        (field) =>
          !extractedData ||
          extractedData[field] === undefined ||
          extractedData[field] === "" ||
          (Array.isArray(extractedData[field]) &&
            extractedData[field].length === 0)
      );

      if (!extractedData || Object.keys(extractedData).length === 0) {
        botReply = `💊 To schedule your medicine, please provide the following details:\n\n- **medicine name**: name of the medicine\n- **quantity**: Total quantity of medicine\n- **start date**: When to start \n- **end date**: When to stop \n- **dose times**: At what times\n- **total doses per day**: Total doses per day\n\nExample:\n"I want to schedule Paracetamol from 2025-05-17 to 2025-05-18, 2 times a day at 08:00 AM and 08:00 PM with quantity 4."`;
      } else if (missingFields > 0) {
        botReply = `⚠️ Please provide the following missing information to schedule your medicine:\n- ${missingFields.join(
          "\n- "
        )}`;
      } else {
        const apiUrl = "http://localhost:8002/api/v1/medicine-schedule/by-bot";

        try {
          const response = await axios.post(apiUrl, extractedData, {
            headers: {
              Authorization: token,
            },
          });

          // ✅ Successful Schedule
          if (response.status === 200 || response.status === 201) {
            const {
              medicineName,
              quantity,
              startDate,
              endDate,
              doseTimes,
              totalDosesPerDay,
            } = extractedData;

            botReply = `✅ Your medicine schedule has been successfully created.\n\n💊 **Medicine Schedule Details:**\n- **Medicine:** ${medicineName}\n- **Quantity:** ${quantity}\n- **Start Date:** ${startDate}\n- **End Date:** ${endDate}\n- **Total Doses Per Day:** ${totalDosesPerDay}\n- **Dose Times:** ${doseTimes.join(
              ", "
            )}`;
          }
        } catch (error) {
          // ❌ API Error — show API response message if present
          const apiMessage =
            error?.response?.data?.message ||
            "Something went wrong while scheduling your medicine. Please try again.";
          botReply = `${apiMessage}`;
        }
      }
    }

    // 💉 Handle Vaccine Schedule Creation
    if (detectPromptType.type === "create_vaccine_schedule") {
      const extractedData = await extractVaccineScheduleDataFromPrompt(prompt);
      const requiredFields = ["vaccineName", "date", "doseTime"];

      const missingFields = requiredFields.filter(
        (field) =>
          !extractedData ||
          extractedData[field] === undefined ||
          extractedData[field] === ""
      );

      if (!extractedData || Object.keys(extractedData).length === 0) {
        botReply = `💉 To schedule your vaccine, please provide the following details:\n\n- **vaccine name**: Name of vaccine\n- **date**: Date of vaccine\n- **doseTime**: Time of dose (e.g., "02:30 PM")\n\nExample:\n"I want to schedule vaccine COVID-19 on 2025-05-16 at 2:30 PM."`;
      } else if (missingFields.length > 0) {
        botReply = `⚠️ Please provide the following missing information to schedule your vaccine:\n- ${missingFields.join(
          "\n- "
        )}`;
      } else {
        const apiUrl = "http://localhost:8002/api/v1/vaccine-schedule/by-bot";

        try {
          const response = await axios.post(apiUrl, extractedData, {
            headers: {
              Authorization: token,
            },
          });

          // ✅ Successful response
          if (response.status === 200 || response.status === 201) {
            const { vaccineName, date, doseTime } = extractedData;

            botReply = `✅ Your vaccine schedule has been successfully created.\n\n💉 **Vaccine Schedule Details:**\n- **Vaccine Name:** ${vaccineName}\n- **Date:** ${date}\n- **Time:** ${doseTime}`;
          }
        } catch (error) {
          // ❌ Show API error message if available
          const apiMessage =
            error?.response?.data?.message ||
            "Something went wrong while scheduling your vaccine. Please try again.";
          botReply = `❌ ${apiMessage}`;
        }
      }
    }

    // 🧭 Other
    if (detectPromptType.type === "other") {
      botReply = `I'm sorry for any confusion, but I'm a healthcare and medicine expert assistant. Your request:
👉 "${prompt}"

doesn't appear to be health-related. I can help you with topics such as:

- Vaccines and schedules
- Medicine schedules and doses
- Appointment or health info

If you have any health-related questions, feel free to ask! 😊`;
    }

    // 👋 Greetings
    if (detectPromptType.type === "greeting") {
      botReply = await handleGreetingPromptWithOpenAI(prompt);
    }

    // 🧠 Health info
    if (detectPromptType.type === "fetch_health_info") {
      botReply = await handleHealthInfoPromptWithOpenAI(prompt);
    }

    // 🧑‍⚕️ Fetch doctor info
    if (detectPromptType.type === "fetch_doctor_info") {
      const findDoctor = await UserModel.find({
        is_deleted: false,
        role: { $in: [enumConfig.userRoleEnum.DOCTOR] },
      }).select(
        "fullName profileImage role experience phoneNumber description specialization qualifications"
      );
      const findDoctorAvailability = await DoctorAvailability.find();
    }

    // 🩺 Fetch medicine info
    if (detectPromptType.type === "fetch_medicine") {
      const fetchMedicine = await Medicine.find().populate(
        "userId",
        "fullName profileImage role"
      );

      botReply = await handleMedicineQueryWithBot(fetchMedicine, prompt);
    }

    // 🔍 Fetch vaccine info
    if (detectPromptType.type === "fetch_vaccine") {
      const fetchVaccines = await VaccineModel.find()
        .populate("createdBy", "fullName profileImage")
        .sort({ createdAt: -1 });

      botReply = await handleVaccineInfoQueryWithBot(fetchVaccines, prompt);
    }

    // 💊 🗓️ Fetch medicine schedules
    if (detectPromptType.type === "fetch_medicine_schedule") {
      const fetchMedicineSchedule = await MedicineSchedule.find({
        userId: userId,
      })
        .populate("userId", "fullName profileImage role")
        .populate(
          "medicineName",
          "medicineName dosage description takenForSymptoms associatedRisks"
        )
        .sort({ createdAt: -1 });

      botReply = await handleMedicineScheduleQueryWithBot(
        fetchMedicineSchedule,
        prompt
      );
    }

    // 💉 🗓️ Fetch vaccine schedules
    if (detectPromptType.type === "fetch_vaccine_schedule") {
      const fetchVaccineSchedule = await VaccineSchedule.find({
        scheduleBy: userId,
      }).populate("vaccineId", "vaccineName provider description");
      botReply = await handleVaccineScheduleQueryWithBot(
        fetchVaccineSchedule,
        prompt
      );
    }

    // 🩺 📅 Fetch appointment details
    if (detectPromptType.type === "fetch_appointment_details") {
      const fetchAppointment = await Telemedicine.find({ userId: userId })
        .populate("userId", "fullName profileImage role")
        .populate(
          "doctorId",
          "fullName profileImage role experience specialization qualifications"
        );

      botReply = await handleAppointmentInfoQueryWithBot(
        fetchAppointment,
        prompt
      );
    }

    let existing = await StaticHealthBot.findOne({ createdBy: userId });

    if (existing) {
      existing.prompts.push({ prompt, response: botReply });
      await existing.save();
    } else {
      await StaticHealthBot.create({
        createdBy: userId,
        prompts: [{ prompt, response: botReply }],
      });
    }

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: botReply,
      message: "Query processed successfully.",
    });
  } catch (error) {
    console.error("askQuestion error:", error);
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Failed to process the question.",
    });
  }
};

export default {
  addModule,
  addPrompts,
  getPrompts,
  deleteRecords,
  updateData,
  askQuestion,
};
