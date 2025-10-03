import ResultModel from "../models/result.model.js";
import enumConfig from "../config/enum.config.js";
import QuizModel from "../models/quiz.model.js";

export const autoSubmitExpiredQuizzes = async () => {
  try {
    const inProgressResults = await ResultModel.find(
      {
        progressStatus: enumConfig.progressStatusEnums.IN_PROGRESS,
      },
      null,
      { skipHook: true }
    ).populate("quiz");

    const now = new Date();

    for (const result of inProgressResults) {
      const quiz = result.quiz;

      if (!quiz || !quiz.timeLimit) continue;

      const elapsedSeconds = Math.floor((now - result.createdAt) / 1000);

      if (elapsedSeconds >= quiz.timeLimit) {
        const correctCount = result.answers.filter((a) => a.isCorrect).length;
        const percentage = (correctCount / quiz.totalQuestions) * 100;

        result.timeTaken = elapsedSeconds;
        result.percentage = percentage;
        result.completedAt = now;
        result.progressStatus = enumConfig.progressStatusEnums.TIMEOUT;
        result.resultStatus = enumConfig.resultStatusEnums.TIMEOUT;

        await result.save();

        console.log(
          `✅ Auto-submitted quiz: ${quiz.title} for user ${result.attemptBy}.`
        );

        // You could also emit a socket event here if needed
        // io.to(result.attemptBy.toString()).emit("quizAutoSubmitted", {
        //   quizId: quiz._id,
        //   percentage,
        //   resultStatus: result.resultStatus,
        // });
      }
    }

    console.log("🕒 Auto-submit quiz check completed.");
  } catch (error) {
    console.error("❌ Error during auto-submit check:", error);
  }
};

/**
 * Function to check if a quiz has timed out and update the status
 */
export const checkAndUpdateAllTimeouts = async () => {
  try {
    // Fetch all quizzes
    const quizzes = await QuizModel.find();

    for (const quiz of quizzes) {
      // Fetch all users who have attempted this quiz
      const results = await ResultModel.find({ quiz: quiz._id });

      // Loop through each result (user attempt)
      for (const result of results) {
        // Check if quiz time limit is set and if it has expired
        if (
          quiz.timeLimit &&
          result.progressStatus === enumConfig.progressStatusEnums.IN_PROGRESS
        ) {
          // Update the result to "TIMEOUT"
          result.progressStatus = enumConfig.progressStatusEnums.TIMEOUT;
          result.resultStatus = enumConfig.resultStatusEnums.TIMEOUT;

          await result.save();

          console.log(
            `Quiz ${quiz._id} for user ${result.attemptBy} timed out and updated.`
          );
        }
      }
    }
  } catch (error) {
    console.error(
      "Error checking and updating timeouts for all quizzes:",
      error
    );
    throw new Error("Failed to check and update timeouts.");
  }
};
