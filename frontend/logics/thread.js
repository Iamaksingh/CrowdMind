
function addComment() {
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) return;

    const container = document.getElementById('comments-container');

    const commentDiv = document.createElement('div');
    commentDiv.className = 'comment';
    commentDiv.innerHTML = `
        <div class="comment-author">You</div>
        <div class="comment-text">${text}</div>
    `;
    container.appendChild(commentDiv);
    input.value = '';
}