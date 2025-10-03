// controllers/chat.controller.js
import ConsultationModel from "../models/consultation.model.js";
import VideoCallChatMessageModel from "../models/video-call-chat.model.js";
import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";

export const socketForChat = (io, socket) => {
  socket.on("chat:join", async ({ consultationId }) => {
    try {
      const userId = socket?.user?._id;
      console.log("📥 chat:join requested");
      console.log("🔑 User ID:", userId);
      console.log("🆔 Consultation ID:", consultationId);

      const consultation = await ConsultationModel.findById(consultationId);

      if (!consultation) {
        console.log("❌ Consultation not found:", consultationId);
        return socket.emit(
          "chat:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.NOT_FOUND,
            message: "Consultation not found.",
          })
        );
      }

      console.log("✅ Consultation found:", consultation._id);
      console.log("👨‍⚕️ Doctor ID:", consultation.doctor);
      console.log("🧑‍🤝‍🧑 Patient ID:", consultation.patient);

      const isParticipant =
        consultation.doctor.toString() === userId.toString() ||
        consultation.patient.toString() === userId.toString();

      if (!isParticipant) {
        console.log("🚫 User is NOT a participant in this consultation.");
        return socket.emit(
          "chat:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.FORBIDDEN,
            message: "You are not part of this consultation.",
          })
        );
      }

      if (!consultation.isActive) {
        consultation.isActive = true;
        await consultation.save();
        console.log("🟢 Consultation marked as active.");
      }

      socket.join(consultationId);
      console.log(`✅ User ${userId} joined room ${consultationId}`);

      socket.emit(
        "chat:joined",
        apiResponse({
          status: true,
          statusCode: StatusCodes.OK,
          message: "Joined video consultation.",
          data: {
            consultationId,
            joinedBy: userId,
          },
        })
      );
    } catch (err) {
      console.error("❌ chat:join error:", err);
      socket.emit(
        "chat:error",
        apiResponse({
          status: false,
          statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
          message: "Unable to join consultation.",
        })
      );
    }
  });

  socket.on(
    "chat:send",
    async ({ consultationId, message, media = null, mediaType = null }) => {
      try {
        const senderId = socket?.user?._id;

        const consultation = await ConsultationModel.findById(consultationId);
        if (!consultation) {
          return socket.emit(
            "chat:error",
            apiResponse({
              status: false,
              statusCode: StatusCodes.NOT_FOUND,
              message: "Consultation not found.",
            })
          );
        }

        const isParticipant =
          consultation.doctor.toString() === senderId.toString() ||
          consultation.patient.toString() === senderId.toString();

        if (!isParticipant) {
          return socket.emit(
            "chat:error",
            apiResponse({
              status: false,
              statusCode: StatusCodes.FORBIDDEN,
              message: "You are not part of this consultation.",
            })
          );
        }

        const receiverId =
          consultation.doctor.toString() === senderId.toString()
            ? consultation.patient.toString()
            : consultation.doctor.toString();

        const saved = await VideoCallChatMessageModel.create({
          consultationId,
          sender: senderId,
          receiver: receiverId,
          message,
          media,
          mediaType,
        });

        const payload = {
          _id: saved._id,
          consultationId,
          sender: senderId,
          receiver: receiverId,
          message,
          media,
          mediaType,
          createdAt: saved.createdAt,
        };

        console.log(payload);

        io.to(consultationId).emit(
          "chat:receive",
          apiResponse({
            status: true,
            statusCode: StatusCodes.OK,
            data: payload,
          })
        );

        console.log(
          `📤 chat:send → User ${senderId} → ${receiverId} in room ${consultationId}`
        );
      } catch (err) {
        console.error("❌ chat:send error:", err);
        socket.emit(
          "chat:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            message: "Failed to send message.",
          })
        );
      }
    }
  );
};
