import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import QuizModel from "../models/quiz.model.js";
import ResultModel from "../models/result.model.js";
import enumConfig from "../config/enum.config.js";
import QuestionModel from "../models/question.model.js";
import helper from "../helper/common.helper.js";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";
import fileUploadService from "../services/file.upload.service.js";

const createQuiz = async (req, res) => {
  try {
    const data = req.body;
    data.createdBy = req.user._id;
    let file = req.file;

    const findTitle = await QuizModel.findOne({ title: data.title });
    if (findTitle) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
        message: "This title is already exist.",
      });
    }

    if (file) {
      data.image = await fileUploadService.uploadFile({
        buffer: file.buffer,
        mimetype: file.mimetype,
      });
    }

    const createQuiz = await QuizModel.create(data);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUIZ.CREATE,
      activityCategory: enumConfig.activityCategoryEnum.QUIZ,
      description: activityDescriptions.QUIZ.CREATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });
    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      data: createQuiz,
      message: "Quiz created successfully.",
    });
  } catch (error) {
    console.log(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUIZ.CREATE,
      activityCategory: enumConfig.activityCategoryEnum.QUIZ,
      description: error.message || "Failed to create quiz.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
    });
  }
};

const getQuizForAdmin = async (req, res) => {
  try {
    const pagination = helper.paginationFun(req.query);

    const result = await QuizModel.find({ createdBy: req.user.id })
      .populate("createdBy", "email fullName profileImage role")
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ createdAt: -1 });

    let count = await QuizModel.countDocuments({ createdBy: req.user.id });
    let paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: count,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUIZ.GET,
      activityCategory: enumConfig.activityCategoryEnum.QUIZ,
      description: activityDescriptions.QUIZ.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      pagination: paginationData,
      data: result,
      message: "Quiz fetch successfully.",
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUIZ.GET,
      activityCategory: enumConfig.activityCategoryEnum.QUIZ,
      description: error.message || "Failed to fetch quiz.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
    });
  }
};

const getUserQuizzes = async (req, res) => {
  try {
    const userId = req.user._id;
    const pagination = helper.paginationFun(req.query);

    const quizzes = await QuizModel.find()
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ createdAt: -1 });

    const resultList = await Promise.all(
      quizzes.map(async (quiz) => {
        const result = await ResultModel.findOne({
          quiz: quiz._id,
          attemptBy: userId,
        }).sort({ createdAt: -1 });

        let status = "Start";
        let percentage = 0;
        let timeTaken = 0;
        let answeredQuestions = 0;

        if (result) {
          answeredQuestions = result.answers.length;

          // if (
          //   result.progressStatus ===
          //     enumConfig.progressStatusEnums.IN_PROGRESS ||
          //   result.resultStatus === enumConfig.resultStatusEnums.PENDING
          // ) {
          //   status = "Active";
          //   timeTaken = Math.floor(
          //     (Date.now() - new Date(result.createdAt)) / 1000
          //   );
          // } else

          if (
            result.progressStatus === enumConfig.progressStatusEnums.COMPLETED
          ) {
            status = "Completed";
            percentage = result.percentage;
            timeTaken = result.timeTaken;
          } else if (
            result.progressStatus === enumConfig.progressStatusEnums.TIMEOUT
          ) {
            status = "Restart";
            percentage = 0;
            timeTaken = 0;
          }
        }

        return {
          _id: quiz._id,
          title: quiz.title,
          image: quiz.image,
          totalQuestions: quiz.totalQuestions,
          answeredQuestions: answeredQuestions,
          timeLimit: quiz.timeLimit,
          status,
          percentage,
          timeTaken,
        };
      })
    );

    let count = await QuizModel.countDocuments(resultList);
    let paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: count,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUIZ.FETCH_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.QUIZ,
      description: activityDescriptions.QUIZ.FETCH_STATUS,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: "Quiz status fetched successfully.",
      pagination: paginationData,
      data: resultList,
    });
  } catch (error) {
    console.error("getUserQuizzes error:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUIZ.FETCH_STATUS,
      activityCategory: enumConfig.activityCategoryEnum.QUIZ,
      description: error.message || "Failed to fetch quiz status.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      message: "Something went wrong",
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }
};

const updateQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    let file = req.file;

    const find = await QuizModel.findById(id);
    if (!find) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Quiz not found.",
      });
    }

    const isStarted = await ResultModel.find({
      quiz: id,
      progressStatus: enumConfig.progressStatusEnums.IN_PROGRESS,
    });

    if (isStarted.length > 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
        message:
          "Quiz cannot be updated because it has already been started by users.",
      });
    }

    if (file) {
      if (find.image && find.image.startsWith("https://")) {
        await fileUploadService.deleteFile({ url: find.image });
      }

      data.image = await fileUploadService.uploadFile({
        buffer: file.buffer,
        mimetype: file.mimetype,
      });
    }

    const result = await QuizModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );

    // ✅ If timeLimit or totalQuestions changed, update timeLimitPerQue for all questions
    if (
      (data.totalQuestions && data.totalQuestions !== find.totalQuestions) ||
      (data.timeLimit && data.timeLimit !== find.timeLimit)
    ) {
      if (result.timeLimit && result.totalQuestions > 0) {
        const newTimeLimitPerQue = result.timeLimit / result.totalQuestions;

        await QuestionModel.updateMany(
          { quiz: id },
          { $set: { timeLimitPerQue: newTimeLimitPerQue } }
        );
      }
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUIZ.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.QUIZ,
      description: activityDescriptions.QUIZ.UPDATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: result,
      message: "Quiz updated successfully.",
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUIZ.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.QUIZ,
      description: error.message || "Failed to update quiz status.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
    });
  }
};

const deleteQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const find = await QuizModel.findById(id);
    if (!find) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Quiz not found.",
      });
    }

    const isStarted = await ResultModel.find({
      quiz: id,
      progressStatus: enumConfig.progressStatusEnums.IN_PROGRESS,
    });

    if (isStarted.length > 0) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
        message:
          "Quiz cannot be updated because it has already been started by users.",
      });
    }

    await QuizModel.findByIdAndDelete(id);
    await QuestionModel.deleteMany({ quiz: id, createdBy: req.user.id });
    await ResultModel.deleteMany({ quiz: id });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUIZ.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.QUIZ,
      description: activityDescriptions.QUIZ.DELETE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: null,
      message: "Quiz deleted successfully.",
    });
  } catch (error) {
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUIZ.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.QUIZ,
      description: error.message || "Failed to fetch quiz status.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      message: "Internal server error.",
    });
  }
};

export default {
  createQuiz,
  getUserQuizzes,
  getQuizForAdmin,
  updateQuiz,
  deleteQuiz,
};
