import { StatusCodes } from "http-status-codes";
import { apiResponse } from "../helper/api-response.helper.js";
import QuizModel from "../models/quiz.model.js";
import QuestionModel from "../models/question.model.js";
import ResultModel from "../models/result.model.js";
import enumConfig from "../config/enum.config.js";
import mongoose from "mongoose";
import helper from "../helper/common.helper.js";
import activityDescriptions from "../config/activity-description.config.js";
import activityLogService from "../services/activity-log.service.js";

const getDynamicMessage = (progressStatus, resultStatus) => {
  // Timeout case
  if (progressStatus === enumConfig.progressStatusEnums.TIMEOUT) {
    return "Time is up! The quiz has been auto-submitted due to timeout.";
  }

  // Passed case
  if (resultStatus === enumConfig.resultStatusEnums.PASSED) {
    return "Congratulations! You have passed the quiz.";
  }

  // Failed case
  if (resultStatus === enumConfig.resultStatusEnums.FAILED) {
    return "You have failed the quiz. Better luck next time!";
  }

  // Default case if status is not matched (in-progress or pending)
  return "Quiz is in progress. Keep going!";
};

const submitAnswer = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questionId, selectedOption } = req.body;
    const userId = req.user._id;

    const quiz = await QuizModel.findById(quizId);
    if (!quiz) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Quiz not found.",
      });
    }

    const question = await QuestionModel.findById(questionId);
    if (!question) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.NOT_FOUND,
        message: "Question not found.",
      });
    }

    if (question.quiz.toString() !== quizId) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "Question does not belong to this quiz.",
      });
    }

    const now = new Date();

    let result = await ResultModel.findOne({
      quiz: quizId,
      attemptBy: userId,
    }).sort({ createdAt: -1 });

    // If result exists and user already PASSED, don't allow retake
    if (result && result.resultStatus === enumConfig.resultStatusEnums.PASSED) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "You have already passed this quiz. Retake not allowed.",
      });
    }

    // If result doesn't exist or last attempt is PASSED, create a new one
    if (
      !result ||
      (result.resultStatus === enumConfig.resultStatusEnums.FAILED &&
        result.progressStatus === enumConfig.progressStatusEnums.COMPLETED) ||
      (result.resultStatus === enumConfig.resultStatusEnums.TIMEOUT &&
        result.progressStatus === enumConfig.progressStatusEnums.TIMEOUT)
    ) {
      result = await ResultModel.create({
        attemptBy: userId,
        quiz: quizId,
        answers: [],
        timeTaken: 0,
        progressStatus: enumConfig.progressStatusEnums.IN_PROGRESS,
        resultStatus: enumConfig.resultStatusEnums.PENDING,
        createdAt: now,
      });
    }

    // Calculate time taken
    const elapsedSeconds = Math.floor((now - result.createdAt) / 1000);

    // Auto submit if time is up
    if (
      quiz.timeLimit &&
      elapsedSeconds >= quiz.timeLimit &&
      result.progressStatus !== enumConfig.progressStatusEnums.COMPLETED
    ) {
      const correctCount = result.answers.filter((a) => a.isCorrect).length;
      const percentage = (correctCount / quiz.totalQuestions) * 100;

      result.timeTaken = elapsedSeconds;
      result.percentage = percentage;
      result.completedAt = now;
      result.progressStatus = enumConfig.progressStatusEnums.TIMEOUT;
      result.resultStatus = enumConfig.resultStatusEnums.TIMEOUT;

      await result.save();

      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.OK,
        message: "Time is up. Quiz is auto-submitted.",
        data: {
          isCompleted: true,
          resultStatus: result.resultStatus,
          percentage: result.percentage,
        },
      });
    }

    // Don't allow re-answering same question
    const alreadyAnswered = result.answers.find(
      (ans) => ans.question.toString() === questionId
    );
    if (alreadyAnswered) {
      return apiResponse({
        res,
        status: false,
        statusCode: StatusCodes.BAD_REQUEST,
        message: "You have already answered this question.",
      });
    }

    // Verify and save the answer
    const isCorrect = question.correctAnswer === selectedOption;
    result.answers.push({
      question: questionId,
      selectedOption,
      isCorrect,
    });
    result.timeTaken = elapsedSeconds;

    // Check completion
    if (result.answers.length === quiz.totalQuestions) {
      const correctCount = result.answers.filter((a) => a.isCorrect).length;
      const percentage = (correctCount / quiz.totalQuestions) * 100;

      result.percentage = percentage;
      result.completedAt = now;
      result.progressStatus = enumConfig.progressStatusEnums.COMPLETED;
      result.resultStatus =
        percentage >= 50
          ? enumConfig.resultStatusEnums.PASSED
          : enumConfig.resultStatusEnums.FAILED;
    }

    await result.save();

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.RESULT.SUBMIT_ANSWER,
      activityCategory: enumConfig.activityCategoryEnum.RESULT,
      description: activityDescriptions.RESULT.SUBMIT_ANSWER,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    const totalAnswered = result.answers.filter(
      (ans) => ans.selectedOption !== null
    ).length;

    return apiResponse({
      res,
      status: true,
      statusCode: StatusCodes.OK,
      message: getDynamicMessage(result.progressStatus, result.resultStatus),
      data: {
        isCorrect,
        totalAnswered: totalAnswered,
        totalQuestions: quiz.totalQuestions,
        isCompleted:
          result.progressStatus === enumConfig.progressStatusEnums.COMPLETED,
        resultStatus: result.resultStatus,
        progressStatus: result.progressStatus,
        timeLimit: quiz.timeLimit,
        timeTaken: result.timeTaken,
        // percentage: result.percentage,
      },
    });
  } catch (error) {
    console.error("submitAnswer error:", error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.RESULT.SUBMIT_ANSWER,
      activityCategory: enumConfig.activityCategoryEnum.RESULT,
      description: error.message || "Failed to submit answer.",
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

const getResult = async (req, res) => {
  try {
    const filter = {};
    const { id, quizId, progressStatus, resultStatus } = req.query;

    filter.attemptBy = req.user._id;
    if (id) filter._id = new mongoose.Types.ObjectId(id);
    if (quizId) filter.quiz = new mongoose.Types.ObjectId(quizId);
    if (resultStatus) filter.resultStatus = resultStatus;
    if (progressStatus) filter.progressStatus = progressStatus;

    const pagination = helper.paginationFun(req.query);

    const findResult = await ResultModel.find(filter)
      .populate("attemptBy", "fullName email profileImage")
      .populate("quiz", "title description totalQuestions timeLimit image")
      .populate("answers.question", "-createdBy -quiz -createdAt -updatedAt")
      .skip(pagination.skip)
      .limit(pagination.limit)
      .sort({ createdAt: -1 });

    let count = await ResultModel.countDocuments(filter);
    let paginationData = helper.paginationDetails({
      limit: pagination.limit,
      page: req.query.page,
      totalItems: count,
    });

    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.RESULT.FETCH,
      activityCategory: enumConfig.activityCategoryEnum.RESULT,
      description: activityDescriptions.RESULT.FETCH,
      status: enumConfig.activityStatusEnum.SUCCESS,
    });

    return apiResponse({
      res,
      statusCode: StatusCodes.OK,
      status: true,
      pagination: paginationData,
      data: findResult,
      message: "Result fetch successfully.",
    });
  } catch (error) {
    console.log(error);
    await activityLogService.createActivity({
      userId: req.user._id,
      userRole: Array.isArray(req.user.role) ? req.user.role : [req.user.role],
      activityType: enumConfig.activityTypeEnum.RESULT.FETCH,
      activityCategory: enumConfig.activityCategoryEnum.RESULT,
      description: error.message || "Failed to fetch result.",
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
  submitAnswer,
  getResult,
};
