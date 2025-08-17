import Thread from '../models/Thread.js';
import User from '../models/User.js';
import { cloudinary } from '../config/cloudinary.js';
import Profile from '../models/userProfile.js';
import OpenAI from "openai";

const TOXICITY_THRESHOLD = 70;
const BIAS_THRESHOLD = 70;

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

// Helper function to safely parse Gemini JSON responses
const parseGeminiJSON = (content) => {
  content = content.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(content);
};

// ==================== THREADS ====================
export const createThread = async (req, res) => {
  try {
    const { title, description, tags } = req.body;

    // Step 1: Get ratings
    const ratingPrompt = `
Analyze the following text and return strict JSON:
- toxicity: 1-100
- bias: 1-100

Title: """${title}"""
Description: """${description}"""
`;

    const ratingResponse = await client.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: ratingPrompt }]
    });

    const ratings = parseGeminiJSON(ratingResponse.choices[0].message.content);
    const { toxicity, bias } = ratings;

    // Step 2: Check thresholds
    if (toxicity <= TOXICITY_THRESHOLD && bias <= BIAS_THRESHOLD) {
      const newThread = new Thread({
        title,
        description,
        tags: tags ? tags.split(",") : [],
        author: req.user.id,
        filePath: req.file ? req.file.path : null
      });
      await newThread.save();

      return res.status(201).json({
        message: "Thread created successfully",
        thread: newThread,
        ratings
      });
    }

    // Step 3: Unsafe → get moderated content
    const moderationPrompt = `
Moderate the following title and description to remove bias or toxicity.
Return strict JSON:
- moderated_title
- moderated_description

Title: """${title}"""
Description: """${description}"""
`;

    const moderationResponse = await client.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: moderationPrompt }]
    });

    const moderated = parseGeminiJSON(moderationResponse.choices[0].message.content);

    res.status(200).json({
      message: "Content requires moderation",
      ratings,
      moderated
    });

  } catch (error) {
    console.error("Error in thread creation:", error);
    res.status(500).json({ error: "Failed to create thread" });
  }
};

export const getThreads = async (req, res) => {
  try {
    let user = null;
    if (req.user && req.user.id) {
      user = await User.findById(req.user.id);
    }

    const threads = await Thread.find()
      .populate('author', 'username email')
      .sort({ createdAt: -1 });

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
      .lean();

    if (!thread) return res.status(404).json({ message: 'Thread not found' });

    const profile = await Profile.findOne({ user: thread.author._id })
      .select('username avatar')
      .lean();

    const threadData = {
      ...thread,
      username: profile?.username || null,
      avatar: profile?.avatar || null,
      category: thread.category || thread.tag || null
    };

    res.json(threadData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getThreadByUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const threads = await Thread.find({ author: req.user.id })
      .populate("author", "username email")
      .sort({ createdAt: -1 });

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

    if (thread.imagePublicId) {
      await cloudinary.uploader.destroy(thread.imagePublicId);
    }

    await Thread.findByIdAndDelete(req.params.id);

    res.json({ message: 'Thread deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ==================== COMMENTS ====================
export const addComment = async (req, res) => {
  try {
    const { text } = req.body;
    const threadId = req.params.id;
    const userId = req.user.id;

    const profile = await Profile.findOne({ user: userId });
    if (!profile) return res.status(404).json({ msg: "Profile not found" });

    const thread = await Thread.findById(threadId);
    if (!thread) return res.status(404).json({ msg: "Thread not found" });

    // Step 1: Get ratings
    const ratingPrompt = `
Analyze the following comment text and return strict JSON:
- toxicity: 1-100
- bias: 1-100

Comment: """${text}"""
`;

    const ratingResponse = await client.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: ratingPrompt }]
    });

    const ratings = parseGeminiJSON(ratingResponse.choices[0].message.content);
    const { toxicity, bias } = ratings;

    // Step 2: Check thresholds
    if (toxicity <= TOXICITY_THRESHOLD && bias <= BIAS_THRESHOLD) {
      const newComment = {
        author: userId,
        username: profile.username,
        avatar: profile.avatar,
        text
      };

      thread.comment_list.push(newComment);
      thread.comments = thread.comment_list.length;
      await thread.save();

      return res.status(201).json({
        message: "Comment added successfully",
        comment: newComment,
        ratings
      });
    }

    // Step 3: Unsafe → get moderated comment
    const moderationPrompt = `
Please give me a comment which would somewhat mean this and that should be not toxic or biased
Return strict JSON:
- moderated_comment

Comment: """${text}"""
`;

    const moderationResponse = await client.chat.completions.create({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: moderationPrompt }]
    });

    const moderated = parseGeminiJSON(moderationResponse.choices[0].message.content);

    res.status(200).json({
      message: "moderate this statement to remove bias and toxicity",
      ratings,
      moderated
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

// ==================== LIKE / UNLIKE ====================
export const like_unlike = async (req, res) => {
  try {
    const userId = req.user.id;
    const threadId = req.params.id;

    const thread = await Thread.findById(threadId);
    if (!thread) return res.status(404).json({ message: "Thread not found" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    let liked = false;

    if (user.likedThreads.includes(threadId)) {
      await User.updateOne({ _id: userId }, { $pull: { likedThreads: threadId } });
      await Thread.updateOne({ _id: threadId }, { $inc: { likes: -1 } });
      liked = false;
    } else {
      await User.updateOne({ _id: userId }, { $push: { likedThreads: threadId } });
      await Thread.updateOne({ _id: threadId }, { $inc: { likes: 1 } });
      liked = true;
    }

    const updatedThread = await Thread.findById(threadId);
    res.json({ likes: updatedThread.likes, liked });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
