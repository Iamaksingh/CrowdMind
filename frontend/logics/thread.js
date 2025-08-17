// Get threadId from URL (?id=...)
const params = new URLSearchParams(window.location.search);
const threadId = params.get("id");
const token = localStorage.getItem("token");

if (!token || token === "0") {
    showToast("Please log in first!");
    window.location.href = "login.html";
}

const BaseURL = "http://localhost:5000/api";

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
                    acceptModeratedBtn.onclick = () => {
                        const finalComment = moderatedCommentInput.value.trim();
                        if (!finalComment) return showToast("Comment cannot be empty!");

                        fetch(`${BaseURL}/threads/${threadId}/comments`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${token}`
                            },
                            body: JSON.stringify({ text: finalComment })
                        })
                            .then(res => res.json())
                            .then(() => {
                                moderationModal.classList.add("hidden");
                                showToast("Moderated comment added");
                                commentInput.value = "";
                                loadThread();
                            })
                            .catch(err => {
                                console.error(err);
                                showToast("Error posting moderated comment");
                            });
                    };

                    // Recheck moderated comment
                    recheckModeratedBtn.onclick = async () => {
                        const recheckComment = moderatedCommentInput.value.trim();
                        if (!recheckComment) {
                            showToast("Comment cannot be empty!");
                            return;
                        }

                        try {
                            const result = await postComment(recheckComment); // ⬅️ your function to call backend

                            if (result.message === "moderate this statement to remove bias and toxicity") {
                                // ❌ Still flagged → keep modal open
                                showToast("Still flagged. Please edit and try again.");
                                return;
                            }

                            // ✅ Success → close modal + reset input
                            moderationModal.classList.add("hidden");
                            showToast("Comment posted successfully!");
                            commentInput.value = "";
                            appendCommentToUI(result.comment); // ⬅️ helper to update UI

                        } catch (err) {
                            console.error(err);
                            showToast("Failed to post moderated comment.");
                        }
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
