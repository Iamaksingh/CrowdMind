import express from 'express';
import Thread from '../models/Thread.js';
import { createThread, getThreads, getThreadById, deleteThread, addComment, getThreadByUser, like_unlike } from '../controllers/threadController.js';
import { upload } from '../config/cloudinary.js';
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

//get all the threads
router.get('/',protect,getThreads);

// Create new thread + upload file
router.post('/', protect, upload.single("file"), createThread);
router.get("/mythreads", protect, getThreadByUser); 
router.post("/:id/like", protect, like_unlike );
router.post("/:id/comments", protect, addComment);
router.get('/:id', getThreadById);
router.delete('/:id', protect, deleteThread);


export default router;