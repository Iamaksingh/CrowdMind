// Get threadId from URL (?id=...)
const params = new URLSearchParams(window.location.search);
const threadId = params.get("id");
const token = localStorage.getItem("token");

if (!token || token === "0") {
    showToast("Please log in first!");
    window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", () => {
    const threadTitle = document.getElementById("thread-title");
    const threadDescription = document.getElementById("thread-description");
    const tags = document.getElementById("tags");
    const commentsContainer = document.getElementById("comments-container");
    const commentInput = document.getElementById("comment-input");

    // Create an image element for the thread photo
    const threadImage = document.createElement("img");
    threadImage.classList.add("thread-photo");
    threadImage.style.marginTop = "10px";

    // Function to fetch and display thread
    function loadThread() {
        fetch(`http://localhost:5000/api/threads/${threadId}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        })
            .then(res => {
                if (!res.ok) throw new Error(`Failed to fetch thread: ${res.status}`);
                return res.json();
            })
            .then(data => {
                // Populate thread details
                threadTitle.textContent = data.title;
                threadDescription.textContent = data.description;
                tags.textContent = data.tags || "General";

                // If filePath exists, display it
                if (data.filePath) {
                    threadImage.src = data.filePath;
                    // Prevent appending multiple times
                    if (!document.querySelector(".thread-details img.thread-photo")) {
                        document.querySelector(".thread-details").appendChild(threadImage);
                    }
                }

                // Populate comments
                renderComments(data.comment_list);
            })
            .catch(err => {
                console.error(err);
                showToast("Error loading thread details");
            });
    }

    // Function to render comments
    function renderComments(comments) {
        if (!comments || comments.length === 0) {
            commentsContainer.innerHTML = "<p>No comments yet.</p>";
            return;
        }
        commentsContainer.innerHTML = "";
        comments.forEach(comment => {
            const commentDiv = document.createElement("div");
            commentDiv.classList.add("comment");

            commentDiv.innerHTML = `
                <img src="${comment.avatar}" alt="${comment.username} Avatar" class="comment-avatar">
                <div class="comment-content">
                    <div class="comment-author">${comment.username}</div>
                    <div class="comment-text">${comment.text}</div>
                </div>
            `;

            commentsContainer.appendChild(commentDiv);
        });
    }

    // Post a new comment
    window.addComment = function () {
        const text = commentInput.value.trim();
        if (!text) return showToast("Please write a comment!");

        fetch(`http://localhost:5000/api/threads/${threadId}/comments`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ text })
        })
            .then(res => {
                if (!res.ok) throw new Error(`Failed to post comment: ${res.status}`);
                return res.json();
            })
            .then(() => {
                showToast("added comment");
                commentInput.value = "";
                // Refetch updated thread so comments list refreshes
                loadThread();
            })
            .catch(err => {
                console.error(err);
                showToast("Error posting comment");
            });
    };

    // Initial load
    loadThread();
});


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