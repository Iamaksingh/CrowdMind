import express from 'express';
import { getMyProfile, upsertProfile, getLeaderboard } from '../controllers/profileController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload } from '../config/cloudinary.js';

const router = express.Router();
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

router.get('/me', protect, getMyProfile);
router.get('/leaderboard', getLeaderboard); // Public endpoint
router.post('/', protect, upload.single('avatar'), upsertProfile);

export default router;