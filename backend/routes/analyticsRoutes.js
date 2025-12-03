import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { 
  getLeaderboard, 
  generateDiscussionSummary, 
  getDiscussionDashboard 
} from '../controllers/analyticsController.js';

const router = express.Router();

// Get leaderboard
router.get('/leaderboard', getLeaderboard);

// Generate discussion summary
router.get('/discussion/:threadId/summary', protect, generateDiscussionSummary);

// Get discussion dashboard
router.get('/discussion/:threadId/dashboard', protect, getDiscussionDashboard);

export default router;
