// Leaderboard page logic
const BaseURL = "https://crowdmind-backend.onrender.com/api";
// const BaseURL = "http://localhost:5000/api";

const sortBySelect = document.getElementById("sortBy");
const orderBySelect = document.getElementById("orderBy");
const applyFiltersBtn = document.getElementById("applyFilters");
const leaderboardBody = document.getElementById("leaderboardBody");
const loadingDiv = document.getElementById("loading");
const errorDiv = document.getElementById("error");

// Event listeners
applyFiltersBtn.addEventListener("click", loadLeaderboard);

// Initial load
document.addEventListener("DOMContentLoaded", () => {
    loadLeaderboard();
});

async function loadLeaderboard() {
    try {
        // Show loading state
        loadingDiv.style.display = "block";
        errorDiv.style.display = "none";
        leaderboardBody.innerHTML = "";

        // Get filter values
        const sortBy = sortBySelect.value;
        const order = orderBySelect.value;
        const limit = 100; // Get top 100
        const includeInactive = "true"; // Show all users including those with no posts

        // Fetch leaderboard data
        const response = await fetch(
            `${BaseURL}/profile/leaderboard?sortBy=${sortBy}&order=${order}&limit=${limit}&includeInactive=${includeInactive}`
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch leaderboard: ${response.status}`);
        }

        const data = await response.json();
        const leaderboard = data.leaderboard || [];

        // Hide loading state
        loadingDiv.style.display = "none";

        if (leaderboard.length === 0) {
            leaderboardBody.innerHTML =
                '<tr><td colspan="5" style="text-align: center; padding: 20px;">No users yet</td></tr>';
            return;
        }

        // Render leaderboard rows
        leaderboard.forEach((user, index) => {
            // Provide defaults for undefined values
            const toxicity = user.avg_toxicity !== undefined ? user.avg_toxicity : 0;
            const bias = user.avg_bias !== undefined ? user.avg_bias : 0;
            const totalPosts = user.total_posts !== undefined ? user.total_posts : 0;

            const row = document.createElement("tr");
            row.innerHTML = `
                <td class="rank">#${index + 1}</td>
                <td class="user-info">
                    <img src="${user.avatar || 'src/default-avatar.png'}" alt="${user.username}" class="avatar">
                    <span class="username">${user.username || "Anonymous"}</span>
                </td>
                <td class="score toxicity" title="Lower is better">
                    <span class="badge ${getToxicityClass(toxicity)}">
                        ${toxicity.toFixed(1)}
                    </span>
                </td>
                <td class="score bias" title="Lower is better">
                    <span class="badge ${getBiasClass(bias)}">
                        ${bias.toFixed(1)}
                    </span>
                </td>
                <td class="total-posts">
                    <span class="post-count">${totalPosts}</span>
                </td>
            `;
            leaderboardBody.appendChild(row);
        });

    } catch (error) {
        console.error("Error loading leaderboard:", error);
        loadingDiv.style.display = "none";
        errorDiv.style.display = "block";
        errorDiv.innerHTML = `<p>⚠️ Error loading leaderboard: ${error.message}</p>`;
    }
}

// Helper function to determine toxicity badge class
function getToxicityClass(score) {
    if (score === undefined || score === null || isNaN(score)) return "low";
    if (score > 60) return "high";
    if (score > 30) return "medium";
    return "low";
}

// Helper function to determine bias badge class
function getBiasClass(score) {
    if (score === undefined || score === null || isNaN(score)) return "low";
    if (score > 60) return "high";
    if (score > 30) return "medium";
    return "low";
}

// Toast notification function (if not already defined globally)
function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #333;
        color: white;
        padding: 12px 20px;
        border-radius: 5px;
        z-index: 1000;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
