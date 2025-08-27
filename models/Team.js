import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  region: { type: String, required: true },
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual populate: players of this team
teamSchema.virtual('players', {
  ref: 'Player',
  localField: '_id',
  foreignField: 'team',
});

export default mongoose.model('Team', teamSchema);