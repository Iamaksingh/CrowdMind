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

    // Truncate summary
    const summary = thread.summary || thread.description || "No summary available";
    const truncatedSummary = summary.length > 200 ? summary.substring(0, 200) + "..." : summary;

    threadDiv.innerHTML = `
        <a href="thread.html?id=${thread._id}" class="thread-link">
            <div class="thread-card-container">
                
                <!-- Left: Image -->
                <div class="thread-image-section">
                    ${thread.filePath
                        ? `<img src="${thread.filePath}" class="thread-image" alt="Thread Image"
                             onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23e0e0e0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%22550%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2216%22 fill=%22%23999%22%3EImage unavailable%3C/text%3E%3C/svg%3E'">`
                        : `<div class="thread-image-placeholder">📸</div>`
                    }
                </div>
                
                <!-- Right: Content -->
                <div class="thread-content-section">
                    <div class="thread-title">${thread.title}</div>
                    <div class="thread-description">${thread.description || ""}</div>

                    <div class="thread-summary-box">
                        <h4>Summary</h4>
                        <p>${truncatedSummary}</p>
                    </div>

                    <div class="thread-tags">
                        ${thread.tags && thread.tags.length > 0 
                            ? thread.tags.map(tag => `<span class="tag">${tag}</span>`).join('')
                            : `<span class="tag">General</span>`
                        }
                    </div>
                </div>

            </div>
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

    /* LIKE BUTTON LOGIC */
    const likeBtn = threadDiv.querySelector(".like-btn");
    likeBtn.addEventListener("click", async (e) => {
        e.preventDefault();   // prevent redirect to thread
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

    /* DELETE SLIDER LOGIC */
    const handle = threadDiv.querySelector(".delete-slider-handle");
    const track = threadDiv.querySelector(".delete-slider-track");
    let dragging = false, startX = 0, handleWidth = 0, trackWidth = 0, currentX = 0;
    const confirmZoneFactor = 0.9;

    function startDrag(e) {
        e.preventDefault();
        dragging = true;
        startX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
        handleWidth = handle.offsetWidth;
        trackWidth = track.offsetWidth;
        document.addEventListener("mousemove", onDrag);
        document.addEventListener("touchmove", onDrag);
        document.addEventListener("mouseup", stopDrag);
        document.addEventListener("touchend", stopDrag);
    }

    function onDrag(e) {
        if (!dragging) return;
        const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
        let delta = Math.max(0, Math.min(clientX - startX, trackWidth - handleWidth));
        currentX = delta;
        handle.style.transform = `translateX(${delta}px)`;
        delta >= (trackWidth - handleWidth) * confirmZoneFactor
            ? track.classList.add("confirm")
            : track.classList.remove("confirm");
    }

    function stopDrag() {
        if (!dragging) return;
        dragging = false;
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

    threadData.forEach(thread => {
        threadList.appendChild(createThreadElement(thread, thread.likedByCurrentUser));
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
