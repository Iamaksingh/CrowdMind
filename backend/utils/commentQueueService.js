import { redis, isRedisEnabled } from '../config/redis.js';
import Thread from '../models/Thread.js';
import OpenAI from 'openai';

const client = new OpenAI({
	apiKey: process.env.GEMINI_API_KEY,
	baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
});

// Configuration
const BATCH_SIZE = 5;
const BATCH_TIMEOUT_MS = 1 * 60 * 1000; // 1 minute
const inMemoryQueues = new Map();  // In-memory fallback queue



// Helper to safely parse Gemini JSON
const parseGeminiJSON = (content) => {
	content = content.replace(/```json/g, '').replace(/```/g, '').trim();
	return JSON.parse(content);
};



/* Add a comment to Redis queue (or in-memory fallback) Queue key format: "queue:threadId" Each entry: { commentIndex, text, timestamp } */
export const addToQueue = async (threadId, commentIndex, commentText) => {
	try {
		const queueKey = `queue:${threadId}`;

		const entry = JSON.stringify({
			commentIndex,
			text: commentText,
			timestamp: Date.now()
		});

		if (isRedisEnabled && redis) {
			// Push to Redis queue
			await redis.rpush(queueKey, entry);
			await redis.expire(queueKey, 48 * 60 * 60); // 48 hours expiry
		} else {
			// Fallback: in-memory storage
			if (!inMemoryQueues.has(queueKey)) {
				inMemoryQueues.set(queueKey, []);
			}
			inMemoryQueues.get(queueKey).push(entry);
		}

		console.log(`📨 Added comment ${commentIndex} to queue for thread ${threadId}`);
		return { queued: true, queueSize: await getQueueSize(threadId) };

	} catch (err) {
		
		console.error('❌ Error adding to queue:', err.message);
		// Still try in-memory as fallback
		const queueKey = `queue:${threadId}`;
		if (!inMemoryQueues.has(queueKey)) {
			inMemoryQueues.set(queueKey, []);
		}
		inMemoryQueues.get(queueKey).push(JSON.stringify({
			commentIndex,
			text: commentText,
			timestamp: Date.now()
		}));
		return { queued: true, queueSize: await getQueueSize(threadId) };
	}
};



/* Get current queue size for a thread */
export const getQueueSize = async (threadId) => {
	try {
		const queueKey = `queue:${threadId}`;

		if (isRedisEnabled && redis) {
			return await redis.llen(queueKey);
		} else {
			return inMemoryQueues.get(queueKey)?.length || 0;
		}
	} catch (err) {
		console.error('❌ Error getting queue size:', err.message);
		return inMemoryQueues.get(`queue:${threadId}`)?.length || 0;
	}
};



/* Check if batch should be triggered Returns true if: size >= BATCH_SIZE OR oldest entry > BATCH_TIMEOUT_MS */
export const shouldTriggerBatch = async (threadId) => {
	try {
		const queueKey = `queue:${threadId}`;
		const size = await getQueueSize(threadId);

		// Check size threshold
		if (size >= BATCH_SIZE) {
			console.log(`🔄 Batch triggered for thread ${threadId}: SIZE (${size}/${BATCH_SIZE})`);
			return true;
		}

		// Check timeout threshold
		if (size > 0) {
			let oldestEntry;

			if (isRedisEnabled && redis) {
				oldestEntry = await redis.lindex(queueKey, 0);
			} else {
				const queue = inMemoryQueues.get(queueKey);
				oldestEntry = queue && queue[0] ? queue[0] : null;
			}

			if (oldestEntry) {
				// Upstash Redis REST returns parsed objects; in-memory returns strings
				const parsedEntry = typeof oldestEntry === 'string' ? JSON.parse(oldestEntry) : oldestEntry;
				const { timestamp } = parsedEntry;
				const age = Date.now() - timestamp;

				if (age > BATCH_TIMEOUT_MS) {
					console.log(`🔄 Batch triggered for thread ${threadId}: TIMEOUT (${Math.floor(age / 1000 / 60 / 60)}h)`);
					return true;
				}
			}
		}

		return false;
	} catch (err) {
		console.error('❌ Error checking batch trigger:', err.message);
		return false;
	}
};



/* Process batch: fetch comments, analyze, store results */
export const processBatch = async (threadId) => {
	try {
		console.log(`⏳ Processing batch for thread ${threadId}...`);

		const queueKey = `queue:${threadId}`;
		const thread = await Thread.findById(threadId);

		if (!thread) {
			console.error(`❌ Thread ${threadId} not found, clearing queue`);
			await clearQueue(queueKey);
			return;
		}

		// Get all items from queue
		let queueItems = [];
		if (isRedisEnabled && redis) {
			queueItems = await redis.lrange(queueKey, 0, -1);
		} else {
			queueItems = inMemoryQueues.get(queueKey) || [];
		}

		if (queueItems.length === 0) {
			console.log(`✅ Queue empty for thread ${threadId}, nothing to process`);
			return;
		}

		// Parse queue items
		const comments = queueItems.map(item => typeof item === 'string' ? JSON.parse(item) : item);

		// Build Gemini request with all comments
		let commentsList = '';
		comments.forEach((comment, idx) => {
			commentsList += `${idx}. "${comment.text}"\n`;
		});

		const batchPrompt = `You are analyzing a batch of comments for a discussion thread.Thread Summary: """${thread.summary}"""

			Comments to analyze:
			${commentsList}

			For each comment (in order), provide a JSON object with:
			- relevance_score: 1-100 (how relevant to thread)
			- has_factual_claims: true/false
			- factual_accuracy: "verified", "disputed", or "unverifiable"

			Return ONLY this exact JSON format (no markdown, no backticks):
			{
			"comments": [
				{ "relevance_score": <num>, "has_factual_claims": <bool>, "factual_accuracy": "<string>" },
				...
			]
			}`;

		// Send to Gemini
		let analysisResponse;
		try {
			analysisResponse = await client.chat.completions.create({
				model: 'gemini-2.0-flash',
				messages: [{ role: 'user', content: batchPrompt }]
			});
		} catch (geminiErr) {
			console.error('❌ Gemini API error during batch analysis:', geminiErr.message);
			// Don't clear queue on error, try again later
			return;
		}

		// Parse response
		let analysisResults;
		try {
			analysisResults = parseGeminiJSON(analysisResponse.choices[0].message.content);
		} catch (parseErr) {
			console.error('❌ Failed to parse Gemini response:', parseErr.message);
			console.error('Response was:', analysisResponse.choices[0].message.content);
			// Clear queue on parse error to prevent infinite loop
			await clearQueue(queueKey);
			return;
		}

		// Apply results to comments
		let updatesMade = false;
		comments.forEach((queuedComment, idx) => {
			const commentIndex = queuedComment.commentIndex;
			if (analysisResults.comments && analysisResults.comments[idx]) {
				const analysis = analysisResults.comments[idx];

				if (thread.comment_list[commentIndex]) {
					thread.comment_list[commentIndex].analysis = {
						relevance_score: analysis.relevance_score || 50,
						relevance_status: 'completed',
						has_factual_claims: analysis.has_factual_claims || false,
						fact_check_status: 'completed',
						factual_accuracy: analysis.factual_accuracy || 'unverifiable',
						analysis_notes: analysis.analysis_notes || ''
					};
					updatesMade = true;
				}
			}
		});

		// Save thread
		await thread.save();

		// Clear queue
		await clearQueue(queueKey);

		console.log(`✅ Batch processed for thread ${threadId} (${comments.length} comments analyzed)`);
	} catch (err) {
		console.error('❌ Error processing batch:', err.message);
	}
};



/* Clear queue from Redis or in-memory */
export const clearQueue = async (queueKey) => {
	try {
		if (isRedisEnabled && redis) {
			await redis.del(queueKey);
		} else {
			inMemoryQueues.delete(queueKey);
		}
	} catch (err) {
		console.error('❌ Error clearing queue:', err.message);
	}
};



/* Start periodic batch processor Checks all active queues every 10 seconds */
export const startBatchProcessor = () => {
	console.log('🚀 Starting batch processor...');

	const intervalId = setInterval(async () => {
		try {
			// Get all queue keys
			let keys = [];

			if (isRedisEnabled && redis) {
				keys = await redis.keys('queue:*');
			} else {
				keys = Array.from(inMemoryQueues.keys());
			}

			for (const key of keys) {
				const threadId = key.replace('queue:', '');

				// Check if should trigger batch
				const shouldProcess = await shouldTriggerBatch(threadId);

				if (shouldProcess) {
					await processBatch(threadId);
				}
			}
		} catch (err) {
			console.error('❌ Error in batch processor loop:', err.message);
		}
	}, 10000); // Check every 10 seconds

	return intervalId;
};



/* Stop batch processor */
export const stopBatchProcessor = (intervalId) => {
	if (intervalId) {
		clearInterval(intervalId);
		console.log('⛔ Batch processor stopped');
	}
};



/* Flush all pending queues (graceful shutdown) */
export const flushAllQueues = async () => {
	try {
		let keys = [];

		if (isRedisEnabled && redis) {
			keys = await redis.keys('queue:*');
		} else {
			keys = Array.from(inMemoryQueues.keys());
		}

		for (const key of keys) {
			const threadId = key.replace('queue:', '');
			const shouldProcess = await shouldTriggerBatch(threadId);

			if (shouldProcess) {
				await processBatch(threadId);
			}
		}

		console.log('✅ All queues flushed');
	} catch (err) {
		console.error('❌ Error flushing queues:', err.message);
	}
};