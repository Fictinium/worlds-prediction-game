import mongoose from 'mongoose';

const phaseSchema = new mongoose.Schema({
  current: {
    type: String,
    enum: ['group_stage', 'top_4', 'finals', 'closed'],
    default: 'closed',
  }
}, { timestamps: true });

// There should only ever be 1 document
export default mongoose.model('Phase', phaseSchema);