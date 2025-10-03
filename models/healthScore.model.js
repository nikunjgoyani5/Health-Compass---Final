import mongoose from "mongoose";

const HealthScoreSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  score: {
    type: Number,
    required: true,
    default: 0,
  },
}, { timestamps: true });

// HealthScoreSchema.index({ userId: 1, date: 1 });

const HealthScoreModel = mongoose.model('HealthScore', HealthScoreSchema);
export default HealthScoreModel;
