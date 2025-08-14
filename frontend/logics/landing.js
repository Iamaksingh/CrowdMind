const token = localStorage.getItem("token");
if (!token || token === "0") {
    alert("Please log in first!");
    window.location.href = "login.html";
}

// Fetch threads from backend
async function fetchThreads() {
    try {
        const res = await fetch("https://crowdmind-backend.onrender.com/api/threads", {
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

    threadDiv.innerHTML = `
        <a href="thread.html?id=${thread._id}" class="thread-link">
            <div class="thread-title">${thread.title}</div>
            <div class="thread-content">${thread.description || ""}</div>
            ${thread.filePath ? `<img src="${thread.filePath}" class="thread-image" alt="Thread Image">` : ""}
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
            const res = await fetch(`https://crowdmind-backend.onrender.com/api/threads/${thread._id}/like`, {
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
