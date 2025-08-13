import express from 'express';
import { getMyProfile, upsertProfile } from '../controllers/profileController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/me', protect, getMyProfile);
router.post('/', protect, upsertProfile);

export default router;