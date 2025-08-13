import mongoose from 'mongoose';
import User from './User.js';

const commentSchema = new mongoose.Schema({
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  username: { type: String, required: true }, // from profile
  avatar: { type: String },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const threadSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  tags: { type: [String]},
  filePath: { type: String },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  likes: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  comment_list: [commentSchema],
}, { timestamps: true });

// 1️⃣ For .save()
threadSchema.pre('save', function(next) {
  this.comments = this.comment_list.length;
  next();
});

// 2️⃣ For findOneAndUpdate & findByIdAndUpdate
threadSchema.pre(['findOneAndUpdate', 'findByIdAndUpdate'], function(next) {
  const update = this.getUpdate();

  if (update.comment_list) {
    const newCount = update.comment_list.length;
    this.setUpdate({ ...update, comments: newCount });
  }

  next();
});

const Thread = mongoose.model('Thread', threadSchema);
export default Thread;
