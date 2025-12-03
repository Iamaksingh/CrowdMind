import Profile from '../models/userProfile.js';
import User from '../models/User.js';

// Get current user's profile
export const getMyProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.user.id });
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const upsertProfile = async (req, res) => {
  try {
    const { username, bio, location, website, twitter, linkedin, github } = req.body;

    // Check if the username is taken by another user
    if (username) {
      const existingUser = await Profile.findOne({ username, user: { $ne: req.user.id } });
      if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
      }
    }

    let profile = await Profile.findOne({ user: req.user.id });

    if (profile) {
      // Update existing profile
      profile.username = username || profile.username;
      profile.bio = bio || profile.bio;
      profile.location = location || profile.location;
      profile.website = website || profile.website;
      profile.socialLinks.twitter = twitter || profile.socialLinks.twitter;
      profile.socialLinks.linkedin = linkedin || profile.socialLinks.linkedin;
      profile.socialLinks.github = github || profile.socialLinks.github;

      // Update avatar if uploaded
      if (req.file) {
        profile.avatar = `${req.file.path}`; // Multer stores file and adds it to req.file
      }

      await profile.save();
      return res.json({ message: 'Profile updated', profile });
    }

    // Create new profile
    profile = new Profile({
      user: req.user.id,
      username,
      bio,
      location,
      website,
      socialLinks: { twitter, linkedin, github },
      avatar: req.file ? `/uploads/${req.file.filename}` : '' // optional avatar
    });

    await profile.save();
    res.status(201).json({ message: 'Profile created', profile });

  } catch (err) {
    console.error(err);

    // Catch duplicate key error from MongoDB (unique index)
    if (err.code === 11000 && err.keyPattern?.username) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    res.status(500).json({ message: 'Server error' });
  }
};

// Get leaderboard sorted by toxicity and bias scores
export const getLeaderboard = async (req, res) => {
  try {
    const { sortBy = 'avg_toxicity', limit = 50, order = 'desc', includeInactive = 'false' } = req.query;

    const sortOrder = order === 'asc' ? 1 : -1;
    const allowedSortFields = ['avg_toxicity', 'avg_bias', 'total_posts'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'avg_toxicity';

    // If includeInactive is true, show all profiles; otherwise only show users with posts
    const query = includeInactive === 'true' ? {} : { total_posts: { $gt: 0 } };

    let leaderboard = await Profile.find(query)
      .select('username avatar avg_toxicity avg_bias total_posts')
      .sort({ [sortField]: sortOrder })
      .limit(parseInt(limit, 10))
      .lean();

    // Ensure all fields have valid values (not undefined)
    leaderboard = leaderboard.map(user => ({
      username: user.username || 'Anonymous',
      avatar: user.avatar || '',
      avg_toxicity: user.avg_toxicity || 0,
      avg_bias: user.avg_bias || 0,
      total_posts: user.total_posts || 0
    }));

    res.json({
      leaderboard,
      sortedBy: sortField,
      order: order === 'asc' ? 'ascending' : 'descending',
      totalCount: leaderboard.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};