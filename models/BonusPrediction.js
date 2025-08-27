import mongoose from 'mongoose';

const bonusPredictionSchema = new mongoose.Schema({
  user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:   { type: String, enum: ['worlds_winner', 'groups_advancers', 'mvp'], required: true },

  // Store selections generically
  // For 'worlds_winner': selections = [teamId]
  // For 'groups_advancers': selections = [teamId, teamId, ...]
  // For 'mvp': selections = ['playerName'] or a Player ObjectId if you prefer
  selections: [{ type: mongoose.Schema.Types.Mixed, required: true }],

  // Locking window (set when created/opened)
  lockAt:  { type: Date, required: true },

  // Points awarded after settlement
  points:  { type: Number, default: 0 },

}, { timestamps: true });

bonusPredictionSchema.index({ user: 1, type: 1 }, { unique: true }); // one of each per user

export default mongoose.model('BonusPrediction', bonusPredictionSchema);