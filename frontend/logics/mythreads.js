const token = localStorage.getItem("token");
if (!token || token === "0") {
    alert("Please log in first!");
    window.location.href = "login.html";
}

const BaseURL="https://crowdmind-backend.onrender.com/api"
// Fetch threads from backend
async function fetchThreads() {
    try {
        const res = await fetch(`${BaseURL}/threads/mythreads`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const threadData = await res.json();
        loadThreads(threadData);

    } catch (error) {
        console.error("Error fetching threads:", error);
    }
}

function createThreadElement(thread, likedByUser = false) {
    const threadDiv = document.createElement("div");
    threadDiv.classList.add("thread");
    threadDiv.setAttribute("data-id", thread._id);

    threadDiv.innerHTML = `
        <a href="thread.html?id=${thread._id}" class="thread-link">
            <div class="thread-title">${thread.title}</div>
            <div class="thread-content">${thread.description || ""}</div>
            ${thread.filePath ? `<img src="${thread.filePath}" class="thread-image" alt="Thread Image">` : ""}
        </a>
        <div class="thread-meta">
            <div class="thread-actions">
                <span class="like-btn">${likedByUser ? '❤️' : '🤍'} ${thread.likes ?? 0}</span>
                <span class="comment-btn">💬 ${thread.comments ?? 0}</span>
            </div>
        </div>

        <!-- Delete slider -->
        <div class="delete-slider">
            <div class="delete-slider-track">
                <div class="delete-slider-handle">🗑</div>
                <span class="delete-slider-text">Slide to delete</span>
            </div>
        </div>
    `;

    // Like button logic
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

    // Delete slider logic
    const handle = threadDiv.querySelector(".delete-slider-handle");
    const track = threadDiv.querySelector(".delete-slider-track");
    let isDragging = false;
    let startX = 0, handleWidth = 0, trackWidth = 0, currentX = 0;
    const confirmZoneFactor = 0.9;

    function startDrag(e) {
        e.preventDefault();
        isDragging = true;
        startX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
        handleWidth = handle.offsetWidth;
        trackWidth = track.offsetWidth;
        document.addEventListener("mousemove", onDrag);
        document.addEventListener("touchmove", onDrag);
        document.addEventListener("mouseup", stopDrag);
        document.addEventListener("touchend", stopDrag);
    }

    function onDrag(e) {
        if (!isDragging) return;
        const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
        let delta = clientX - startX;
        delta = Math.max(0, Math.min(delta, trackWidth - handleWidth));
        currentX = delta;
        handle.style.transform = `translateX(${delta}px)`;

        // Confirm zone color
        if (delta >= (trackWidth - handleWidth) * confirmZoneFactor) {
            track.classList.add("confirm");
        } else {
            track.classList.remove("confirm");
        }
    }

    function stopDrag() {
        if (!isDragging) return;
        isDragging = false;
        document.removeEventListener("mousemove", onDrag);
        document.removeEventListener("touchmove", onDrag);
        document.removeEventListener("mouseup", stopDrag);
        document.removeEventListener("touchend", stopDrag);

        if (currentX >= trackWidth - handleWidth) {
            deleteThread(thread._id, threadDiv);
        } else {
            handle.style.transform = "translateX(0)";
            track.classList.remove("confirm");
        }
    }

    handle.addEventListener("mousedown", startDrag);
    handle.addEventListener("touchstart", startDrag);

    return threadDiv;
}

async function deleteThread(id, element) {
    showToast("Deleting thread...", "info");
    try {
        const res = await fetch(`${BaseURL}/threads/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) throw new Error();
        element.remove();
        showToast("Thread deleted successfully!", "success");
    } catch {
        showToast("Error deleting thread", "error");
    }
}

function loadThreads(threadData) {
    const threadList = document.getElementById("thread-list");
    threadList.innerHTML = "";

    // Mark liked threads
    const likedThreadIds = threadData.filter(t => t.likedByCurrentUser).map(t => t._id);

    threadData.forEach(thread => {
        const liked = likedThreadIds.includes(thread._id);
        threadList.appendChild(createThreadElement(thread, liked));
    });
}

// Optional infinite scroll
function checkScroll() {
    const threadList = document.getElementById("thread-list");
    if (threadList.scrollTop + threadList.clientHeight >= threadList.scrollHeight) {
        fetchThreads();
    }
}

document.getElementById("thread-list").addEventListener("scroll", checkScroll);

// Initial load
fetchThreads();

function showToast(message, duration = 3000) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerText = message;
    toastContainer.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 100);
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 500);
    }, duration);
}
