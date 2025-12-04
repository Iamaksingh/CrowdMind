/* Calculate running average score combining previous score with new score Uses weighted average: 
   (previous_score * count) + new_score / (count + 1) 
   This allows us to maintain a running average without storing all individual scores */
export const calculateRunningScore = (previousScore, newScore, postCount) => {
	if (postCount === 0) {
		// First post: use the new score directly
		return newScore;
	}
	// Weighted average: (previous_avg * count + new_score) / (count + 1)
	const updatedScore = (previousScore * postCount + newScore) / (postCount + 1);
	return Math.round(updatedScore * 100) / 100; // Round to 2 decimal places
};

/**
 * Update profile with new scores after a post/comment @param {Object} profile - User profile document @param {number} toxicity - New toxicity score (1-100) 
   @param {number} bias - New bias score (1-100) @returns {Object} - Updated profile with new scores */
export const updateProfileScores = (profile, toxicity, bias) => {
	const newPostCount = (profile.total_posts || 0) + 1;

	profile.avg_toxicity = calculateRunningScore(
		profile.avg_toxicity || 0,
		toxicity,
		profile.total_posts || 0
	);

	profile.avg_bias = calculateRunningScore(
		profile.avg_bias || 0,
		bias,
		profile.total_posts || 0
	);

	profile.total_posts = newPostCount;

	// Also update base scores for leaderboard
	profile.toxicity_score = profile.avg_toxicity;
	profile.bias_score = profile.avg_bias;

	return profile;
};
