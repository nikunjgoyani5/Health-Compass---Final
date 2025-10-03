import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import nodemailer from "nodemailer";
import config from "../config/config.js";
import SupportRequest from "../models/support.model.js";
import enums from "../config/enum.config.js";
import helper from "../services/file.upload.service.js";
import activityLogService from "../services/activity-log.service.js";
import enumConfig from "../config/enum.config.js";
import activityDescriptions from "../config/activity-description.config.js";

const sendRequestToSupport = async (req, res) => {
  try {
    const { email, subject, description } = req.body;
    const userId = req.user.id;

    let fileUrl = null;
    if (req.file) {
      fileUrl = await helper.uploadFile(
        req.file,
        config.bucketStorageFolders.SUPPORT_REQUEST
      );
    }

    console.log("File uploaded to:", fileUrl);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.nodemailer.supportEmail,
        pass: config.nodemailer.supportPassword,
      },
    });

    const mailOptions = {
      from: config.nodemailer.supportEmail,
      replyTo: email,
      to: config.nodemailer.supportEmail,
      subject: subject,
      text: `${description}\n\nAttachment: ${fileUrl}`,
    };

    await transporter.sendMail(mailOptions);

    // Send email
    const supportRequest = new SupportRequest({
      email,
      subject,
      description,
      userId,
      attachment: fileUrl,
    });

    await supportRequest.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.SUPPORT.SENT_REQ,
      activityCategory: enumConfig.activityCategoryEnum.SUPPORT,
      description: activityDescriptions.SUPPORT.SENT_REQ,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Support request sent successfully!",
      statusCode: StatusCodes.OK,
      attachmentUrl: fileUrl,
    });
  } catch (error) {
    console.error("Error:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.SUPPORT.SENT_REQ,
      activityCategory: enumConfig.activityCategoryEnum.SUPPORT,
      description: error.message || "Failed to send support request.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Failed to send support request.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

const updateRequestStatus = async (req, res) => {
  const { requestId } = req.params;
  const { status } = req.body;

  if (
    ![enums.statusSupportEnum.OPEN, enums.statusSupportEnum.CLOSE].includes(
      status
    )
  ) {
    return apiResponse({
      res,
      status: false,
      message: "Invalid status value. Allowed values are 'open' or 'close'.",
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  try {
    const supportRequest = await SupportRequest.findById({ _id: requestId });

    if (!supportRequest) {
      return apiResponse({
        res,
        status: false,
        message: "Request not found.",
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    supportRequest.status = status;
    await supportRequest.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.SUPPORT.UPDATE_REQ_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.SUPPORT,
      description: activityDescriptions.SUPPORT.UPDATE_REQ_STATUS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Request status updated successfully.",
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.SUPPORT.UPDATE_REQ_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.SUPPORT,
      description: error.message || "Failed to update support request.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      message: "Failed to update request status.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

const getSupportRequestList = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    // Check if user has admin role
    const isAdmin = req.user.role.includes(enumConfig.userRoleEnum.ADMIN);

    // If not admin → show only their own tickets
    if (!isAdmin) {
      filter.userId = req.user.id;
    }

    if (status) {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    const supportRequests = await SupportRequest.find(filter)
      // .populate("userId", "email fullName profileImage")
      .sort({ createdAt: -1 });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.SUPPORT.GET,
      activityCategory: enumConfig.activityCategoryEnum.SUPPORT,
      description: activityDescriptions.SUPPORT.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      message: "Support requests fetched successfully.",
      data: supportRequests,
      statusCode: StatusCodes.OK,
    });
  } catch (error) {
    console.error(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.SUPPORT.GET,
      activityCategory: enumConfig.activityCategoryEnum.SUPPORT,
      description: error.message || "Failed to  support request.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      message: "Failed to fetch support requests.",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

export default {
  sendRequestToSupport,
  updateRequestStatus,
  getSupportRequestList,
};
