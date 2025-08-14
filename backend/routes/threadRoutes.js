import express from 'express';
import Thread from '../models/Thread.js';
import { getThreads, getThreadById, deleteThread, addComment, getThreadByUser, like_unlike } from '../controllers/threadController.js';
import { upload } from '../config/cloudinary.js';
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

//get all the threads
router.get('/',protect,getThreads);

// Create new thread + upload file
router.post('/', protect, upload.single("file"), async (req, res) => {
  try {
    const { title, description, tags } = req.body;

    const newThread = new Thread({
      title,
      description,
      tags: tags ? tags.split(",") : [],
      author: req.user.id,
      filePath: req.file ? req.file.path : null // Cloudinary URL
    });
    await newThread.save();
    res.status(201).json({
      message: "Thread created successfully",
      thread: newThread
    });
  } catch (error) {
    console.error("Error saving thread:", error);
    res.status(500).json({ error: "Failed to create thread" });
  }
});
router.get("/mythreads", protect, getThreadByUser); 
router.post("/:id/like", protect, like_unlike );
router.post("/:id/comments", protect, addComment);
router.get('/:id', getThreadById);
router.delete('/:id', protect, deleteThread);


export default router;