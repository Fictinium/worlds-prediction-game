import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema({
  teamA: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  teamB: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },

  // When does it start (store in UTC Date)
  startTime: { type: Date, required: true },

  // Phase for filtering/locking logic later
  phase: {
    type: String,
    enum: ['group_stage', 'top_4', 'finals'],
    required: true,
  },

  // Optional series info
  bestOf: { type: Number, default: 1 },

  // Auto-lock deadline (2h before start). Precomputed for quick checks.
  lockAt: { type: Date, required: true },

  // Scoring/result fields (null until set)
  scoreA: { type: Number, default: null },
  scoreB: { type: Number, default: null },

  // Status helper
  status: {
    type: String,
    enum: ['scheduled', 'locked', 'completed'],
    default: 'scheduled',
  },
}, { timestamps: true });

export default mongoose.model('Match', matchSchema);