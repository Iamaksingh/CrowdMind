const token = localStorage.getItem("token");
if (!token || token === "0") {
    alert("Please log in first!");
    window.location.href = "login.html";
}

const BaseURL="https://crowdmind-backend.onrender.com/api"
// const BaseURL="http://localhost:5000/api"
// Fetch threads from backend



async function fetchThreads() {
    try {
        const res = await fetch(`${BaseURL}/threads`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const threadData = await res.json(); // Assuming each thread has likedByCurrentUser property
        loadThreads(threadData);

    } catch (error) {
        console.error("Error fetching threads:", error);
    }
}



// Create individual thread element
function createThreadElement(thread) {
    const threadDiv = document.createElement("div");
    threadDiv.classList.add("thread");

    // Initialize heart icon based on liked status
    let liked = thread.likedByCurrentUser ?? false;
    const updateHeart = () => threadDiv.querySelector(".like-btn").innerHTML = `${liked ? '❤️' : '🤍'} ${thread.likes ?? 0}`;

    // Truncate summary to reasonable length
    const summary = thread.summary || thread.description || "No summary available";
    const truncatedSummary = summary.length > 200 ? summary.substring(0, 200) + "..." : summary;

    threadDiv.innerHTML = `
        <a href="thread.html?id=${thread._id}" class="thread-link">
            <div class="thread-card-container">
                <!-- Left: Image -->
                <div class="thread-image-section">
                    ${thread.filePath ? `<img src="${thread.filePath}" class="thread-image" alt="Thread Image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23e0e0e0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2216%22 fill=%22%23999%22%3EImage unavailable%3C/text%3E%3C/svg%3E'">` : `<div class="thread-image-placeholder">📸</div>`}
                </div>
                
                <!-- Right: Content -->
                <div class="thread-content-section">
                    <div class="thread-title">${thread.title}</div>
                    <div class="thread-description">${thread.description || ""}</div>
                    
                    <!-- Summary Box -->
                    <div class="thread-summary-box">
                        <h4>Summary</h4>
                        <p>${truncatedSummary}</p>
                    </div>
                    
                    <!-- Tags -->
                    <div class="thread-tags">
                        ${thread.tags && thread.tags.length > 0 ? thread.tags.map(tag => `<span class="tag">${tag}</span>`).join('') : '<span class="tag">General</span>'}
                    </div>
                </div>
            </div>
        </a>
        <div class="thread-meta">
            <div class="thread-actions">
                <span class="like-btn">${liked ? '❤️' : '🤍'} ${thread.likes ?? 0}</span>
                <span class="comment-btn">💬 ${thread.comments ?? 0}</span>
            </div>
        </div>
    `;

    const likeBtn = threadDiv.querySelector(".like-btn");

    likeBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${BaseURL}/threads/${thread._id}/like`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await res.json();
            likeBtn.innerHTML = `${data.liked ? '❤️' : '🤍'} ${data.likes}`;
        } catch (err) {
            console.error("Error liking thread:", err);
        }
    });

    return threadDiv;
}



// Load threads into container
function loadThreads(threadData) {
    const threadList = document.getElementById("thread-list");
    threadList.innerHTML = ""; // Clear previous
    threadData.forEach(thread => {
        threadList.appendChild(createThreadElement(thread));
    });
}



// Optional: Infinite scroll
function checkScroll() {
    const threadList = document.getElementById("thread-list");
    if (threadList.scrollTop + threadList.clientHeight >= threadList.scrollHeight) {
        fetchThreads();
    }
}



document.getElementById("thread-list").addEventListener("scroll", checkScroll);



// Initial load
fetchThreads();