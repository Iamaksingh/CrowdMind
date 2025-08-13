import mongoose from 'mongoose';
import User from './User.js';

const profileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true, // 1-to-1 relationship
  },
  username: {
    type: String,
    required: true,
    unique: true, // optional: ensures no duplicate display usernames
  },
  avatar: {
    type: String, // URL to profile picture
    default: null,
  },
  bio: {
    type: String,
    default: '',
  },
  location: {
    type: String,
    default: '',
  },
  website: {
    type: String,
    default: '',
  },
  socialLinks: {
    twitter: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    github: { type: String, default: '' },
  },
  avatar: { type: String, default: '' } 
}, { timestamps: true });

const Profile = mongoose.model('Profile', profileSchema);
export default Profile;