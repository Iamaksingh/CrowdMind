// Fetch threads from your backend API instead of using dummy data
async function fetchThreads() {
    try {
        // Replace URL with your actual backend endpoint
        const res = await fetch("http://localhost:5000/api/threads", {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        });

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const threadData = await res.json(); // Assuming backend sends an array of threads
        loadThreads(threadData);

    } catch (error) {
        console.error("Error fetching threads:", error);
    }
}

function createThreadElement(thread) {
    const threadDiv = document.createElement("div");
    threadDiv.classList.add("thread");

    threadDiv.innerHTML = `
        <div class="thread-title">${thread.title}</div>
        <div class="thread-content">${thread.description || ""}</div>
        ${thread.filePath ? `<img src="${thread.filePath}" class="thread-image" alt="Thread Image">` : ""}
        <div class="thread-meta">
            <div class="thread-actions">
                <span class="like-btn">❤️ ${thread.likes ?? 0}</span>
                <span class="comment-btn">💬 ${thread.comments ?? 0}</span>
            </div>
        </div>
    `;

    // Like button click event
    threadDiv.querySelector(".like-btn").addEventListener("click", function () {
        thread.likes = (thread.likes ?? 0) + 1;
        this.innerHTML = `❤️ ${thread.likes}`;
    });

    return threadDiv;
}

// Function to load threads into the thread list
function loadThreads(threadData) {
    const threadList = document.getElementById("thread-list");
    threadData.forEach(thread => {
        threadList.appendChild(createThreadElement(thread));
    });
}

// Optional: Infinite Scroll (works if backend supports pagination)
function checkScroll() {
    const threadList = document.getElementById("thread-list");
    if (threadList.scrollTop + threadList.clientHeight >= threadList.scrollHeight) {
        fetchThreads(); // Fetch more threads when bottom reached
    }
}

// Attach scroll event listener
document.getElementById("thread-list").addEventListener("scroll", checkScroll);

// Initial load
fetchThreads();
