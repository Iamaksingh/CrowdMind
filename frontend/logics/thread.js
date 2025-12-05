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

    // Summary element
    const summaryText = document.getElementById("summary-text");
    const commentCount = document.getElementById("comment-count");

    // Store active analysis polls to avoid duplicates
    const activePolls = new Map();



    // Poll for comment analysis results
    function pollCommentAnalysis(commentIndex, maxRetries = 20) {
        if (activePolls.has(commentIndex)) {
            return; // Already polling this comment
        }

        activePolls.set(commentIndex, 0);
        let retries = 0;

        const pollInterval = setInterval(() => {
            retries++;
            fetch(`${BaseURL}/threads/${threadId}/comments/${commentIndex}/analysis`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                }
            })
                .then(res => res.json())
                .then(data => {
                    const { analysis } = data;

                    // Check if analysis is complete
                    if (analysis.relevance_status === 'completed' && analysis.fact_check_status === 'completed') {
                        // Analysis complete - display badges and stop polling
                        displayCommentAnalysisBadges(commentIndex, analysis);
                        clearInterval(pollInterval);
                        activePolls.delete(commentIndex);
                    } else if (retries >= maxRetries) {
                        // Max retries reached - stop polling
                        console.log(`Analysis polling timed out for comment ${commentIndex}`);
                        clearInterval(pollInterval);
                        activePolls.delete(commentIndex);
                    }
                })
                .catch(err => {
                    console.error("Error polling comment analysis:", err);
                    if (retries >= maxRetries) {
                        clearInterval(pollInterval);
                        activePolls.delete(commentIndex);
                    }
                });
        }, 1000); // Poll every 1 second
    }




    // Display analysis badges on comment
    function displayCommentAnalysisBadges(commentIndex, analysis) {
        // Find comment element by its original index attribute so display order
        // changes don't break badge updates.
        const commentElement = document.querySelector(`.comment[data-comment-index="${commentIndex}"]`);
        if (!commentElement) return;

        let badgesContainer = commentElement.querySelector('.comment-analysis-badges');

        if (!badgesContainer) {
            badgesContainer = document.createElement('div');
            badgesContainer.className = 'comment-analysis-badges';
            commentElement.querySelector('.comment-content').appendChild(badgesContainer);
        }

        // Build badges HTML
        let badgesHTML = '';

        // Relevance badge
        if (analysis.relevance_score !== null && analysis.relevance_score !== undefined) {
            const relevanceClass = analysis.relevance_score >= 70 ? 'high' :
                analysis.relevance_score >= 40 ? 'medium' : 'low';
            badgesHTML += `<span class="badge badge-relevance badge-${relevanceClass}" title="Relevance to thread: ${analysis.relevance_score}%">
                ⚡ ${analysis.relevance_score}% Relevant
            </span>`;
        }

        // Fact-check badge (always show a badge; if no factual claims, show 'Opinion')
        if (analysis) {
            if (analysis.has_factual_claims) {
                const factClass = analysis.factual_accuracy === 'verified' ? 'verified' :
                    analysis.factual_accuracy === 'disputed' ? 'disputed' : 'unverifiable';
                const factIcon = analysis.factual_accuracy === 'verified' ? '✓' :
                    analysis.factual_accuracy === 'disputed' ? '⚠️' : '❓';
                badgesHTML += `<span class="badge badge-factcheck badge-${factClass}" title="Fact-check: ${analysis.factual_accuracy}">
                    ${factIcon} ${analysis.factual_accuracy === 'verified' ? 'Verified' :
                        analysis.factual_accuracy === 'disputed' ? 'Disputed' : 'Unverifiable'}
                </span>`;
            } else {
                // No factual claims detected — show opinion badge
                badgesHTML += `<span class="badge badge-factcheck badge-opinion" title="No factual claims detected - likely an opinion">
                    💬 Opinion
                </span>`;
            }
        }

        if (badgesHTML) {
            badgesContainer.innerHTML = badgesHTML;
        }
    }



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

                // Display thread summary
                if (data.summary && data.summary.trim()) {
                    summaryText.textContent = data.summary;
                } else {
                    summaryText.textContent = "No summary available yet. Comments will generate a summary.";
                }

                if (data.filePath) {
                    threadImage.src = data.filePath;
                    // Handle broken image URLs (old local paths)
                    threadImage.onerror = function () {
                        console.warn("Image failed to load:", data.filePath);
                        this.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23e0e0e0" width="400" height="300"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="20" fill="%23999"%3EImage unavailable%3C/text%3E%3C/svg%3E';
                    };
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



    // Render comments. Do not mutate DB order — display a relevance-sorted copy
    // while preserving original indices for polling and analysis lookups.
    function renderComments(comments) {
        if (!comments || comments.length === 0) {
            commentsContainer.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
            commentCount.textContent = "0";
            return;
        }

        commentsContainer.innerHTML = "";
        commentCount.textContent = comments.length;

        // Create a display copy that keeps original indices
        const commentsWithIndex = comments.map((c, idx) => ({ comment: c, originalIndex: idx }));

        // Sort the display copy by relevance_score descending (treat missing as 0)
        commentsWithIndex.sort((a, b) => {
            const aScore = a.comment.analysis?.relevance_score ?? 0;
            const bScore = b.comment.analysis?.relevance_score ?? 0;
            return bScore - aScore;
        });

        // Render using originalIndex so server-side comment indices remain valid
        commentsWithIndex.forEach(({ comment, originalIndex }) => {
            const commentDiv = document.createElement("div");
            commentDiv.classList.add("comment");
            commentDiv.dataset.commentIndex = originalIndex;

            commentDiv.innerHTML = `
                <img src="${comment.avatar}" alt="${comment.username} Avatar" class="comment-avatar">
                <div class="comment-content">
                    <div class="comment-author">${comment.username}</div>
                    <div class="comment-text">${comment.text}</div>
                    <div class="comment-analysis-badges"></div>
                </div>
            `;

            commentsContainer.appendChild(commentDiv);

            // Start polling for analysis if comment has analysis field with pending status
            if (comment.analysis && (comment.analysis.relevance_status === 'pending' || comment.analysis.fact_check_status === 'pending')) {
                // Show an immediate 'Pending' badge while analysis runs
                const badgesContainer = commentDiv.querySelector('.comment-analysis-badges');
                if (badgesContainer) {
                    badgesContainer.innerHTML = `<span class="badge badge-pending" title="Analysis pending">⏳ Analysis pending</span>`;
                }

                pollCommentAnalysis(originalIndex);
            } else if (comment.analysis && comment.analysis.relevance_status === 'completed') {
                // Analysis already complete - display badges immediately
                displayCommentAnalysisBadges(originalIndex, comment.analysis);
            }
        });
    }



    // Post new comment
    window.addComment = function () {
        const comment = commentInput.value.trim();
        if (!comment) return showToast("Please write a comment!");

        fetch(`${BaseURL}/threads/${threadId}/comments`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ text: comment })
        })
            .then(res => {
                console.log("Comment response status:", res.status);
                if (res.status === 201 || res.status === 200) {
                    // Success or moderation - try to parse JSON
                    return res.json().then(data => ({ ok: true, status: res.status, data }));
                } else if (res.status === 500) {
                    // 500 error - still try to parse in case comment was saved
                    return res.json().then(data => ({ ok: false, status: res.status, data, possibleSuccess: true }));
                } else {
                    // Other errors
                    throw new Error(`Failed to post comment: ${res.status}`);
                }
            })
            .then(response => {
                const { ok, status, data, possibleSuccess } = response;
                console.log("Comment response data:", data);

                // If status is 500 but comment was successful, reload anyway
                if (status === 500 && possibleSuccess) {
                    console.warn("Got 500 error but attempting reload...");
                    showToast("Comment posted (with minor issues)");
                    commentInput.value = "";
                    setTimeout(() => loadThread(), 500);
                    return;
                }

                if (data.comment) {
                    // Safe → comment added directly
                    showToast("Comment added successfully");
                    commentInput.value = "";

                    // Update summary if returned
                    if (data.threadSummary) {
                        summaryText.textContent = data.threadSummary;
                    }

                    // Reload thread after a small delay to ensure DB is updated
                    setTimeout(() => {
                        loadThread();
                        // Start polling for analysis of newly posted comment
                        if (data.commentIndex !== undefined) {
                            setTimeout(() => pollCommentAnalysis(data.commentIndex), 500);
                        }
                    }, 300);
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
                                body: JSON.stringify({ text: finalComment })
                            });

                            console.log("Moderated comment response status:", res.status);

                            let data;
                            try {
                                data = await res.json();
                            } catch (parseErr) {
                                console.error("Failed to parse response:", parseErr);
                                showToast("Error parsing server response");
                                return;
                            }

                            console.log("Moderated comment response data:", data);

                            if (data.comment || res.ok) {
                                // ✅ Comment passed moderation
                                moderationModal.classList.add("hidden");
                                showToast("Comment posted successfully!");
                                commentInput.value = "";
                                moderatedCommentInput.value = "";

                                // Update summary if returned
                                if (data.threadSummary) {
                                    summaryText.textContent = data.threadSummary;
                                }

                                // Reload thread after a small delay
                                setTimeout(() => {
                                    loadThread();
                                    // Start polling for analysis of newly posted moderated comment
                                    if (data.commentIndex !== undefined) {
                                        setTimeout(() => pollCommentAnalysis(data.commentIndex), 500);
                                    }
                                }, 300);
                            } else if (data.moderated) {
                                // ❌ Still flagged → keep modal open
                                moderatedCommentInput.value = data.moderated.moderated_comment;
                                showToast("Still flagged. Please edit and try again.");
                            } else {
                                console.warn("Unexpected response:", data);
                                showToast("Something went wrong, try again.");
                            }

                        } catch (err) {
                            console.error("Error posting moderated comment:", err);
                            showToast("Error posting moderated comment");
                        }
                    };
                    const exitModeratedBtn = document.getElementById("exitModerated");
                    exitModeratedBtn.onclick = () => {
                        moderationModal.classList.add("hidden");
                        commentInput.value = "";
                        moderatedCommentInput.value = "";
                        showToast("Exited moderation without posting");
                    };
                } else {
                    console.warn("Unexpected response structure:", data);
                    showToast("Unexpected response from server");
                }
            })
            .catch(err => {
                console.error("Error posting comment:", err);
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