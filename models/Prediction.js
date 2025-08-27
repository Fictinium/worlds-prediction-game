import mongoose from 'mongoose';

const predictionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  match: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },

  // Predicted scores
  scoreA: { type: Number, required: true },
  scoreB: { type: Number, required: true },

  // Points awarded after match is completed
  points: { type: Number, default: 0 },

}, { timestamps: true });

// Ensure 1 prediction per user per match
predictionSchema.index({ user: 1, match: 1 }, { unique: true });

export default mongoose.model('Prediction', predictionSchema);