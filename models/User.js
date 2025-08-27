import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  username: { type: String, required: true },

  // Total points across all matches and bonuses
  totalPoints: { type: Number, default: 0 },

  // Optional: track per-phase totals
  phasePoints: {
    group_stage: { type: Number, default: 0 },
    top_4: { type: Number, default: 0 },
    finals: { type: Number, default: 0 },
  },

}, { timestamps: true });

export default mongoose.model('User', userSchema);