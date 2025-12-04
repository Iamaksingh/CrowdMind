import User from '../models/User.js';
import Profile from '../models/userProfile.js';
import jwt from 'jsonwebtoken';



const generateToken = (id) => {
	return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};



export const signup = async (req, res) => {
	try {
		const { email, password } = req.body;

		const exists = await User.findOne({ email });
		if (exists) {
			return res.status(400).json({ message: 'User already exists' });
		}

		const user = await User.create({ email, password });

		// Auto-create profile with default username based on email
		const defaultUsername = email.split('@')[0] + '_' + Math.random().toString(36).substring(7);

		try {
			await Profile.create({
				user: user._id,
				username: defaultUsername,
				avatar: '',
				bio: '',
				location: '',
				website: '',
				socialLinks: {},
				total_posts: 0,
				avg_toxicity: 0,
				avg_bias: 0,
				toxicity_score: 0,
				bias_score: 0
			});
		} catch (profileErr) {
			console.error('Error creating profile:', profileErr);
			// Continue even if profile creation fails
		}

		return res.status(201).json({
			user: { id: user._id, email: user.email },
			token: generateToken(user._id)
		});
	} catch (err) {
		console.error(err);
		return res.status(500).json({ message: 'Server error' });
	}
};



export const login = async (req, res) => {
	try {
		const { email, password } = req.body;
		const user = await User.findOne({ email });
		if (!user) return res.status(401).json({ message: 'Invalid credentials' });

		const valid = await user.matchPassword(password);
		if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

		return res.json({ user: { id: user._id, username: user.username, email: user.email }, token: generateToken(user._id) });
	} catch (err) {
		console.error(err);
		return res.status(500).json({ message: 'Server error' });
	}
};