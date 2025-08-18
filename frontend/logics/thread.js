// Get threadId from URL (?id=...)
const params = new URLSearchParams(window.location.search);
const threadId = params.get("id");
const token = localStorage.getItem("token");

if (!token || token === "0") {
    showToast("Please log in first!");
    window.location.href = "login.html";
}

const BaseURL = "https://crowdmind-backend.onrender.com/api";
// const BaseURL="http://localhost:5000/api"

document.addEventListener("DOMContentLoaded", () => {
    const threadTitle = document.getElementById("thread-title");
    const threadDescription = document.getElementById("thread-description");
    const tags = document.getElementById("tags");
    const commentsContainer = document.getElementById("comments-container");
    const commentInput = document.getElementById("comment-input");

    // Moderation modal elements
    const moderationModal = document.getElementById("moderationModal");
    const moderatedCommentInput = document.getElementById("moderatedComment");
    const acceptModeratedBtn = document.getElementById("acceptModerated");
    const recheckModeratedBtn = document.getElementById("recheckModerated");

    // Thread image setup
    const threadImage = document.createElement("img");
    threadImage.classList.add("thread-photo");
    threadImage.style.marginTop = "10px";

    // Fetch thread details
    function loadThread() {
        fetch(`${BaseURL}/threads/${threadId}`, {
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
                threadTitle.textContent = data.title;
                threadDescription.textContent = data.description;
                tags.textContent = data.tags || "General";

                if (data.filePath) {
                    threadImage.src = data.filePath;
                    if (!document.querySelector(".thread-details img.thread-photo")) {
                        document.querySelector(".thread-details").appendChild(threadImage);
                    }
                }
                renderComments(data.comment_list);
            })
            .catch(err => {
                console.error(err);
                showToast("Error loading thread details");
            });
    }

    // Render comments
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

    // Post new comment
    window.addComment = function () {
        const text = commentInput.value.trim();
        if (!text) return showToast("Please write a comment!");

        fetch(`${BaseURL}/threads/${threadId}/comments`, {
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
            .then(data => {
                if (data.comment) {
                    // Safe → comment added directly
                    showToast("Comment added successfully");
                    commentInput.value = "";
                    loadThread();
                } else if (data.moderated) {
                    // Unsafe → moderation required
                    moderatedCommentInput.value = data.moderated.moderated_comment;
                    moderationModal.classList.remove("hidden");

                    // Accept moderated comment
                    acceptModeratedBtn.onclick = async () => {
                        const finalComment = moderatedCommentInput.value.trim();
                        if (!finalComment) {
                            return showToast("Comment cannot be empty!");
                        }

                        try {
                            const res = await fetch(`${BaseURL}/threads/${threadId}/comments`, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": `Bearer ${token}`
                                },
                                body: JSON.stringify({finalComment})
                            });

                            const data = await res.json();

                            if (data.thread) {
                                // ✅ Thread passed moderation
                                moderationModal.classList.add("hidden");
                                showToast("Thread posted successfully!");
                                resetForm(form, previewContainer);

                            } else if (data.moderated) {
                                // ❌ Still flagged → keep modal open with updated suggestions
                                moderatedCommentInput.value = data.moderated.moderated_comment;
                                showToast("Still flagged. Please edit and try again.");
                            } else {
                                showToast("Something went wrong, try again.");
                            }

                        } catch (err) {
                            console.error(err);
                            showToast("Error posting moderated thread");
                        }
                    };
                    const exitModeratedBtn = document.getElementById("exitModerated");
                    exitModeratedBtn.onclick = () => {
                        moderationModal.classList.add("hidden");
                        commentInput.value = "";
                        moderatedCommentInput.value = "";
                        showToast("Exited moderation without posting");
                    };
                }
            })
            .catch(err => {
                console.error(err);
                showToast("Error posting comment");
            });
    };

    // Initial load
    loadThread();
});

// Toast utility
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
