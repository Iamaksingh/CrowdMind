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

// Create or update profile
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
      // Update existing
      profile.username = username || profile.username;
      profile.bio = bio || profile.bio;
      profile.location = location || profile.location;
      profile.website = website || profile.website;
      profile.socialLinks.twitter = twitter || profile.socialLinks.twitter;
      profile.socialLinks.linkedin = linkedin || profile.socialLinks.linkedin;
      profile.socialLinks.github = github || profile.socialLinks.github;

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
      socialLinks: { twitter, linkedin, github }
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