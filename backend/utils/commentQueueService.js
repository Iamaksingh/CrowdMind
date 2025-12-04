import redisClient from '../config/redis.js';
import Thread from '../models/Thread.js';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
});

// Configuration
const BATCH_SIZE = 5;
const BATCH_TIMEOUT_MS = 1 * 60 * 1000; // 1 minute

// Helper to safely parse Gemini JSON
const parseGeminiJSON = (content) => {
  content = content.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(content);
};

/**
 * Add a comment to Redis queue
 * Queue key format: "queue:threadId"
 * Each entry: { commentIndex, text, timestamp }
 */
export const addToQueue = async (threadId, commentIndex, commentText) => {
  try {
    const queueKey = `queue:${threadId}`;
    
    const entry = JSON.stringify({
      commentIndex,
      text: commentText,
      timestamp: Date.now()
    });

    // Push to queue
    await redisClient.rPush(queueKey, entry);
    
    // Set expiry on queue key (48 hours to be safe)
    await redisClient.expire(queueKey, 48 * 60 * 60);

    console.log(`📨 Added comment ${commentIndex} to queue for thread ${threadId}`);
    
    return { queued: true, queueSize: await getQueueSize(threadId) };
  } catch (err) {
    console.error('❌ Error adding to queue:', err);
    throw err;
  }
};

/**
 * Get current queue size for a thread
 */
export const getQueueSize = async (threadId) => {
  try {
    const queueKey = `queue:${threadId}`;
    const size = await redisClient.lLen(queueKey);
    return size;
  } catch (err) {
    console.error('❌ Error getting queue size:', err);
    return 0;
  }
};

/**
 * Check if batch should be triggered
 * Returns true if: size >= BATCH_SIZE OR oldest entry > BATCH_TIMEOUT_MS
 */
export const shouldTriggerBatch = async (threadId) => {
  try {
    const queueKey = `queue:${threadId}`;
    const size = await redisClient.lLen(queueKey);

    // Check size threshold
    if (size >= BATCH_SIZE) {
      console.log(`🔄 Batch triggered for thread ${threadId}: SIZE (${size}/${BATCH_SIZE})`);
      return true;
    }

    // Check timeout threshold
    if (size > 0) {
      const oldestEntry = await redisClient.lIndex(queueKey, 0);
      if (oldestEntry) {
        const { timestamp } = JSON.parse(oldestEntry);
        const age = Date.now() - timestamp;

        if (age > BATCH_TIMEOUT_MS) {
          console.log(`🔄 Batch triggered for thread ${threadId}: TIMEOUT (${Math.floor(age / 1000 / 60 / 60)}h)`);
          return true;
        }
      }
    }

    return false;
  } catch (err) {
    console.error('❌ Error checking batch trigger:', err);
    return false;
  }
};

/**
 * Process batch: fetch comments, analyze, store results
 */
export const processBatch = async (threadId) => {
  try {
    console.log(`⏳ Processing batch for thread ${threadId}...`);

    const queueKey = `queue:${threadId}`;
    const thread = await Thread.findById(threadId);

    if (!thread) {
      console.error(`❌ Thread ${threadId} not found, clearing queue`);
      await redisClient.del(queueKey);
      return;
    }

    // Get all items from queue
    const queueItems = await redisClient.lRange(queueKey, 0, -1);

    if (queueItems.length === 0) {
      console.log(`✅ Queue empty for thread ${threadId}, nothing to process`);
      return;
    }

    // Parse queue items
    const comments = queueItems.map(item => JSON.parse(item));

    // Build Gemini request with all comments
    let commentsList = '';
    comments.forEach((comment, idx) => {
      commentsList += `${idx}. "${comment.text}"\n`;
    });

    const batchPrompt = `
You are analyzing a batch of comments for a discussion thread.

Thread Summary: """${thread.summary}"""

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
}
`;

    // Send to Gemini
    let analysisResponse;
    try {
      analysisResponse = await client.chat.completions.create({
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: batchPrompt }]
      });
    } catch (geminiErr) {
      console.error('❌ Gemini API error during batch analysis:', geminiErr);
      // Don't clear queue on error, try again later
      return;
    }

    // Parse response
    let analysisResults;
    try {
      analysisResults = parseGeminiJSON(analysisResponse.choices[0].message.content);
    } catch (parseErr) {
      console.error('❌ Failed to parse Gemini response:', parseErr);
      console.error('Response was:', analysisResponse.choices[0].message.content);
      // Clear queue on parse error to prevent infinite loop
      await redisClient.del(queueKey);
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

    // Do NOT mutate the stored comment order here. Frontend will display
    // a relevance-sorted view for users while keeping the DB order stable
    // so comment indices remain valid for analysis lookups.

    // Save thread
    await thread.save();

    // Clear queue
    await redisClient.del(queueKey);

    console.log(`✅ Batch processed for thread ${threadId} (${comments.length} comments analyzed)`);
  } catch (err) {
    console.error('❌ Error processing batch:', err);
  }
};

/**
 * Start periodic batch processor
 * Checks all active queues every 10 seconds
 */
export const startBatchProcessor = () => {
  console.log('🚀 Starting Redis batch processor...');

  const intervalId = setInterval(async () => {
    try {
      // Get all queue keys
      const keys = await redisClient.keys('queue:*');

      for (const key of keys) {
        const threadId = key.replace('queue:', '');
        
        // Check if should trigger batch
        const shouldProcess = await shouldTriggerBatch(threadId);
        
        if (shouldProcess) {
          await processBatch(threadId);
        }
      }
    } catch (err) {
      console.error('❌ Error in batch processor loop:', err);
    }
  }, 10000); // Check every 10 seconds

  return intervalId;
};

/**
 * Stop batch processor
 */
export const stopBatchProcessor = (intervalId) => {
  if (intervalId) {
    clearInterval(intervalId);
    console.log('⛔ Batch processor stopped');
  }
};

/**
 * Flush all pending queues (graceful shutdown)
 */
export const flushAllQueues = async () => {
  try {
    const keys = await redisClient.keys('queue:*');
    
    for (const key of keys) {
      const threadId = key.replace('queue:', '');
      const shouldProcess = await shouldTriggerBatch(threadId);
      
      if (shouldProcess) {
        await processBatch(threadId);
      }
    }
    
    console.log('✅ All queues flushed');
  } catch (err) {
    console.error('❌ Error flushing queues:', err);
  }
};
