import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import RequestModel from "../models/requestForCaregivers.model.js";
import UserModel from "../models/user.model.js";
import enums from "../config/enum.config.js";
import emailService from "../services/email.service.js";
import { sendPushNotificationAndSave } from "../services/notification.service.js";
import smsService from "../services/sms.service.js";
import config from "../config/config.js";
import dayjs from "dayjs";

console.log("📁 [CAREGIVER CONTROLLER] File loaded successfully at", new Date().toISOString());

export const socketHandler = (io, socket) => {
  console.log("🔌 [SOCKET HANDLER] Caregiver request socket handler initialized");
  console.log("🔌 [SOCKET HANDLER] Socket ID:", socket.id);
  console.log("🔌 [SOCKET HANDLER] User:", socket?.user ? "Authenticated" : "Not authenticated");

  const enrichUser = (user) => {
    return {
      _id: user._id,
      email: user.email,
      fullName: user.fullName,
      profileImage: user.profileImage,
      inviteCode: user.inviteCode,
    };
  };

  // socket.on("request:send", async (data) => {
  //   try {
  //     const { receiverId } = data;
  //     const senderId = socket?.user?._id;

  //     if (receiverId === String(senderId)) {
  //       return socket.emit(
  //         "request:send:error",
  //         apiResponse({
  //           status: false,
  //           statusCode: StatusCodes.BAD_REQUEST,
  //           message: "You cannot send a caregiver request to yourself.",
  //         })
  //       );
  //     }

  //     const [sender, receiver] = await Promise.all([
  //       UserModel.findById(senderId).lean(),
  //       UserModel.findById(receiverId).lean(),
  //     ]);

  //     if (!sender || !receiver) {
  //       return socket.emit(
  //         "request:send:error",
  //         apiResponse({
  //           status: false,
  //           statusCode: StatusCodes.NOT_FOUND,
  //           message: "One of the users was not found.",
  //         })
  //       );
  //     }

  //     const alreadyExists =
  //       sender.iCareFor?.includes(receiver._id) ||
  //       receiver.myCaregivers?.includes(sender._id);

  //     if (alreadyExists) {
  //       return socket.emit(
  //         "request:send:error",
  //         apiResponse({
  //           status: false,
  //           statusCode: StatusCodes.CONFLICT,
  //           message: "You are already in a caregiver relationship.",
  //         })
  //       );
  //     }

  //     const existingRequest = await RequestModel.findOne({
  //       sender: senderId,
  //       receiver: receiverId,
  //       status: enums.requestStatusEnum.PENDING,
  //     });

  //     if (existingRequest) {
  //       return socket.emit(
  //         "request:send:error",
  //         apiResponse({
  //           status: false,
  //           statusCode: StatusCodes.CONFLICT,
  //           message: "Caregiver request already pending.",
  //         })
  //       );
  //     }

  //     const request = await RequestModel.create({
  //       sender: senderId,
  //       receiver: receiverId,
  //       status: enums.requestStatusEnum.PENDING,
  //     });

  //     const responsePayload = {
  //       _id: request._id,
  //       sender: enrichUser(sender),
  //       receiver: enrichUser(receiver),
  //       status: request.status,
  //       createdAt: request.createdAt,
  //     };

  //     // Send email notification to the receiver
  //     try {
  //       const dashboardLink = `https://health-compass-60829.web.app/caregiver-requests`;
  //       const requestDate = dayjs(request.createdAt).format("DD/MM/YYYY HH:mm");

  //       await emailService.sendCaregiverInviteEmail({
  //         email: receiver.email,
  //         caregiverName: receiver.fullName,
  //         requesterName: sender.fullName,
  //         requestDate: requestDate,
  //         dashboardLink: dashboardLink,
  //         brandName: "Health Compass",
  //       });
  //     } catch (emailError) {
  //       console.error("Failed to send caregiver invite email:", emailError);
  //       // Don't fail the request if email fails
  //     }

  //     socket.emit(
  //       "request:send:success",
  //       apiResponse({
  //         status: true,
  //         statusCode: StatusCodes.CREATED,
  //         message: "Caregiver request sent successfully.",
  //         data: responsePayload,
  //       })
  //     );

  //     io.to(receiverId.toString()).emit(
  //       "request:incoming",
  //       apiResponse({
  //         status: true,
  //         statusCode: StatusCodes.OK,
  //         message: "New caregiver request received.",
  //         data: responsePayload,
  //       })
  //     );
  //   } catch (err) {
  //     console.error("Caregiver request send error:", err);
  //     socket.emit(
  //       "request:send:error",
  //       apiResponse({
  //         status: false,
  //         statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
  //         message: "Failed to send caregiver request.",
  //       })
  //     );
  //   }
  // });

  console.log("🎯 [SOCKET HANDLER] Registering 'request:send' event listener");
  socket.on("request:send", async (data) => {
    console.log("🎯 [SOCKET EVENT] 'request:send' event triggered!");
    console.log("🎯 [SOCKET EVENT] Event received at:", new Date().toISOString());
    try {
      console.log("🚀 [CAREGIVER REQUEST] Starting request send process");
      console.log("📥 [CAREGIVER REQUEST] Received data:", JSON.stringify(data, null, 2));

      const { receiverId, receiverEmail } = data;
      const senderId = socket?.user?._id;

      console.log("👤 [CAREGIVER REQUEST] Sender ID:", senderId);
      console.log("📧 [CAREGIVER REQUEST] Receiver ID:", receiverId);
      console.log("📧 [CAREGIVER REQUEST] Receiver Email:", receiverEmail);

      // Send immediate test response
      console.log("🧪 [TEST] Sending immediate test response...");
      socket.emit("request:send:test", {
        message: "Event received successfully",
        timestamp: new Date().toISOString(),
        data: data
      });
      console.log("✅ [TEST] Test response sent");

      if (!receiverId && !receiverEmail) {
        console.log("❌ [CAREGIVER REQUEST] Error: No receiver ID or email provided");
        return socket.emit(
          "request:send:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.BAD_REQUEST,
            message: "Receiver ID or Email is required.",
          })
        );
      }

      // Self request check
      if (receiverId && receiverId === String(senderId)) {
        console.log("❌ [CAREGIVER REQUEST] Error: User trying to send request to themselves");
        return socket.emit(
          "request:send:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.BAD_REQUEST,
            message: "You cannot send a caregiver request to yourself.",
          })
        );
      }

      console.log("🔍 [CAREGIVER REQUEST] Looking up sender user...");
      const sender = await UserModel.findById(senderId).lean();
      if (!sender) {
        console.log("❌ [CAREGIVER REQUEST] Error: Sender not found in database");
        return socket.emit(
          "request:send:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.NOT_FOUND,
            message: "Sender not found.",
          })
        );
      }
      console.log("✅ [CAREGIVER REQUEST] Sender found:", sender.fullName, sender.email);

      // Determine if receiver user exists
      let receiver = null;
      let finalEmail = null;

      if (receiverId) {
        console.log("🔍 [CAREGIVER REQUEST] Looking up receiver user by ID...");
        receiver = await UserModel.findById(receiverId).lean();
        if (!receiver) {
          console.log("❌ [CAREGIVER REQUEST] Error: Receiver not found in database");
          return socket.emit(
            "request:send:error",
            apiResponse({
              status: false,
              statusCode: StatusCodes.NOT_FOUND,
              message: "Receiver not found.",
            })
          );
        }
        finalEmail = receiver.email;
        console.log("✅ [CAREGIVER REQUEST] Receiver found:", receiver.fullName, receiver.email);
      } else {
        console.log("📧 [CAREGIVER REQUEST] Using provided email address");
        finalEmail = receiverEmail?.toLowerCase().trim();
        console.log("📧 [CAREGIVER REQUEST] Final email:", finalEmail);
      }

      // Prevent duplicates
      console.log("🔍 [CAREGIVER REQUEST] Checking for existing pending requests...");
      const existingRequest = await RequestModel.findOne({
        sender: senderId,
        receiverEmail: finalEmail,
        status: enums.requestStatusEnum.PENDING,
      });

      if (existingRequest) {
        console.log("❌ [CAREGIVER REQUEST] Error: Duplicate request already exists");
        console.log("📋 [CAREGIVER REQUEST] Existing request ID:", existingRequest._id);
        return socket.emit(
          "request:send:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.CONFLICT,
            message: "Caregiver request already pending.",
          })
        );
      }
      console.log("✅ [CAREGIVER REQUEST] No duplicate request found");

      // Already connected?
      if (receiver) {
        console.log("🔍 [CAREGIVER REQUEST] Checking if users are already connected...");
        const alreadyExists =
          sender.iCareFor?.includes(receiver._id) ||
          receiver.myCaregivers?.includes(sender._id);

        if (alreadyExists) {
          console.log("❌ [CAREGIVER REQUEST] Error: Users already in caregiver relationship");
          return socket.emit(
            "request:send:error",
            apiResponse({
              status: false,
              statusCode: StatusCodes.CONFLICT,
              message: "You are already in a caregiver relationship.",
            })
          );
        }
        console.log("✅ [CAREGIVER REQUEST] No existing relationship found");
      }

      // Create request
      console.log("📝 [CAREGIVER REQUEST] Creating new request in database...");
      const request = await RequestModel.create({
        sender: senderId,
        receiver: receiver ? receiver._id : null,
        receiverEmail: finalEmail,
        status: enums.requestStatusEnum.PENDING,
      });
      console.log("✅ [CAREGIVER REQUEST] Request created successfully with ID:", request._id);

      const responsePayload = {
        _id: request._id,
        sender: {
          _id: sender._id,
          fullName: sender.fullName,
          email: sender.email,
          profileImage: sender.profileImage,
        },
        receiver: receiver
          ? {
            _id: receiver._id,
            fullName: receiver.fullName,
            email: receiver.email,
            profileImage: receiver.profileImage,
          }
          : null,
        receiverEmail: finalEmail,
        status: request.status,
        createdAt: request.createdAt,
      };

      // Send email notification
      console.log("📧 [CAREGIVER REQUEST] Starting email notification process...");
      try {
        const dashboardLink = `https://health-compass-60829.web.app/caregiver-requests`;
        const requestDate = dayjs(request.createdAt).format("DD/MM/YYYY HH:mm");

        console.log("📧 [CAREGIVER REQUEST] Email details:");
        console.log("  - To:", finalEmail);
        console.log("  - Caregiver Name:", receiver ? receiver.fullName : finalEmail);
        console.log("  - Requester Name:", sender.fullName);
        console.log("  - Request Date:", requestDate);
        console.log("  - Dashboard Link:", dashboardLink);
        console.log("  - Full URL:", `https://health-compass-60829.web.app/caregiver-requests`);

        console.log("📧 [CAREGIVER REQUEST] Calling email service...");
        const emailResult = await emailService.sendCaregiverInviteEmail({
          email: finalEmail,
          caregiverName: receiver ? receiver.fullName : finalEmail,
          requesterName: sender.fullName,
          requestDate,
          dashboardLink,
          brandName: "Health Compass",
        });

        console.log("✅ [CAREGIVER REQUEST] Email sent successfully:", emailResult);
      } catch (emailError) {
        console.error("❌ [CAREGIVER REQUEST] Failed to send caregiver invite email:", emailError);
        console.error("❌ [CAREGIVER REQUEST] Email error details:", {
          message: emailError.message,
          stack: emailError.stack,
          code: emailError.code
        });
      }

      console.log("📤 [CAREGIVER REQUEST] Sending success response to sender...");
      const successResponse = apiResponse({
        status: true,
        statusCode: StatusCodes.CREATED,
        message: "Caregiver request sent successfully.",
        data: responsePayload,
      });

      console.log("📤 [CAREGIVER REQUEST] Success response data:", JSON.stringify(successResponse, null, 2));

      socket.emit("request:send:success", successResponse);
      console.log("✅ [CAREGIVER REQUEST] Success response sent to sender via 'request:send:success' event");

      // Realtime notify only if receiver exists in app
      if (receiver) {
        console.log("📱 [CAREGIVER REQUEST] Sending realtime notification to receiver...");
        console.log("📱 [CAREGIVER REQUEST] Receiver socket room:", receiver._id.toString());
        io.to(receiver._id.toString()).emit(
          "request:incoming",
          apiResponse({
            status: true,
            statusCode: StatusCodes.OK,
            message: "New caregiver request received.",
            data: responsePayload,
          })
        );
        console.log("✅ [CAREGIVER REQUEST] Realtime notification sent to receiver");
      } else {
        console.log("ℹ️ [CAREGIVER REQUEST] No realtime notification sent (receiver not in app)");
      }
    } catch (err) {
      console.error("❌ [CAREGIVER REQUEST] Unexpected error occurred:", err);
      console.error("❌ [CAREGIVER REQUEST] Error details:", {
        message: err.message,
        stack: err.stack,
        name: err.name,
        code: err.code
      });

      const errorResponse = apiResponse({
        status: false,
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
        message: "Failed to send caregiver request.",
      });

      console.log("📤 [CAREGIVER REQUEST] Error response data:", JSON.stringify(errorResponse, null, 2));

      socket.emit("request:send:error", errorResponse);
      console.log("📤 [CAREGIVER REQUEST] Error response sent to sender via 'request:send:error' event");
    }
  });

  // socket.on("request:updateStatus", async (data) => {
  //   try {
  //     const { requestId, status } = data;
  //     const request = await RequestModel.findById(requestId);

  //     if (!request) {
  //       return socket.emit(
  //         "request:updateStatus:error",
  //         apiResponse({
  //           status: false,
  //           statusCode: StatusCodes.NOT_FOUND,
  //           message: "Request not found.",
  //         })
  //       );
  //     }

  //     if (request.status !== enums.requestStatusEnum.PENDING) {
  //       return socket.emit(
  //         "request:updateStatus:error",
  //         apiResponse({
  //           status: false,
  //           statusCode: StatusCodes.CONFLICT,
  //           message: `Request is already ${request.status.toLowerCase()}.`,
  //         })
  //       );
  //     }

  //     if (status === enums.requestStatusEnum.REJECTED) {
  //       // Get user details for email before deleting request
  //       const [receiverUser, senderUser] = await Promise.all([
  //         UserModel.findById(request.receiver),
  //         UserModel.findById(request.sender),
  //       ]);

  //       // Send rejection email to requester
  //       if (senderUser && receiverUser) {
  //         try {
  //           const dashboardLink = `https://health-compass-60829.web.app/caregiver-requests`;
  //           const actionDate = dayjs().format("DD/MM/YYYY HH:mm");

  //           await emailService.sendCaregiverRequestStatusEmail({
  //             email: senderUser.email,
  //             status: "Rejected",
  //             requesterName: senderUser.fullName,
  //             caregiverName: receiverUser.fullName,
  //             actionDate: actionDate,
  //             dashboardLink: dashboardLink,
  //             brandName: "Health Compass",
  //           });
  //         } catch (emailError) {
  //           console.error("Failed to send rejection email:", emailError);
  //           // Don't fail the request if email fails
  //         }
  //       }

  //       await RequestModel.findByIdAndDelete(requestId);
  //       return socket.emit(
  //         "request:updateStatus:success",
  //         apiResponse({
  //           status: true,
  //           statusCode: StatusCodes.OK,
  //           message: "Request rejected successfully.",
  //           data: { requestId },
  //         })
  //       );
  //     }

  //     // if (status === enums.requestStatusEnum.ACCEPTED) {
  //     //   const [receiverUser, senderUser] = await Promise.all([
  //     //     UserModel.findById(request.receiver),
  //     //     UserModel.findById(request.sender),
  //     //   ]);

  //     //   if (!receiverUser || !senderUser) {
  //     //     return socket.emit(
  //     //       "request:updateStatus:error",
  //     //       apiResponse({
  //     //         status: false,
  //     //         statusCode: StatusCodes.NOT_FOUND,
  //     //         message: "One of the users was not found.",
  //     //       })
  //     //     );
  //     //   }

  //     //   if (!receiverUser.iCareFor.includes(senderUser._id)) {
  //     //     receiverUser.iCareFor.push(senderUser._id);
  //     //   }
  //     //   if (!senderUser.myCaregivers.includes(receiverUser._id)) {
  //     //     senderUser.myCaregivers.push(receiverUser._id);
  //     //   }

  //     //   await Promise.all([
  //     //     receiverUser.save(),
  //     //     senderUser.save(),
  //     //     RequestModel.findByIdAndDelete(requestId),
  //     //   ]);

  //     //   io.to(request.sender.toString()).emit(
  //     //     "request:accepted:notify",
  //     //     apiResponse({
  //     //       status: true,
  //     //       statusCode: StatusCodes.OK,
  //     //       message: "Your caregiver request has been accepted!",
  //     //       data: { acceptedBy: enrichUser(receiverUser) },
  //     //     })
  //     //   );

  //     //   return socket.emit(
  //     //     "request:updateStatus:success",
  //     //     apiResponse({
  //     //       status: true,
  //     //       statusCode: StatusCodes.OK,
  //     //       message: "Request accepted successfully.",
  //     //       data: { requestId },
  //     //     })
  //     //   );
  //     // }

  //     if (status === enums.requestStatusEnum.ACCEPTED) {
  //       const [receiverUser, senderUser] = await Promise.all([
  //         UserModel.findById(request.receiver),
  //         UserModel.findById(request.sender),
  //       ]);

  //       if (!receiverUser || !senderUser) {
  //         return socket.emit(
  //           "request:updateStatus:error",
  //           apiResponse({
  //             status: false,
  //             statusCode: StatusCodes.NOT_FOUND,
  //             message: "One of the users was not found.",
  //           })
  //         );
  //       }

  //       if (!receiverUser.iCareFor.includes(senderUser._id)) {
  //         receiverUser.iCareFor.push(senderUser._id);
  //       }
  //       if (!senderUser.myCaregivers.includes(receiverUser._id)) {
  //         senderUser.myCaregivers.push(receiverUser._id);
  //       }

  //       const caregiverRole = enums.userRoleEnum.CAREGIVER;
  //       if (!receiverUser.role.includes(caregiverRole)) {
  //         receiverUser.role.push(caregiverRole);
  //       }

  //       await Promise.all([
  //         receiverUser.save(),
  //         senderUser.save(),
  //         RequestModel.findByIdAndDelete(requestId),
  //       ]);

  //       // Send acceptance email to requester
  //       try {
  //         const dashboardLink = `https://health-compass-60829.web.app/caregiver-requests`;
  //         const actionDate = dayjs().format("DD/MM/YYYY HH:mm");

  //         await emailService.sendCaregiverRequestStatusEmail({
  //           email: senderUser.email,
  //           status: "Accepted",
  //           requesterName: senderUser.fullName,
  //           caregiverName: receiverUser.fullName,
  //           actionDate: actionDate,
  //           dashboardLink: dashboardLink,
  //           brandName: "Health Compass",
  //         });
  //       } catch (emailError) {
  //         console.error("Failed to send acceptance email:", emailError);
  //         // Don't fail the request if email fails
  //       }

  //       io.to(request.sender.toString()).emit(
  //         "request:accepted:notify",
  //         apiResponse({
  //           status: true,
  //           statusCode: StatusCodes.OK,
  //           message: "Your caregiver request has been accepted!",
  //           data: { acceptedBy: enrichUser(receiverUser) },
  //         })
  //       );

  //       return socket.emit(
  //         "request:updateStatus:success",
  //         apiResponse({
  //           status: true,
  //           statusCode: StatusCodes.OK,
  //           message: "Request accepted successfully.",
  //           data: { requestId },
  //         })
  //       );
  //     }

  //     socket.emit(
  //       "request:updateStatus:error",
  //       apiResponse({
  //         status: false,
  //         statusCode: StatusCodes.BAD_REQUEST,
  //         message: "Invalid request status update.",
  //       })
  //     );
  //   } catch (err) {
  //     console.error("Error updating request status:", err);
  //     socket.emit(
  //       "request:updateStatus:error",
  //       apiResponse({
  //         status: false,
  //         statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
  //         message: "Failed to update request status.",
  //       })
  //     );
  //   }
  // });



  // ------------------------------
  // UPDATE Caregiver Request Status
  // ------------------------------
  socket.on("request:updateStatus", async (data) => {
    try {
      console.log("🔄 [REQUEST UPDATE] Starting request status update...");
      console.log("📥 [REQUEST UPDATE] Received data:", JSON.stringify(data, null, 2));

      const { requestId, status } = data;
      const request = await RequestModel.findById(requestId);

      console.log("🔍 [REQUEST UPDATE] Request found:", request ? "Yes" : "No");
      if (request) {
        console.log("📧 [REQUEST UPDATE] Request receiverEmail:", request.receiverEmail);
        console.log("👤 [REQUEST UPDATE] Request receiver ID:", request.receiver);
      }

      if (!request) {
        return socket.emit(
          "request:updateStatus:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.NOT_FOUND,
            message: "Request not found.",
          })
        );
      }

      // Check if receiver is registered - either by ID or by email
      let receiverUser = null;
      if (request.receiver) {
        // Receiver is registered by ID
        receiverUser = await UserModel.findById(request.receiver);
      } else if (request.receiverEmail) {
        // Receiver is registered by email
        receiverUser = await UserModel.findOne({ email: request.receiverEmail });
      }

      if (!receiverUser) {
        return socket.emit(
          "request:updateStatus:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.BAD_REQUEST,
            message: "This request cannot be updated until the invited user signs up.",
          })
        );
      }

      console.log("✅ [REQUEST UPDATE] Receiver user found:", receiverUser.email);
      console.log("👤 [REQUEST UPDATE] Receiver user ID:", receiverUser._id);
      console.log("📧 [REQUEST UPDATE] Request receiverEmail:", request.receiverEmail);
      console.log("👤 [REQUEST UPDATE] Request receiver ID:", request.receiver);
      console.log("🔗 [REQUEST UPDATE] Linking receiver ID to request...");

      if (request.status !== enums.requestStatusEnum.PENDING) {
        return socket.emit(
          "request:updateStatus:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.CONFLICT,
            message: `Request is already ${request.status.toLowerCase()}.`,
          })
        );
      }

      // Reject
      if (status === enums.requestStatusEnum.REJECTED) {
        // Get sender user for notification
        const senderUser = await UserModel.findById(request.sender);

        if (senderUser) {
          // Send notifications to sender about rejection
          const rejectionMessage = `Unfortunately, ${receiverUser.fullName} has declined your caregiver request. You can try inviting someone else.`;
          const type = enums.notificationPreferencesEnum.OTHER;
          const senderPreferences = senderUser?.notificationPreferences?.preferences?.[type] || {};

          // 1. Push Notification
          if (senderPreferences.push) {
            await sendPushNotificationAndSave({
              user: senderUser,
              message: rejectionMessage,
              title: "Caregiver Request Declined",
              type,
              image: senderUser?.profileImage,
            });
          }

          // 2. Email Notification
          if (senderPreferences.email) {
            await emailService.sendCaregiverRequestStatusEmail({
              email: senderUser.email,
              fullName: senderUser.fullName,
              caregiverName: receiverUser.fullName,
              status: "rejected",
              message: rejectionMessage,
            });
          }

          // 3. SMS Notification
          if (senderPreferences.sms && senderUser.phoneNumber) {
            await smsService.sendSMS({
              to: `${senderUser.countryCode}${senderUser.phoneNumber}`,
              message: rejectionMessage,
            });
          }
        }

        await RequestModel.findByIdAndDelete(requestId);
        return socket.emit(
          "request:updateStatus:success",
          apiResponse({
            status: true,
            statusCode: StatusCodes.OK,
            message: "Request rejected successfully.",
            data: { requestId },
          })
        );
      }

      // Accept
      if (status === enums.requestStatusEnum.ACCEPTED) {
        const senderUser = await UserModel.findById(request.sender);

        if (!receiverUser || !senderUser) {
          return socket.emit(
            "request:updateStatus:error",
            apiResponse({
              status: false,
              statusCode: StatusCodes.NOT_FOUND,
              message: "One of the users was not found.",
            })
          );
        }

        if (!receiverUser.iCareFor.includes(senderUser._id)) {
          receiverUser.iCareFor.push(senderUser._id);
        }
        if (!senderUser.myCaregivers.includes(receiverUser._id)) {
          senderUser.myCaregivers.push(receiverUser._id);
        }

        const caregiverRole = enums.userRoleEnum.CAREGIVER;
        if (!receiverUser.role.includes(caregiverRole)) {
          receiverUser.role.push(caregiverRole);
        }

        // Update request to link receiver ID
        request.receiver = receiverUser._id;
        await request.save();

        await Promise.all([
          receiverUser.save(),
          senderUser.save(),
          RequestModel.findByIdAndDelete(requestId),
        ]);

        // Send notifications to sender about acceptance
        const acceptanceMessage = `Great news! ${receiverUser.fullName} has accepted your caregiver request. You can now start sharing your health data with them.`;
        const type = enums.notificationPreferencesEnum.OTHER;
        const senderPreferences = senderUser?.notificationPreferences?.preferences?.[type] || {};

        // 1. Push Notification
        if (senderPreferences.push) {
          await sendPushNotificationAndSave({
            user: senderUser,
            message: acceptanceMessage,
            title: "Caregiver Request Accepted! 🎉",
            type,
            image: senderUser?.profileImage,
          });
        }

        // 2. Email Notification
        if (senderPreferences.email) {
          await emailService.sendCaregiverRequestStatusEmail({
            email: senderUser.email,
            fullName: senderUser.fullName,
            caregiverName: receiverUser.fullName,
            status: "accepted",
            message: acceptanceMessage,
          });
        }

        // 3. SMS Notification
        if (senderPreferences.sms && senderUser.phoneNumber) {
          await smsService.sendSMS({
            to: `${senderUser.countryCode}${senderUser.phoneNumber}`,
            message: acceptanceMessage,
          });
        }

        io.to(request.sender.toString()).emit(
          "request:accepted:notify",
          apiResponse({
            status: true,
            statusCode: StatusCodes.OK,
            message: "Your caregiver request has been accepted!",
            data: { acceptedBy: receiverUser },
          })
        );

        return socket.emit(
          "request:updateStatus:success",
          apiResponse({
            status: true,
            statusCode: StatusCodes.OK,
            message: "Request accepted successfully.",
            data: { requestId },
          })
        );
      }

      socket.emit(
        "request:updateStatus:error",
        apiResponse({
          status: false,
          statusCode: StatusCodes.BAD_REQUEST,
          message: "Invalid request status update.",
        })
      );
    } catch (err) {
      console.error("Error updating request status:", err);
      socket.emit(
        "request:updateStatus:error",
        apiResponse({
          status: false,
          statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
          message: "Failed to update request status.",
        })
      );
    }
  });


  // socket.on("request:getAllPending", async () => {
  //   try {
  //     const userId = socket.user._id;
  //     const requests = await RequestModel.find({
  //       receiver: userId,
  //       status: enums.requestStatusEnum.PENDING,
  //     })
  //       .populate({
  //         path: "sender",
  //         select: "_id email fullName profileImage inviteCode",
  //       })
  //       .lean();

  //     const enriched = requests.map((req) => ({
  //       _id: req._id,
  //       sender: req.sender,
  //       status: req.status,
  //       createdAt: req.createdAt,
  //     }));

  //     socket.emit(
  //       "request:getAllPending:success",
  //       apiResponse({
  //         status: true,
  //         statusCode: StatusCodes.OK,
  //         message: "Pending requests fetched successfully.",
  //         data: enriched,
  //       })
  //     );
  //   } catch (err) {
  //     console.error("Error fetching pending requests:", err);
  //     socket.emit(
  //       "request:getAllPending:error",
  //       apiResponse({
  //         status: false,
  //         statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
  //         message: "Failed to fetch pending requests.",
  //       })
  //     );
  //   }
  // });



  // ------------------------------
  // GET Pending Requests
  // ------------------------------

  socket.on("request:getAllPending", async () => {
    try {
      const userId = socket.user._id;
      const currentUser = await UserModel.findById(userId).lean();

      const requests = await RequestModel.find({
        status: enums.requestStatusEnum.PENDING,
        $or: [
          { receiver: userId },
          { receiverEmail: currentUser.email },
        ],
      })
        .populate({
          path: "sender",
          select: "_id email fullName profileImage inviteCode",
        })
        .lean();

      const enriched = requests.map((req) => ({
        _id: req._id,
        sender: req.sender,
        receiverEmail: req.receiverEmail,
        status: req.status,
        createdAt: req.createdAt,
      }));

      socket.emit(
        "request:getAllPending:success",
        apiResponse({
          status: true,
          statusCode: StatusCodes.OK,
          message: "Pending requests fetched successfully.",
          data: enriched,
        })
      );
    } catch (err) {
      console.error("Error fetching pending requests:", err);
      socket.emit(
        "request:getAllPending:error",
        apiResponse({
          status: false,
          statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
          message: "Failed to fetch pending requests.",
        })
      );
    }
  });

  socket.on("user:getSuggestedUsers", async (data) => {
    try {
      const currentUserId = socket.user._id;
      const search = data?.search || "";

      const currentUser = await UserModel.findById(currentUserId)
        .select("myCaregivers")
        .lean();

      if (!currentUser) {
        return socket.emit(
          "user:getSuggestedUsers:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.NOT_FOUND,
            message: "User not found.",
          })
        );
      }

      // ✅ Use only myCaregivers for showing "connected"
      const myCaregiverIds = new Set(
        (currentUser.myCaregivers || []).map((id) => String(id))
      );

      const pendingRequests = await RequestModel.find({
        $or: [{ sender: currentUserId }, { receiver: currentUserId }],
        status: enums.requestStatusEnum.PENDING,
      }).lean();

      const pendingUserIds = new Set();
      pendingRequests.forEach((req) => {
        pendingUserIds.add(String(req.sender));
        pendingUserIds.add(String(req.receiver));
      });

      let query = {
        _id: { $ne: currentUserId },
        is_deleted: false,
        $or: [
          { is_caregiver_block: false },
          { is_caregiver_block: { $exists: false } },
        ],
      };

      if (search.trim()) {
        query = {
          ...query,
          $or: [
            { fullName: { $regex: search.trim(), $options: "i" } },
            { email: { $regex: search.trim(), $options: "i" } },
          ],
        };
      }

      const users = await UserModel.find(query)
        .select("_id email fullName profileImage inviteCode")
        .lean();

      const userIdsInDb = new Set(users.map((u) => String(u._id)));

      const missingCaregiverIds = Array.from(myCaregiverIds).filter(
        (id) => !userIdsInDb.has(id)
      );

      const missingCaregivers = missingCaregiverIds.length
        ? await UserModel.find({ _id: { $in: missingCaregiverIds } })
          .select("_id email fullName profileImage inviteCode")
          .lean()
        : [];

      const combined = [...users, ...missingCaregivers];

      const uniqueUserMap = {};
      combined.forEach((user) => {
        const userIdStr = String(user._id);
        uniqueUserMap[userIdStr] = user;
      });

      const allUsers = Object.values(uniqueUserMap);

      const suggestedUsers = allUsers.map((user) => {
        const userIdStr = String(user._id);
        let relationshipStatus = "none";

        if (myCaregiverIds.has(userIdStr)) {
          relationshipStatus = "connected";
        } else if (pendingUserIds.has(userIdStr)) {
          relationshipStatus = "pending";
        }

        return {
          ...user,
          relationshipStatus,
        };
      });

      socket.emit(
        "user:getSuggestedUsers:success",
        apiResponse({
          status: true,
          statusCode: StatusCodes.OK,
          message: "Suggested users fetched successfully.",
          data: suggestedUsers,
        })
      );
    } catch (err) {
      socket.emit(
        "user:getSuggestedUsers:error",
        apiResponse({
          status: false,
          statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
          message: "Failed to fetch suggested users.",
        })
      );
    }
  });

  socket.on("request:removeCaregiver", async (data) => {
    try {
      const { caregiverId } = data;
      const userId = socket?.user?._id;

      if (!caregiverId || !userId) {
        return socket.emit(
          "request:removeCaregiver:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.BAD_REQUEST,
            message: "Invalid caregiver or user ID.",
          })
        );
      }

      if (caregiverId === String(userId)) {
        return socket.emit(
          "request:removeCaregiver:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.BAD_REQUEST,
            message: "You cannot remove yourself.",
          })
        );
      }

      const [user, caregiver] = await Promise.all([
        UserModel.findById(userId),
        UserModel.findById(caregiverId),
      ]);

      if (!user || !caregiver) {
        return socket.emit(
          "request:removeCaregiver:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.NOT_FOUND,
            message: "One of the users was not found.",
          })
        );
      }

      const originalMyCaregivers = [...(user.myCaregivers || [])];
      const originalICareFor = [...(caregiver.iCareFor || [])];

      user.myCaregivers = user.myCaregivers.filter(
        (id) => id.toString() !== caregiverId.toString()
      );

      caregiver.iCareFor = caregiver.iCareFor.filter(
        (id) => id.toString() !== userId.toString()
      );

      // ✅ Remove caregiver role if no iCareFor relationships remain
      const caregiverRole = enums.userRoleEnum.CAREGIVER;
      if (
        caregiver.iCareFor.length === 0 &&
        caregiver.role.includes(caregiverRole)
      ) {
        caregiver.role = caregiver.role.filter((r) => r !== caregiverRole);
      }

      const noChange =
        originalMyCaregivers.length === user.myCaregivers.length &&
        originalICareFor.length === caregiver.iCareFor.length;

      if (noChange) {
        return socket.emit(
          "request:removeCaregiver:error",
          apiResponse({
            status: false,
            statusCode: StatusCodes.NOT_FOUND,
            message: "No caregiver relationship found to remove.",
            data: null,
          })
        );
      }

      await Promise.all([user.save(), caregiver.save()]);

      // Notify both users
      socket.emit(
        "request:removeCaregiver:success",
        apiResponse({
          status: true,
          statusCode: StatusCodes.OK,
          message: "Caregiver removed successfully.",
          data: { caregiverId },
        })
      );

      io.to(caregiverId.toString()).emit(
        "request:removedByUser",
        apiResponse({
          status: true,
          statusCode: StatusCodes.OK,
          message: "You have been removed as a caregiver.",
          data: { removedBy: enrichUser(user) },
        })
      );
    } catch (err) {
      console.error("Error removing caregiver:", err);
      socket.emit(
        "request:removeCaregiver:error",
        apiResponse({
          status: false,
          statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
          message: "Failed to remove caregiver.",
        })
      );
    }
  });

};
