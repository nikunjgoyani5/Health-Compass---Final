import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import QuestionModel from "../models/question.model.js";
import QuizModel from "../models/quiz.model.js";
import ResultModel from "../models/result.model.js";
import enumConfig from "../config/enum.config.js";
import helper from "../helper/common.helper.js";
import activityLogService from "../services/activity-log.service.js";
import activityDescriptions from "../config/activity-description.config.js";

const createQuestion = async (req, res) => {
  try {
    const data = req.body;
    const userId = req.user?._id;

    const quiz = await QuizModel.findById(data.quiz);
    if (!quiz) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Quiz not found.",
      });
    }

    const existingQuestions = await QuestionModel.find({ quiz: data.quiz });

    if (existingQuestions.length >= quiz.totalQuestions) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
        message: `You can't add more than ${quiz.totalQuestions} questions in this quiz.`,
      });
    }

    const duplicateQuestion = existingQuestions.find(
      (q) => q.questionText.trim() === data.questionText.trim()
    );

    if (duplicateQuestion) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.CONFLICT,
        data: null,
        message: "This question already exists in the quiz.",
      });
    }

    let timeLimitPerQue = null;
    if (quiz.timeLimit && quiz.totalQuestions > 0) {
      timeLimitPerQue = quiz.timeLimit / quiz.totalQuestions;
    }

    const newQuestion = await QuestionModel.create({
      ...data,
      createdBy: userId,
      timeLimitPerQue,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUESTION.ADD,
      activityCategory: enumConfig.activityCategoryEnum.QUESTION,
      description: activityDescriptions.QUESTION.ADD,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.CREATED,
      data: newQuestion,
      message: "Question created successfully.",
    });
  } catch (error) {
    console.error("Error in createQuestion:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUESTION.ADD,
      activityCategory: enumConfig.activityCategoryEnum.QUESTION,
      description: error.message || "Failed to add question.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

const getQuestion = async (req, res) => {
  try {
    const { id } = req.query;
    const filter = {};
    const { quizId } = req.query;

    if (id) filter._id = id;
    if (quizId) filter.quiz = quizId;

    const pagination = helper.paginationFun(req.query);

    let result, count, paginationData;
    if (req.user.role?.includes(enumConfig.userRoleEnum.ADMIN)) {
      result = await QuestionModel.find(filter)
        .populate("createdBy", "fullName email profileImage role")
        .skip(pagination.skip)
        .limit(pagination.limit)
        .sort({ createdAt: -1 });
      count = await QuestionModel.countDocuments(filter);
      paginationData = helper.paginationDetails({
        limit: pagination.limit,
        page: req.query.page,
        totalItems: count,
      });
    } else {
      result = await QuestionModel.find(filter)
        // .select("-correctAnswer")
        .skip(pagination.skip)
        .limit(pagination.limit)
        .sort({ createdAt: -1 });
      count = await QuestionModel.countDocuments(filter);
      paginationData = helper.paginationDetails({
        limit: pagination.limit,
        page: req.query.page,
        totalItems: count,
      });
    }

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUESTION.GET,
      activityCategory: enumConfig.activityCategoryEnum.QUESTION,
      description: activityDescriptions.QUESTION.GET,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      pagination: paginationData,
      data: result,
      message: "Questions fetch successfully.",
    });
  } catch (error) {
    console.log(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUESTION.GET,
      activityCategory: enumConfig.activityCategoryEnum.QUESTION,
      description: error.message || "Failed to fetch question.",
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

const updateQuestion = async (req, res) => {
  try {
    const { id } = req.params; // question id
    const data = req.body;

    const question = await QuestionModel.findById(id);
    if (!question) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Question not found.",
      });
    }

    const quizId = question.quiz;

    const isQuizInProgress = await ResultModel.exists({
      quiz: quizId,
      progressStatus: enumConfig.progressStatusEnums.IN_PROGRESS,
    });

    if (isQuizInProgress) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
        message:
          "This question can't be updated as the quiz is currently in progress.",
      });
    }

    // ✅ Fetch quiz details to recalculate timeLimitPerQue
    const quiz = await QuizModel.findById(quizId);
    if (quiz?.timeLimit && quiz?.totalQuestions > 0) {
      data.timeLimitPerQue = quiz.timeLimit / quiz.totalQuestions;
    }

    const updatedQuestion = await QuestionModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUESTION.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.QUESTION,
      description: activityDescriptions.QUESTION.UPDATE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: updatedQuestion,
      message: "Question updated successfully.",
    });
  } catch (error) {
    console.error("Error in updateQuestion:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUESTION.UPDATE,
      activityCategory: enumConfig.activityCategoryEnum.QUESTION,
      description: error.message || "Failed to update question.",
      status: enumConfig.activityStatusEnum.ERROR,
    });

    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    const { id } = req.params;

    const question = await QuestionModel.findById(id);
    if (!question) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        data: null,
        message: "Question not found.",
      });
    }

    const quizId = question.quiz;

    const isQuizInProgress = await ResultModel.exists({
      quiz: quizId,
      progressStatus: enumConfig.progressStatusEnums.IN_PROGRESS,
    });

    if (isQuizInProgress) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        data: null,
        message:
          "This question can't be deleted as the quiz is currently in progress.",
      });
    }

    await QuestionModel.findByIdAndDelete(id);

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUESTION.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.QUESTION,
      description: activityDescriptions.QUESTION.DELETE,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      data: null,
      message: "Question deleted successfully.",
    });
  } catch (error) {
    console.error("Error in deleteQuestion:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.QUESTION.DELETE,
      activityCategory: enumConfig.activityCategoryEnum.QUESTION,
      description: error.message || "Failed to delete question.",
      status: enumConfig.activityStatusEnum.ERROR,
    });
    return apiResponse({
      res,
      status: false,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      data: null,
      message: "Internal server error.",
    });
  }
};

export default {
  createQuestion,
  getQuestion,
  updateQuestion,
  deleteQuestion,
};
