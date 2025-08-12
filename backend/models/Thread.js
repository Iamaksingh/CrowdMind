import mongoose from 'mongoose';

const threadSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  category: { type: String },
  filePath: { type: String },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  likes: {type: Number, default: 0},
  comments: {type: Number, default: 0}
}, { timestamps: true });

const Thread = mongoose.model('Thread', threadSchema);
export default Thread;