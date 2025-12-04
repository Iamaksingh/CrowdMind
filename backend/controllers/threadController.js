import Thread from '../models/Thread.js';
import User from '../models/User.js';
import { cloudinary } from '../config/cloudinary.js';
import Profile from '../models/userProfile.js';
import OpenAI from "openai";
import { updateProfileScores } from '../utils/scoringUtils.js';
import { addToQueue } from '../utils/commentQueueService.js';

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
			// Generate initial summary using Gemini
			const summaryPrompt = ` You are summarizing a discussion thread. Generate a concise summary (1-2 sentences) 
				of the following thread title and description. Keep it brief and capture the main topic.

				Title: """${title}"""
				Description: """${description}"""

				Return only the summary as plain text, no JSON.
				`;

			const summaryResponse = await client.chat.completions.create({
				model: "gemini-2.0-flash",
				messages: [{ role: "user", content: summaryPrompt }]
			});

			const initialSummary = summaryResponse.choices[0].message.content.trim();

			const newThread = new Thread({
				title,
				description,
				tags: tags ? tags.split(",") : [],
				author: req.user.id,
				filePath: req.file ? req.file.path : null,
				// Store the AI-generated summary
				summary: initialSummary
			});
			await newThread.save();

			// Update user profile with new scores
			let profile = await Profile.findOne({ user: req.user.id });
			if (profile) {
				profile = updateProfileScores(profile, toxicity, bias);
				await profile.save();
			}

			return res.status(201).json({
				message: "Thread created successfully",
				thread: newThread,
				ratings,
				userScores: profile ? { avg_toxicity: profile.avg_toxicity, avg_bias: profile.avg_bias } : null
			});
		}

		// Step 3: Unsafe → get moderated content
		const moderationPrompt = ` Moderate the following title and description to remove bias or toxicity. i want it to be just a 
			statement that could be directly replaced by this biased/toxic 
			statemnt and please dont give me anything generic like i cant
			generate based on this statement. i want to directly be able t
			o post it as a comment
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
		const ratingPrompt = ` Analyze the following comment text and return strict JSON:
			- toxicity: 1-100
			- bias: 1-100

			Comment: """${text}"""
			`;

		let ratingResponse;
		try {
			ratingResponse = await client.chat.completions.create({
				model: "gemini-2.0-flash",
				messages: [{ role: "user", content: ratingPrompt }]
			});
		} catch (geminiErr) {
			console.error("Gemini API error during rating:", geminiErr);
			return res.status(500).json({ msg: "Failed to analyze comment" });
		}

		let ratings;
		try {
			ratings = parseGeminiJSON(ratingResponse.choices[0].message.content);
		} catch (parseErr) {
			console.error("JSON parse error:", parseErr, "Content:", ratingResponse.choices[0].message.content);
			return res.status(500).json({ msg: "Failed to parse rating response" });
		}

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

			// Generate recursive summary: Gemini(previous_summary + new_comment)
			const summaryPrompt = ` You are summarizing a discussion thread. You have a previous summary and a new comment. 
				Generate a concise updated summary that incorporates the new comment into the existing summary.
				Keep it brief (2-3 sentences).

				Previous Summary: """${thread.summary || 'No previous summary'}"""
				New Comment: """${text}"""

				Return only the new summary as plain text, no JSON.
				`;

			let summaryResponse;
			let newSummary = thread.summary; // Keep old summary as fallback
			try {
				summaryResponse = await client.chat.completions.create({
					model: "gemini-2.0-flash",
					messages: [{ role: "user", content: summaryPrompt }]
				});
				newSummary = summaryResponse.choices[0].message.content.trim();
			} catch (summaryErr) {
				console.error("Gemini API error during summary generation:", summaryErr);
				// Continue without updating summary if Gemini fails
			}

			thread.summary = newSummary;

			await thread.save();

			// Get the comment index for background analysis
			const commentIndex = thread.comment_list.length - 1;

			// Update user profile scores
			const updatedProfile = updateProfileScores(profile, toxicity, bias);
			await updatedProfile.save();

			// Queue comment for batch analysis (non-blocking)
			await addToQueue(threadId, commentIndex, text);

			return res.status(201).json({
				message: "Comment added successfully",
				comment: newComment,
				commentIndex: commentIndex,
				ratings,
				threadSummary: thread.summary,
				userScores: { avg_toxicity: updatedProfile.avg_toxicity, avg_bias: updatedProfile.avg_bias }
			});
		}

		// Step 3: Unsafe → get moderated comment
		const moderationPrompt = ` Please give me a comment which would somewhat mean this and 
			that should be not toxic or biased. i want it to be just a 
			statement that could be directly replaced by this biased/toxic 
			statemnt and please dont give me anything generic like i cant
			generate based on this statement. i want to directly be able t
			o post it as a comment
			Return strict JSON:
			- moderated_comment

			Comment: """${text}"""
			`;

		let moderationResponse;
		try {
			moderationResponse = await client.chat.completions.create({
				model: "gemini-2.0-flash",
				messages: [{ role: "user", content: moderationPrompt }]
			});
		} catch (geminiErr) {
			console.error("Gemini API error during moderation:", geminiErr);
			return res.status(500).json({ msg: "Failed to moderate comment" });
		}

		let moderated;
		try {
			moderated = parseGeminiJSON(moderationResponse.choices[0].message.content);
		} catch (parseErr) {
			console.error("JSON parse error in moderation:", parseErr);
			return res.status(500).json({ msg: "Failed to parse moderation response" });
		}

		res.status(200).json({
			message: "moderate this statement to remove bias and toxicity",
			ratings,
			moderated
		});

	} catch (err) {
		console.error("Unexpected error in addComment:", err);
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



// ==================== COMMENT ANALYSIS ====================
export const getCommentAnalysis = async (req, res) => {
	try {
		const { threadId, commentIndex } = req.params;

		const thread = await Thread.findById(threadId);
		if (!thread) return res.status(404).json({ msg: "Thread not found" });

		if (commentIndex < 0 || commentIndex >= thread.comment_list.length) {
			return res.status(404).json({ msg: "Comment not found" });
		}

		const comment = thread.comment_list[commentIndex];
		const analysis = comment.analysis || {};

		res.json({
			commentIndex,
			analysis: {
				relevance_score: analysis.relevance_score,
				relevance_status: analysis.relevance_status || 'pending',
				fact_check_status: analysis.fact_check_status || 'pending',
				has_factual_claims: analysis.has_factual_claims,
				factual_accuracy: analysis.factual_accuracy,
				analysis_notes: analysis.analysis_notes || ''
			}
		});

	} catch (err) {
		console.error(err);
		res.status(500).json({ msg: "Server error" });
	}
};
