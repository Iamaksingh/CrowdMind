import Thread from '../models/Thread.js';
import User from '../models/User.js';
import { cloudinary } from '../config/cloudinary.js';
import Profile from '../models/userProfile.js';

export const createThread = async (req, res) => {
  try {
    const { title, description, tags } = req.body;

    const newThread = new Thread({
      title,
      description,
      tags: tags ? tags.split(",") : [],
      author: req.user.id,
      filePath: req.file ? req.file.path : null // Cloudinary URL
    });
    await newThread.save();
    res.status(201).json({
      message: "Thread created successfully",
      thread: newThread
    });
  } catch (error) {
    console.error("Error saving thread:", error);
    res.status(500).json({ error: "Failed to create thread" });
  }
}

export const getThreads = async (req, res) => {
  try {
    let user = null;

    // If there is a token, get user info
    if (req.user && req.user.id) {
      user = await User.findById(req.user.id);
    }

    const threads = await Thread.find()
      .populate('author', 'username email')
      .sort({ createdAt: -1 });

    // Map likedByCurrentUser
    const threadsWithLikeInfo = threads.map(thread => ({
      ...thread.toObject(),
      likedByCurrentUser: user ? user.likedThreads.includes(thread._id) : false
    }));

    res.json(threadsWithLikeInfo);
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

export const getThreadByUser = async (req, res) => {
  try {
    // Get the current logged-in user
    const user = await User.findById(req.user.id);

    // Fetch threads created by this user
    const threads = await Thread.find({ author: req.user.id })
      .populate("author", "username email")
      .sort({ createdAt: -1 });

    // Add likedByCurrentUser field for frontend
    const threadsWithLikeInfo = threads.map(thread => ({
      ...thread.toObject(),
      likedByCurrentUser: user.likedThreads.includes(thread._id)
    }));

    res.json(threadsWithLikeInfo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
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

//like/unlike on a thread
export const like_unlike = async (req, res) => {
  try {
    const userId = req.user.id;      // from auth middleware
    const threadId = req.params.id;

    const thread = await Thread.findById(threadId);
    if (!thread) return res.status(404).json({ message: "Thread not found" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    let liked = false;

    if (user.likedThreads.includes(threadId)) {
      // Unlike
      await User.updateOne({ _id: userId }, { $pull: { likedThreads: threadId } });
      await Thread.updateOne({ _id: threadId }, { $inc: { likes: -1 } });
      liked = false;
    } else {
      // Like
      await User.updateOne({ _id: userId }, { $push: { likedThreads: threadId } });
      await Thread.updateOne({ _id: threadId }, { $inc: { likes: 1 } });
      liked = true;
    }

    // Return updated likes count
    const updatedThread = await Thread.findById(threadId);

    res.json({ likes: updatedThread.likes, liked });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};