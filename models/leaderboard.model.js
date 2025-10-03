import mongoose from 'mongoose';

const leaderboardSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    userAvtar: { type: String },
    userName: { type: String },
    totalPoints: { type: Number, default: 0 },
    rank: { type: Number, default: 0 }
}, {
    timestamps: true
});

const Leaderboard = mongoose.model('Leaderboard', leaderboardSchema);
export default Leaderboard;
