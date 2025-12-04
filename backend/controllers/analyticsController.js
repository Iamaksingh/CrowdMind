import Thread from '../models/Thread.js';
import User from '../models/User.js';
import Profile from '../models/userProfile.js';
import OpenAI from "openai";

const client = new OpenAI({
	apiKey: process.env.GEMINI_API_KEY,
	baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});



// Helper function to safely parse Gemini JSON responses
const parseGeminiJSON = (content) => {
	content = content.replace(/```json/g, "").replace(/```/g, "").trim();
	return JSON.parse(content);
};



// Calculate engagement score for a user
const calculateEngagementScore = (user) => {
	const postWeight = 10;
	const commentWeight = 5;
	const likeWeight = 1;
	const toxicityPenalty = 0.1;
	const biasPenalty = 0.1;

	const baseScore = (user.totalPosts * postWeight) + (user.totalComments * commentWeight) + (user.totalLikes * likeWeight);

	const toxicityPenaltyScore = (user.averageToxicity * toxicityPenalty);
	const biasPenaltyScore = (user.averageBias * biasPenalty);

	return Math.max(0, baseScore - toxicityPenaltyScore - biasPenaltyScore);
};



// Update user toxicity metrics
export const updateUserToxicity = async (userId, toxicity, bias, type) => {
	try {
		const user = await User.findById(userId);
		if (!user) return;

		// Add to toxicity history
		user.toxicityHistory.push({
			score: (toxicity + bias) / 2,
			type: type,
			createdAt: new Date()
		});

		// Keep only last 100 entries
		if (user.toxicityHistory.length > 100) {
			user.toxicityHistory = user.toxicityHistory.slice(-100);
		}

		// Calculate new averages
		const recentScores = user.toxicityHistory.slice(-20); // Last 20 entries
		user.averageToxicity = recentScores.reduce((sum, entry) => sum + (entry.type === 'post' ? toxicity : 0), 0) /
			Math.max(1, recentScores.filter(entry => entry.type === 'post').length);
		user.averageBias = recentScores.reduce((sum, entry) => sum + (entry.type === 'post' ? bias : 0), 0) /
			Math.max(1, recentScores.filter(entry => entry.type === 'post').length);

		// Update engagement metrics
		if (type === 'post') {
			user.totalPosts += 1;
		} else {
			user.totalComments += 1;
		}

		// Recalculate engagement score
		user.engagementScore = calculateEngagementScore(user);

		await user.save();
	} catch (error) {
		console.error('Error updating user toxicity:', error);
	}
};



// Get leaderboard
export const getLeaderboard = async (req, res) => {
	try {
		const users = await User.find()
			.select('email totalPosts totalComments totalLikes averageToxicity averageBias engagementScore moderatedPosts moderatedComments')
			.sort({ engagementScore: -1 })
			.limit(50);

		const usersWithProfiles = await Promise.all(
			users.map(async (user) => {
				const profile = await Profile.findOne({ user: user._id })
					.select('username avatar bio');
				return {
					...user.toObject(),
					profile: profile || { username: 'Anonymous', avatar: '', bio: '' }
				};
			})
		);

		res.json(usersWithProfiles);
	} catch (error) {
		console.error('Error fetching leaderboard:', error);
		res.status(500).json({ error: 'Failed to fetch leaderboard' });
	}
};



// Generate discussion summary with context optimization
export const generateDiscussionSummary = async (req, res) => {
	try {
		const { threadId } = req.params;
		const thread = await Thread.findById(threadId);

		if (!thread) {
			return res.status(404).json({ error: 'Thread not found' });
		}

		// Check if summary needs update (older than 1 hour or no summary exists)
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
		const needsUpdate = !thread.summary || thread.lastSummaryUpdate < oneHourAgo;

		if (!needsUpdate) {
			return res.json({
				summary: thread.summary,
				context: thread.context,
				lastUpdate: thread.lastSummaryUpdate
			});
		}

		// Prepare context for AI
		const discussionContext = {
			title: thread.title,
			description: thread.description,
			tags: thread.tags,
			comments: thread.comment_list.map(comment => ({
				text: comment.text,
				author: comment.username,
				createdAt: comment.createdAt
			}))
		};

		// Generate context and summary in one API call
		const prompt = `Analyze this discussion and provide:
			1. A brief context of what the discussion is about
			2. A comprehensive summary of the key points and arguments
			
			Discussion:
			Title: "${thread.title}"
			Description: "${thread.description}"
			Tags: ${thread.tags.join(', ')}
			
			Comments (${thread.comment_list.length} total):
			${thread.comment_list.map((comment, index) =>
					`${index + 1}. ${comment.username}: "${comment.text}"`
				).join('\n')}
			
			Return JSON format:
			{
			"context": "Brief context of the discussion topic",
			"summary": "Comprehensive summary of key points, arguments, and conclusions"
			}
			`;

		const response = await client.chat.completions.create({
			model: "gemini-2.0-flash",
			messages: [{ role: "user", content: prompt }]
		});

		const result = parseGeminiJSON(response.choices[0].message.content);

		// Update thread with new summary
		thread.context = result.context;
		thread.summary = result.summary;
		thread.lastSummaryUpdate = new Date();
		await thread.save();

		res.json({
			summary: result.summary,
			context: result.context,
			lastUpdate: thread.lastSummaryUpdate
		});

	} catch (error) {
		console.error('Error generating discussion summary:', error);
		res.status(500).json({ error: 'Failed to generate summary' });
	}
};



// Get discussion dashboard data
export const getDiscussionDashboard = async (req, res) => {
	try {
		const { threadId } = req.params;
		const thread = await Thread.findById(threadId);

		if (!thread) {
			return res.status(404).json({ error: 'Thread not found' });
		}

		// Calculate engagement metrics
		const now = new Date();
		const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

		// Recent engagement (last 24 hours)
		const recentComments = thread.comment_list.filter(comment =>
			new Date(comment.createdAt) > last24Hours
		);

		// Hourly engagement for last 24 hours
		const hourlyEngagement = Array.from({ length: 24 }, (_, hour) => {
			const hourStart = new Date(now.getTime() - (23 - hour) * 60 * 60 * 1000);
			const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

			const count = thread.comment_list.filter(comment => {
				const commentTime = new Date(comment.createdAt);
				return commentTime >= hourStart && commentTime < hourEnd;
			}).length;

			return { hour, count };
		});

		// Daily engagement for last 7 days
		const dailyEngagement = Array.from({ length: 7 }, (_, day) => {
			const dayStart = new Date(now.getTime() - (6 - day) * 24 * 60 * 60 * 1000);
			const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

			const count = thread.comment_list.filter(comment => {
				const commentTime = new Date(comment.createdAt);
				return commentTime >= dayStart && commentTime < dayEnd;
			}).length;

			return { date: dayStart, count };
		});

		// Toxicity levels over time
		const toxicityLevels = thread.toxicityHistory.map(entry => ({
			date: entry.createdAt,
			toxicity: entry.score,
			bias: entry.score // Simplified for now
		}));

		const dashboardData = {
			overview: {
				totalComments: thread.comments,
				totalLikes: thread.likes,
				totalViews: thread.views,
				averageToxicity: thread.averageToxicity,
				averageBias: thread.averageBias,
				recentComments: recentComments.length
			},
			engagement: {
				hourly: hourlyEngagement,
				daily: dailyEngagement
			},
			toxicity: {
				levels: toxicityLevels,
				average: thread.averageToxicity,
				trend: thread.averageToxicity > 50 ? 'increasing' : 'decreasing'
			}
		};

		res.json(dashboardData);

	} catch (error) {
		console.error('Error fetching discussion dashboard:', error);
		res.status(500).json({ error: 'Failed to fetch dashboard data' });
	}
};



// Update thread engagement metrics
export const updateThreadEngagement = async (threadId, type) => {
	try {
		const thread = await Thread.findById(threadId);
		if (!thread) return;

		if (type === 'view') {
			thread.views += 1;
		} else if (type === 'like') {
			thread.likes += 1;
		} else if (type === 'comment') {
			thread.comments += 1;
		}

		// Recalculate engagement score
		thread.engagementScore = (thread.likes * 2) + (thread.comments * 5) + (thread.views * 0.1);

		await thread.save();
	} catch (error) {
		console.error('Error updating thread engagement:', error);
	}
};
