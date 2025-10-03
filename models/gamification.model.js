import mongoose from "mongoose";

const challengeSchema = new mongoose.Schema({
    icon: { type : String },
    title: { type : String },
    startedAt: { type : Date },
    endedAt: { type : Date },
    daysLeft: { type : Number },
    participantsCount: { type : Number },
    participantsAvtarPreview: [{ type : String }],
}, { _id: false });

const badgeSchema = new mongoose.Schema({
    icon: { type : String },
    title: { type : String },
    isLocked: { type : Boolean, default: true },
}, { _id: false });

const gamificationSchema = new mongoose.Schema({
    userId: { 
        type : mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    totalPoints: { type : Number, default: 0 },
    activeChallenges: [challengeSchema],
    badges: [badgeSchema]
}, {
    timestamps: true,
});

const Gamification = mongoose.model('Gamification', gamificationSchema);
export default Gamification;
