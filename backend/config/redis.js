import { Redis } from "@upstash/redis";



let redis = null;
let isRedisEnabled = false;



// Use REST API for serverless environments (Upstash recommended)
if (process.env.REDIS_REST_URL && process.env.REDIS_REST_TOKEN) {
	try {
		redis = new Redis({
			url: process.env.REDIS_REST_URL,
			token: process.env.REDIS_REST_TOKEN,
		});
		isRedisEnabled = true;
		console.log('✅ Redis (Upstash REST) configured');
	} catch (err) {
		console.warn('⚠️ Redis configuration failed:', err.message);
		isRedisEnabled = false;
	}
} else {
	console.log('ℹ️ Redis not configured (REDIS_REST_URL or REDIS_REST_TOKEN missing)');
}



export { redis, isRedisEnabled };