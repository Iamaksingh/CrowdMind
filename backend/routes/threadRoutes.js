import express from 'express';
import Thread from '../models/Thread.js';
import { getThreads, getThreadById, deleteThread } from '../controllers/threadController.js';
import { upload } from '../config/cloudinary.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

//get all the threads
router.get('/', async (req, res) => {
  try {
    const threads = await Thread.find().sort({ createdAt: -1 }); // latest first
    res.status(200).json(threads);
  } catch (error) {
    console.error("Error fetching threads:", error);
    res.status(500).json({ error: "Failed to fetch threads" });
  }
});

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

router.get('/:id', getThreadById);
router.delete('/:id', protect, deleteThread);

export default router;