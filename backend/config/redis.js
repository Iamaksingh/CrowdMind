import redis from 'redis';

// Support either a single REDIS_URL (e.g. Upstash) or host/port/password env vars
let redisClient;
if (process.env.REDIS_URL) {
  redisClient = redis.createClient({ url: process.env.REDIS_URL });
} else {
  redisClient = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379
    },
    password: process.env.REDIS_PASSWORD || undefined,
    database: 0
  });
}

// Handle connection events
redisClient.on('connect', () => {
  console.log('✅ Redis connected');
});

redisClient.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
});

redisClient.on('disconnect', () => {
  console.log('⚠️ Redis disconnected');
});

export default redisClient;
