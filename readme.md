## Project Overview
**CrowdMind** is a full-stack discussion platform featuring AI-powered moderation and intelligent comment analysis. Users create and discuss threads with automatic toxicity/bias detection, relevance checking, and fact-verification powered by Google's Gemini API.

### Architecture
- **Backend**: Express.js + MongoDB (Mongoose), deployed on Render
- **Frontend**: Vanilla JS + HTML/CSS (ES6 modules), deployed on Netlify
- **Critical Third-Party Services**: 
  - Gemini API (moderation/analysis, requires `GEMINI_API_KEY`)
  - Cloudinary (file uploads, requires `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`)
  - MongoDB Atlas (requires `MONGO_URI`)
  - JWT authentication (requires `JWT_SECRET`)

---

## Core Data Flow

### User Authentication
1. **Models**: [`User.js`](backend/models/User.js) - emails are unique, passwords hashed with bcryptjs pre-save
2. **Auth Routes** ([`authRoutes.js`](backend/routes/authRoutes.js)): `/signup` and `/login` return JWT token + user object
3. **Middleware** ([`authMiddleware.js`](backend/middleware/authMiddleware.js)): `protect` middleware validates Bearer token, attaches `req.user.id` and `req.user.username`
4. **Frontend**: Token stored in localStorage, included in all API requests as `Authorization: Bearer ${token}`

### Thread Lifecycle

#### 1. Thread Creation ([`threadController.js::createThread`](backend/controllers/threadController.js))

**Input**: title, description, tags, optional file upload

**Moderation & Summary Pipeline**:
- **Step 1**: Send title + description to Gemini API, get toxicity & bias scores (1-100 scale)
- **Step 2**: Check thresholds (toxicity ≤ 70 AND bias ≤ 70)
  - ✅ **Safe**: Create thread normally, generate initial 1-2 sentence summary using Gemini
  - ❌ **Unsafe**: Request Gemini to generate moderated version, return suggestions to user
- **Step 3**: Update user profile with running toxicity/bias scores via [`updateProfileScores()`](backend/utils/scoringUtils.js)

**Response**:
```json
{
  "message": "Thread created successfully",
  "thread": { "_id": "...", "title": "...", "summary": "AI-generated summary" },
  "ratings": { "toxicity": 45, "bias": 30 },
  "userScores": { "avg_toxicity": 45, "avg_bias": 30 }
}
```

Or if moderation required:
```json
{
  "message": "Content requires moderation",
  "ratings": { "toxicity": 85, "bias": 72 },
  "moderated": {
    "moderated_title": "...",
    "moderated_description": "..."
  }
}
```

#### 2. Thread Retrieval
- **`getThreads`**: Returns paginated threads with basic info (title, summary, likes, comments)
- **`getThreadById`**: Returns full thread with `comment_list` array and evolving `summary` field

#### 3. Comment Interactions ([`threadController.js::addComment`](backend/controllers/threadController.js))

**Flow**:
1. **Toxicity/Bias Check**: Analyze comment text (1-100 scale)
2. **Threshold Check**: If toxicity ≤ 70 AND bias ≤ 70 → proceed, else request moderation
3. **Summary Update**: Call Gemini to merge previous summary with new comment (recursive summary)
4. **Profile Scoring**: Update user profile with new toxicity/bias averages
5. **Background Analysis**: Queue async analysis (relevance + fact-check) with 500ms delay

**Response**:
```json
{
  "message": "Comment added successfully",
  "comment": { "username": "...", "text": "...", "analysis": { "relevance_status": "pending" } },
  "commentIndex": 5,
  "ratings": { "toxicity": 40, "bias": 25 },
  "threadSummary": "Updated summary incorporating new comment",
  "userScores": { "avg_toxicity": 42, "avg_bias": 28 }
}
```

---

## Feature: Comment Analysis & Relevance Checking

### How It Works

Each comment undergoes **asynchronous analysis** in the background without blocking the API response:

1. **Fire-and-Forget Queue**: Comment is posted immediately (if safe), analysis starts 500ms later
2. **Parallel Analysis**: Relevance scoring + fact-checking run simultaneously
3. **Frontend Polling**: Browser polls `/api/threads/:threadId/comments/:commentIndex/analysis` until completion
4. **Badge Display**: Once complete, relevance + fact-check badges render on the comment

### Analysis Components

#### A. Relevance Checking ([`analysisService.js::checkRelevance()`](backend/utils/analysisService.js))

**What it does**: Evaluates if a comment is on-topic and contributes to the thread discussion

**Scoring Rubric** (1-100 scale):
- **0–10**: Completely off-topic, random facts, or spam
- **11–30**: Generic comments with no specific connection (e.g., "Good post")
- **31–60**: Somewhat related but mostly deviates from thread focus
- **61–80**: Mostly relevant with minor tangents
- **81–100**: Highly relevant, insightful, directly contributes to discussion

**Frontend Display**: 
```
🟢 High Relevance (81–100) → Green badge
🟡 Medium Relevance (31–80) → Yellow badge
🔴 Low Relevance (0–30) → Red badge
```

**Implementation**: Uses Gemini to analyze thread title/summary + comment text, outputs relevance score and reason

#### B. Fact-Checking ([`analysisService.js::factCheckComment()`](backend/utils/analysisService.js))

**What it does**: Detects factual claims and evaluates their accuracy

**Verdict Options**:
- **"verified"**: Claim is widely known and accurate ✅
- **"disputed"**: Claim contradicts widely accepted facts ❌
- **"unverifiable"**: Insufficient information to verify ❓
- **"No factual claims"**: Comment is opinion-based only 💬

**Frontend Display**:
```
✅ Verified      → Green badge "Verified"
❌ Disputed      → Red badge "Disputed"
❓ Unverifiable  → Yellow badge "Unverifiable"
💬 Opinion       → Blue badge "Opinion"
```

**Implementation**: Uses Gemini to:
1. Detect if comment contains specific claims (dates, stats, names, sources)
2. Evaluate against common world knowledge
3. Return findings + flagged claims

**Example Response**:
```json
{
  "has_factual_claims": true,
  "factual_accuracy": "disputed",
  "findings": "The claim about Earth's population is outdated; current estimates are higher.",
  "flags": ["Earth population claim"]
}
```

### Analysis Schema ([`Thread.js`](backend/models/Thread.js))

Each comment stores analysis results:
```javascript
analysis: {
  relevance_score: Number,           // 1-100, null = not analyzed
  relevance_status: String,          // 'pending', 'completed', 'failed'
  fact_check_status: String,         // 'pending', 'completed', 'failed'
  has_factual_claims: Boolean,       // true if claims detected
  factual_accuracy: String,          // 'verified', 'disputed', 'unverifiable'
  analysis_notes: String             // Combined findings + flags
}
```

### Implementation Details

**Backend Flow** ([`analysisService.js`](backend/utils/analysisService.js)):
1. [`queueCommentAnalysis(threadId, commentIndex)`](backend/utils/analysisService.js) - Fire-and-forget with 500ms delay
2. [`analyzeCommentInBackground()`](backend/utils/analysisService.js) - Runs async, updates thread document with results
3. Both checks run in parallel via `Promise.all()`
4. On error, `analysis_status` set to 'failed', analysis_notes explain failure

**Frontend Flow** ([`thread.js`](frontend/logics/thread.js)):
1. Comment posted, response includes `commentIndex` + analysis with `relevance_status: 'pending'`
2. [`pollCommentAnalysis(commentIndex)`](frontend/logics/thread.js) called, polls every 500ms
3. Once `relevance_status === 'completed'`, call [`displayCommentAnalysisBadges()`](frontend/logics/thread.js)
4. Badges render: `<span class="badge badge-relevance badge-high">High Relevance</span>`

**Badge Styling** ([`thread.css`](frontend/stylesheets/thread.css)):
```css
.badge-relevance.badge-high { background: #d4edda; color: #155724; }
.badge-factcheck.badge-verified { background: #d4edda; color: #155724; border-left: 3px solid #28a745; }
.badge-factcheck.badge-disputed { background: #f8d7da; color: #721c24; border-left: 3px solid #dc3545; }
.badge-factcheck.badge-opinion { background: #eef6f1; color: #2c7a4b; border-left: 3px solid #8fd19e; }
```

---

## Feature: Leaderboard with Running Scores

### How It Works
- Every post (thread) or comment generates toxicity/bias scores (1-100 scale)
- Scores are stored in `Profile` as running averages: `avg_toxicity`, `avg_bias`
- **Running Average Formula**: new_avg= ( (previous_avg×count) + new_score​ ) / ( count + 1 )
- Users with higher toxicity/bias scores appear higher on leaderboard (if sorted descending)
- `total_posts` tracks count of all contributions (threads + comments)

### Implementation Details

**Scoring Utility** ([`backend/utils/scoringUtils.js`](backend/utils/scoringUtils.js)):
- [`calculateRunningScore(previousScore, newScore, postCount)`](backend/utils/scoringUtils.js) - Weighted average calculation
- [`updateProfileScores(profile, toxicity, bias)`](backend/utils/scoringUtils.js) - Updates profile after each post/comment

**Profile Schema** ([`backend/models/userProfile.js`](backend/models/userProfile.js)):
- `avg_toxicity` - Running average of toxicity scores
- `avg_bias` - Running average of bias scores
- `total_posts` - Total count of threads + comments
- `toxicity_score`, `bias_score` - Synced with avg values for leaderboard

**Leaderboard Endpoints**:
- **`GET /api/profile/leaderboard`** ([`profileController.js::getLeaderboard()`](backend/controllers/profileController.js))
  - Query params: `sortBy` (avg_toxicity|avg_bias|total_posts), `limit` (default 50), `order` (asc|desc), `includeInactive` (default false)
  - Returns profiles with only score fields, username, avatar
  - Only includes users with `total_posts > 0` (unless includeInactive=true)

- **`GET /api/analytics/leaderboard`** ([`analyticsController.js::getLeaderboard()`](backend/controllers/analyticsController.js))
  - Alternative analytics leaderboard, includes engagement score calculations

**Frontend Display** ([`leaderboard.html`](frontend/leaderboard.html) + [`leaderboard.js`](frontend/logics/leaderboard.js)):
- Table with columns: Rank, User, Toxicity Score, Bias Score, Total Posts
- Filter controls: Sort by score/posts, ascending/descending order
- Badge classes for score levels:
  - **Low** (0-30): Green background
  - **Medium** (31-60): Yellow background
  - **High** (61-100): Red background

---

## Feature: Recursive Thread Summary

### How It Works
- Each thread has a `summary` field that **evolves with each comment**
- When a comment is added:
  1. Gemini generates: `summary(previous_summary + new_comment)`
  2. This new summary replaces the old one
  3. Process repeats for each new comment → evolving thread narrative

### Implementation Details

**Thread Schema** ([`backend/models/Thread.js`](backend/models/Thread.js)):
- `summary: { type: String, default: '' }` - Stores recursive summary
- Updated on thread creation and each comment addition

**Initial Summary Generation** (in [`createThread()`](backend/controllers/threadController.js)):
- Uses Gemini to create a **1-2 sentence summary** from title + description
- Generated before thread is saved to database
- Provides context immediately when thread loads

**Recursive Summary Generation** (in [`addComment()`](backend/controllers/threadController.js)):
- Uses Gemini prompt: `"Generate updated summary: previous_summary + new_comment"`
- Summary stored in `thread.summary` after save
- Returned to frontend in API response for real-time display
- Fallback: If Gemini fails, keeps previous summary

**Pattern Example**:
```
Initial: "User asks about machine learning best practices"
+ Comment 1: "Deep learning is the way to go"
= New Summary: "Discussion on ML best practices; commenter advocates for deep learning"
+ Comment 2: "But traditional ML works better for small datasets"
= New Summary: "ML approaches debated; deep learning vs traditional ML for different data sizes"
+ Comment 3: "Here's a benchmark showing traditional ML outperforming DL"
= New Summary: "ML comparison: deep learning vs traditional approaches, with evidence favoring traditional ML on small datasets"
```

**Frontend Display** ([`thread.html`](frontend/thread.html) + [`thread.js`](frontend/logics/thread.js)):
- Summary displayed in `.thread-summary-section` box
- Updated in real-time when new comments loaded
- Styled with light blue background and left border accent

---

## Feature: Analytics & Engagement Tracking

### How It Works

The analytics system tracks user engagement and content performance metrics:

**Metrics Tracked**:
- User: `totalPosts`, `totalComments`, `totalLikes`, `averageToxicity`, `averageBias`, `engagementScore`
- Thread: `views`, `likes`, `comments`, `engagementScore`

**Engagement Score Formula**:
```
engagementScore = (likes × 2) + (comments × 5) + (views × 0.1) - toxicity_penalty - bias_penalty
```

### Implementation Details

**Analytics Controller** ([`backend/controllers/analyticsController.js`](backend/controllers/analyticsController.js)):
- [`calculateEngagementScore(user)`](backend/controllers/analyticsController.js) - Weighted engagement calculation
- [`updateUserToxicity(userId, toxicity, bias, type)`](backend/controllers/analyticsController.js) - Tracks toxicity history
- [`generateDiscussionSummary(threadId)`](backend/controllers/analyticsController.js) - AI-generated discussion context
- [`getDiscussionDashboard(threadId)`](backend/controllers/analyticsController.js) - Dashboard stats for thread
- [`updateThreadEngagement(threadId, type)`](backend/controllers/analyticsController.js) - Updates view/like/comment counts

**Analytics Routes** ([`analyticsRoutes.js`](backend/routes/analyticsRoutes.js)):
- `GET /api/analytics/leaderboard` - Alternative leaderboard with engagement scores
- `GET /api/analytics/discussion/:threadId/summary` - AI summary of discussion
- `GET /api/analytics/discussion/:threadId/dashboard` - Full dashboard with stats

**User Toxicity History**:
- Stored as array: `user.toxicityHistory[{ score, type, createdAt }]`
- Keeps last 100 entries for memory efficiency
- Recent scores (last 20) used for average calculations

---

## Critical Files & Their Responsibilities

### Backend Core
- [`backend/server.js`](backend/server.js) - Express app setup, CORS config, route mounting, analytics routes
- [`backend/config/db.js`](backend/config/db.js) - MongoDB connection initialization
- [`backend/config/cloudinary.js`](backend/config/cloudinary.js) - Cloudinary multer setup for file uploads

### Models
- [`backend/models/User.js`](backend/models/User.js) - User schema with password hashing, likedThreads tracking
- [`backend/models/Thread.js`](backend/models/Thread.js) - Thread + comment schemas with analysis fields, pre-hooks for auto-sync
- [`backend/models/userProfile.js`](backend/models/userProfile.js) - User profile with score tracking and social links

### Middleware & Utilities
- [`backend/middleware/authMiddleware.js`](backend/middleware/authMiddleware.js) - JWT token validation (used on all protected routes)
- [`backend/utils/scoringUtils.js`](backend/utils/scoringUtils.js) - Running score calculation utilities
- [`backend/utils/analysisService.js`](backend/utils/analysisService.js) - Comment relevance checking, fact-checking, background analysis queueing

### Controllers
- [`backend/controllers/authController.js`](backend/controllers/authController.js) - Sign up, login, profile creation
- [`backend/controllers/threadController.js`](backend/controllers/threadController.js) - Core business logic: create/read/delete threads, add comments, handle moderation, generate summaries
- [`backend/controllers/profileController.js`](backend/controllers/profileController.js) - Profile management, leaderboard endpoint
- [`backend/controllers/analyticsController.js`](backend/controllers/analyticsController.js) - Engagement tracking, dashboard generation, alternative leaderboard

### Routes
- [`backend/routes/authRoutes.js`](backend/routes/authRoutes.js) - Auth endpoints (`/signup`, `/login`)
- [`backend/routes/threadRoutes.js`](backend/routes/threadRoutes.js) - Thread CRUD + comment operations
- [`backend/routes/profileRoutes.js`](backend/routes/profileRoutes.js) - Profile management + leaderboard
- [`backend/routes/analyticsRoutes.js`](backend/routes/analyticsRoutes.js) - Analytics endpoints

### Frontend Pages
- [`frontend/index.html`](frontend/index.html) - Login/signup page
- [`frontend/landing.html`](frontend/landing.html) - Home feed with all threads
- [`frontend/thread.html`](frontend/thread.html) - Individual thread detail + comments
- [`frontend/new_thread.html`](frontend/new_thread.html) - Create new thread form
- [`frontend/mythreads.html`](frontend/mythreads.html) - User's own threads
- [`frontend/leaderboard.html`](frontend/leaderboard.html) - Leaderboard rankings
- [`frontend/profile.html`](frontend/profile.html) - User profile editor

### Frontend Logic
- [`frontend/logics/login.js`](frontend/logics/login.js) - Authentication, token management, form submission
- [`frontend/logics/landing.js`](frontend/logics/landing.js) - Fetch & display threads on home page
- [`frontend/logics/thread.js`](frontend/logics/thread.js) - Load thread details, render comments, analysis polling, moderation modal
- [`frontend/logics/new_thread.js`](frontend/logics/new_thread.js) - Thread creation form, file upload preview, moderation handling
- [`frontend/logics/mythreads.js`](frontend/logics/mythreads.js) - User's threads list, delete functionality
- [`frontend/logics/leaderboard.js`](frontend/logics/leaderboard.js) - Fetch & sort leaderboard data
- [`frontend/logics/profile.js`](frontend/logics/profile.js) - Load profile, edit form, avatar upload

### Styling
- [`frontend/stylesheets/navbar.css`](frontend/stylesheets/navbar.css) - Sidebar navigation
- [`frontend/stylesheets/thread.css`](frontend/stylesheets/thread.css) - Thread page layout + analysis badges
- [`frontend/stylesheets/landing.css`](frontend/stylesheets/landing.css) - Home feed styling
- [`frontend/stylesheets/leaderboard.css`](frontend/stylesheets/leaderboard.css) - Leaderboard table styling
- [`frontend/stylesheets/moderation.css`](frontend/stylesheets/moderation.css) - Moderation modal styling
- [`frontend/stylesheets/mobileResponsive.css`](frontend/stylesheets/mobileResponsive.css) - Mobile breakpoints

---

## Key Conventions

### Backend Patterns
- **Mongoose Pre-hooks** ([`Thread.js`](backend/models/Thread.js)): Auto-sync comment count on `.save()` and update operations
- **Error Handling**: All controllers return JSON error responses with `.message` property
- **Authentication Check**: Always include `@protect` middleware for routes requiring auth
- **Response Format**: Success = status 200-201 with JSON; Errors = 400/401/500 with `{ message: "..." }`
- **Async Analysis**: Non-blocking background tasks queued with 500ms delay via `setTimeout()`

### Frontend Patterns
- **API Calls**: Use native `fetch()`, always include `Authorization` header with token
- **BaseURL**: Conditionally set to Render backend (`https://crowdmind-backend.onrender.com/api`) or localhost in each file
- **UI Updates**: Use vanilla DOM manipulation (create elements, innerHTML, classList)
- **Token Management**: Check `localStorage.getItem("token")` on page load; redirect to login if missing or "0"
- **Toast Notifications**: Custom `showToast()` function creates temporary notification div
- **Polling Pattern**: `setInterval()` with retry limit for analysis status checks
- **Moderation Modal**: Show original + moderated text, allow accept/reject/edit flow

---

## Development Workflows

### Running Locally
```bash
# Backend (requires .env with MONGO_URI, JWT_SECRET, GEMINI_API_KEY, Cloudinary vars)
cd backend
npm install
npm run dev  # nodemon watches changes, server runs on port 5000

# Frontend
# Serve with Live Server (VS Code extension) on port 5500
# Or use: python -m http.server 5500
```

### Environment Variables (Backend .env)
```
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/crowdmind
JWT_SECRET=your-secret-key-here
GEMINI_API_KEY=your-gemini-api-key
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
PORT=5000
```

### Adding New Endpoints

1. **Create controller** in `backend/controllers/newController.js`:
```javascript
export const newAction = async (req, res) => {
  try {
    // Business logic
    res.json({ message: "Success", data: result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

2. **Add route** in `backend/routes/newRoutes.js`:
```javascript
import { protect } from '../middleware/authMiddleware.js';
import { newAction } from '../controllers/newController.js';

const router = express.Router();
router.post('/', protect, newAction);  // @protect if auth required
export default router;
```

3. **Register in** `backend/server.js`:
```javascript
app.use('/api/new', newRoutes);
```

4. **Frontend**: Use `BaseURL + endpoint` with Bearer token:
```javascript
const res = await fetch(`${BaseURL}/new`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  },
  body: JSON.stringify(data)
});
```

---

## Common Pitfalls & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Missing token in frontend | Token not checked before API calls | Check `localStorage.getItem("token")` on page load; redirect if "0" or missing |
| CORS errors | Origin not whitelisted | Verify origin in `allowedOrigins` array in [`server.js`](backend/server.js) |
| Comment count mismatch | Pre-hooks not firing | Use `.save()` or update operations, not direct MongoDB |
| Gemini API errors | Invalid API key or quota exceeded | Check `GEMINI_API_KEY` is set; verify response parsing with `parseGeminiJSON()` |
| File upload fails | Cloudinary config wrong | Verify env vars; check `upload.single("file")` middleware placed before controller |
| Score not updating | Profile doesn't exist | Create profile on signup; ensure `updateProfileScores()` called and saved |
| Summary not generating | Previous summary is null | Check previous summary not null/undefined before passing to Gemini prompt |
| Analysis never completes | Polling fails silently | Check browser console; verify API endpoint `/threads/:id/comments/:index/analysis` exists |
| Badge doesn't render | Analysis status never completes | Check backend logs for Gemini errors; verify `analyzeCommentInBackground()` runs |
| Moderation modal doesn't show | Response structure unexpected | Verify Gemini returns `moderated` object with `moderated_title` and `moderated_description` |

---

## Testing & Debugging

### Postman Workflow

1. **Get Token**:
   ```
   POST /api/auth/login
   Body: { "email": "test@test.com", "password": "password" }
   ```

2. **Set Authorization**: Copy token to Bearer token in Postman header

3. **Test Thread Creation**:
   ```
   POST /api/threads
   Body: { "title": "Test", "description": "...", "tags": "test" }
   Headers: Authorization: Bearer <token>
   ```

4. **Test Leaderboard**:
   ```
   GET /api/profile/leaderboard?sortBy=avg_toxicity&order=desc&limit=10
   ```

5. **Test Analysis Status** (after creating comment):
   ```
   GET /api/threads/<threadId>/comments/<commentIndex>/analysis
   ```

### Manual Testing Checklist

- [ ] Create thread → verify summary generated
- [ ] Add comment → verify moderation modal appears if unsafe
- [ ] Add safe comment → verify analysis polling starts
- [ ] Wait 5s → verify badges appear on comment
- [ ] Check leaderboard → verify scores updated
- [ ] Delete thread → verify count decrements
- [ ] Upload file → verify Cloudinary URL stored
- [ ] Multiple comments → verify summary evolves

### Debug Logs

**Backend**:
```bash
# Check Gemini API response
console.log("Gemini response:", summaryResponse.choices[0].message.content);

# Check pre-hook execution
console.log("Pre-save hook fired, comment count:", this.comments);

# Check analysis queuing
console.log(`Analysis queued for comment ${commentIndex}`);
```

**Frontend**:
```javascript
// Check analysis polling
console.log("Polling analysis...", analysis);

// Check API response
console.log("Comment response:", data);

// Check localStorage
console.log("Token:", localStorage.getItem("token"));
```

### Browser DevTools

- **Network tab**: Shows all API calls, response status, JSON body
- **Application tab**: Shows localStorage token, check if "0" or missing
- **Console**: Check for fetch errors, Gemini parsing issues
- **Elements**: Inspect badge HTML structure, verify classes applied

---

## Performance Considerations

- **Background Analysis**: 500ms delay allows DB write to complete before analysis starts
- **Polling Timeout**: Max 20 retries (10 seconds) before polling stops
- **Toxicity History**: Keeps last 100 entries to avoid array growth
- **Leaderboard**: Limits default to 50 users, use pagination for larger sets
- **Summary Generation**: Kept brief (1-2 sentences) to minimize Gemini API usage
- **Badge Caching**: Analysis results stored in DB, no re-computation

---

## Future Enhancements

- [ ] WebSocket support for real-time comments + analysis updates
- [ ] Caching layer (Redis) for leaderboard calculations
- [ ] Advanced search with Elasticsearch
- [ ] User muting/blocking system
- [ ] Thread categories and pinned threads
- [ ] Email notifications for thread activity
- [ ] Export thread as PDF/markdown
- [ ] Comment threading (nested replies)
- [ ] Advanced moderation dashboard for admins
- [ ] A/B testing for moderation thresholds
