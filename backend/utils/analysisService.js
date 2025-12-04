import OpenAI from "openai";
import Thread from "../models/Thread.js";

const client = new OpenAI({
	apiKey: process.env.GEMINI_API_KEY,
	baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});



// Helper to safely parse Gemini JSON
const parseGeminiJSON = (content) => {
	content = content.replace(/```json/g, "").replace(/```/g, "").trim();
	return JSON.parse(content);
};



/* Check if comment is relevant to thread summary Returns relevance score 1-100 */
export const checkRelevance = async (commentText, threadSummary, threadTitle) => {
	try {
		const prompt = `You are a strict content moderator evaluating comment relevance. Your job is to filter out noise, spam, and unrelated content.
			Input Data:
			Thread Title: """${threadTitle}"""
			Thread Summary: """${threadSummary || 'No summary available'}"""
			Comment: """${commentText}"""

			Task:
			1. Analyze the core topic of the thread.
			2. Analyze the specific claim or topic of the comment.
			3. Determine if the comment directly addresses the thread's topic.

			CRITICAL RULES:
			- Be cynical. Do not invent philosophical or metaphorical connections (e.g., do not connect "biology" to "AI" just because both are complex).
			- If the comment is of non related domains , the score must be under 10.
			- If the comment is generic (e.g., "Good post") but adds no value, the score must be under 30.

			Rubric:
			- 0–10: Completely off-topic, random facts, or spam.
			- 11–30: Generic comments with no specific connection to the content.
			- 31–60: Tangentially related but misses the main point.
			- 61–80: Relevant but minor or repetitive.
			- 81–100: Highly relevant, insightful, and on-topic.

			Output a valid JSON object with the following structure. Do NOT output markdown code blocks.
			{
				"analysis": "A 1-2 sentence breakdown of why the comment fits or fails to fit the thread.",
				"relevance_score": <number 0-100>,
				"verdict": "<Short string: 'Relevant' or 'Off-topic'>"
			}`;

		const response = await client.chat.completions.create({
			model: "gemini-2.0-flash",
			messages: [{ role: "user", content: prompt }]
		});

		const result = parseGeminiJSON(response.choices[0].message.content);
		return {
			relevance_score: Math.min(100, Math.max(1, result.relevance_score)),
			reason: result.reason
		};
	} catch (error) {
		console.error("Error checking relevance:", error);
		return {
			relevance_score: null,
			reason: "Analysis unavailable"
		};
	}
};



/* Fact-check comment for factual claims Returns whether comment has claims and if they appear verified */
export const factCheckComment = async (commentText, threadContext) => {
	try {
		const prompt = ` You are a professional fact-checker. Your task is only to analyze factual claims without inventing information.
			First, detect whether the comment contains specific factual claims (dates, statistics, scientific or historical facts, numbers, named sources, etc.).
			Then privately evaluate whether those claims are supported based on common world knowledge. If something is not known or cannot be confirmed, classify 
			it as "unverifiable". Do NOT attempt to guess missing information.

			Comment: """${commentText}"""
			Thread Context: """${threadContext || 'No context'}"""

			Output must be strict JSON in this exact schema:
			{
				"has_factual_claims": <boolean>,
				"factual_accuracy": "<verified | disputed | unverifiable>",
				"findings": "<1–2 short sentences summarizing what was checked>",
				"flags": [ "<list of misleading / false claims>", ... ]
			}

			Rules:
			- Do NOT fabricate facts
			- If there is no factual claim, set has_factual_claims = false and factual_accuracy = "unverifiable"
			- "verified" should only be used when the claim is widely accepted and known to be accurate
			- "disputed" should only be used if the claim contradicts widely accepted facts
			- No markdown, no backticks, no extra text before or after JSON.`;

		const response = await client.chat.completions.create({
			model: "gemini-2.0-flash",
			messages: [{ role: "user", content: prompt }]
		});

		const result = parseGeminiJSON(response.choices[0].message.content);

		// Normalize factual_accuracy to valid enum values
		let factualAccuracy = result.factual_accuracy?.toLowerCase() || 'unverifiable';
		if (!['verified', 'disputed', 'unverifiable'].includes(factualAccuracy)) {
			factualAccuracy = 'unverifiable';
		}

		return {
			has_factual_claims: result.has_factual_claims,
			factual_accuracy: factualAccuracy,
			findings: result.findings,
			flags: result.flags || []
		};
	} catch (error) {
		console.error("Error fact-checking comment:", error);
		return {
			has_factual_claims: false,
			factual_accuracy: null,
			findings: "Fact-check unavailable",
			flags: []
		};
	}
};



/* Run background analysis on a comment Updates the thread document with analysis results */
export const analyzeCommentInBackground = async (threadId, commentIndex) => {
	try {
		// Fetch the thread
		const thread = await Thread.findById(threadId);
		if (!thread || !thread.comment_list[commentIndex]) {
			console.error("Thread or comment not found");
			return;
		}

		const comment = thread.comment_list[commentIndex];
		console.log(`Starting analysis for comment ${commentIndex} in thread ${threadId}`);

		// Run both checks in parallel
		const [relevanceResult, factCheckResult] = await Promise.all([
			checkRelevance(comment.text, thread.summary, thread.title),
			factCheckComment(comment.text, thread.summary)
		]);

		// Update comment with analysis results
		comment.analysis = {
			relevance_score: relevanceResult.relevance_score,
			relevance_status: 'completed',
			fact_check_status: 'completed',
			has_factual_claims: factCheckResult.has_factual_claims,
			factual_accuracy: factCheckResult.factual_accuracy,
			analysis_notes: `Relevance: ${relevanceResult.reason}. Fact-check: ${factCheckResult.findings}`
		};

		// Save the updated thread
		await thread.save();
		console.log(`✅ Analysis completed for comment ${commentIndex}`);

		return comment.analysis;

	} catch (error) {
		console.error(`Error analyzing comment: ${error.message}`);

		// Mark analysis as failed in the comment
		try {
			const thread = await Thread.findById(threadId);
			if (thread && thread.comment_list[commentIndex]) {
				thread.comment_list[commentIndex].analysis.relevance_status = 'failed';
				thread.comment_list[commentIndex].analysis.fact_check_status = 'failed';
				thread.comment_list[commentIndex].analysis.analysis_notes = 'Analysis failed';
				await thread.save();
			}
		} catch (saveErr) {
			console.error("Error marking analysis as failed:", saveErr);
		}

		throw error;
	}
};



/* Queue comment analysis (fire-and-forget) Does not wait for completion */
export const queueCommentAnalysis = (threadId, commentIndex) => {
	// Set a small delay to ensure DB write is complete, then run async
	setTimeout(() => {
		analyzeCommentInBackground(threadId, commentIndex)
			.catch(err => console.error("Background analysis failed:", err.message));
	}, 500);
};