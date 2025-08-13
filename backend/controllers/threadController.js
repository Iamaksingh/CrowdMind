import Thread from '../models/Thread.js';
import { cloudinary } from '../config/cloudinary.js';
import Profile from '../models/userProfile.js';

export const createThread = async (req, res) => {
  try {
    const { title, description, category } = req.body;
    const author = req.user?.id || null;

    let imageUrl = null;
    let imagePublicId = null;

    if (req.file) {
      // multer-storage-cloudinary-v2 places info on req.file
      imageUrl = req.file.path;
      imagePublicId = req.file.filename || req.file.public_id || null;
    }

    const thread = await Thread.create({
      title, description, category, imageUrl, imagePublicId, author
    });

    res.status(201).json(thread);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', details: err.message });
  }
};

export const getThreads = async (req, res) => {
  try {
    const threads = await Thread.find().populate('author', 'username email').sort({ createdAt: -1 });
    res.json(threads);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getThreadById = async (req, res) => {
  try {
    const thread = await Thread.findById(req.params.id)
      .populate('author', 'email')
      .lean(); // return plain JS object so we can easily add props

    if (!thread) {
      return res.status(404).json({ message: 'Thread not found' });
    }

    const profile = await Profile.findOne({ user: thread.author._id })
      .select('username avatar')
      .lean();

    const threadData = {
      ...thread,
      username: profile?.username || null,
      avatar: profile?.avatar || null,
      category: thread.category || thread.tag || null // make sure category is present
    };

    res.json(threadData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteThread = async (req, res) => {
  try {
    const thread = await Thread.findById(req.params.id);
    if (!thread) return res.status(404).json({ message: 'Thread not found' });

    if (thread.author?.toString() !== req.user?.id)
      return res.status(403).json({ message: 'Forbidden' });

    // delete image from cloudinary if present
    if (thread.imagePublicId) {
      await cloudinary.uploader.destroy(thread.imagePublicId);
    }

    // delete thread
    await Thread.findByIdAndDelete(req.params.id);

    res.json({ message: 'Thread deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};


//comment on a thread
export const addComment = async (req, res) => {
  try {
    const text = req.body.text;
    const threadId = req.params.id;
    const userId = req.user.id; // from auth middleware
    const profile = await Profile.findOne({ user: userId });
    if (!profile) return res.status(404).json({ msg: "Profile not found" });
    const thread = await Thread.findById(threadId);
    if (!thread) return res.status(404).json({ msg: "Thread not found" });

    const newComment = {
      author: userId,
      username: profile.username,
      avatar: profile.avatar,
      text
    };

    thread.comment_list.push(newComment);
    thread.comments = thread.comment_list.length;

    await thread.save();

    res.status(201).json(thread.comment_list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};