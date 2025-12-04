import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import threadRoutes from './routes/threadRoutes.js';
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import { isRedisEnabled } from './config/redis.js';
import { startBatchProcessor, stopBatchProcessor, flushAllQueues } from './utils/commentQueueService.js';


dotenv.config();
const app = express();
const allowedOrigins = [
	"http://127.0.0.1:5500",   // live frontend in VS Code
	"http://localhost:5500",   // optional alternative
	"https://crowdmind.netlify.app" // production frontend
];

app.use(cors({
	origin: function (origin, callback) {
		if (!origin) return callback(null, true); // allow non-browser requests like Postman
		if (allowedOrigins.indexOf(origin) === -1) {
			const msg = "CORS policy does not allow this origin.";
			return callback(new Error(msg), false);
		}
		return callback(null, true);
	},
	credentials: true
}));

app.use(express.json());



// Routes
app.use('/api/auth', authRoutes);
app.use('/api/threads', threadRoutes);
app.use('/api/profile', profileRoutes);
const PORT = process.env.PORT || 5000;
let batchProcessorInterval = null;



const start = async () => {
	try {
		// Connect to MongoDB
		await connectDB(process.env.MONGO_URI);
		console.log('✅ MongoDB connected');

		// Start batch processor (Redis optional)
		if (isRedisEnabled) {
			batchProcessorInterval = startBatchProcessor();
			console.log('✅ Comment batch processor started');
		} else {
			console.log('ℹ️ Redis disabled, comment queue will use in-memory storage');
		}

		// Start server
		app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
	} catch (err) {
		console.error('❌ Failed to start server:', err);
		process.exit(1);
	}
};



// Graceful shutdown
process.on('SIGINT', async () => {
	console.log('\n⛔ Shutting down gracefully...');

	try {
		// Flush any remaining queues
		await flushAllQueues();

		// Stop batch processor
		stopBatchProcessor(batchProcessorInterval);

		console.log('✅ Server shutdown complete');
		process.exit(0);
	} catch (err) {
		console.error('Error during shutdown:', err);
		process.exit(1);
	}
});



start();