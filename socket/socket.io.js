import { Server } from "socket.io";
import { socketConfig } from "./socket.config.js";
import enumConfig from "../config/enum.config.js";
import { socketHandler } from "../controllers/requestForCaregivers.controller.js";
import { socketForGetDashboard } from "../controllers/dashboard.controller.js";
import { socketForChat } from "../controllers/video-call-chat.controller.js"; // ✅ Add this line


const initializeSocket = (server) => {
  const io = new Server(server, socketConfig);

  io.use((socket, next) => {
    const userId =
      socket.handshake.auth?.token || socket.handshake.query?.userId;
    const role = socket.handshake.auth?.role || socket.handshake.query?.role;

    if (!userId) {
      return next(new Error("Authentication error: Missing userId"));
    }

    socket.user = {
      _id: userId,
    };

    // Attach role only if it exists
    if (role) {
      socket.user.role = role;
    }

    next();
  });

  io.on("connection", (socket) => {
    console.log(
      `⚡ New user connected: ${socket.id} | UserID: ${socket.user._id}`
    );

    socket.join(socket.user._id.toString());
    console.log(`✅ User ${socket.user._id} joined their room`);

    // --- for manage caregiver invites ---
    socketHandler(io, socket);

    // --- fetch dashboard ---
    socketForGetDashboard(io, socket);

    socketForChat(io, socket); 

    socket.on(enumConfig.socketEventEnums.SEND_MESSAGE, (data) => {
      console.log("📩 Message received:", data);
      io.emit("receiveMessage", data);
    });

    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${socket.id}`);
    });
  });

  return io;
};

export default initializeSocket;
