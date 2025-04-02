// Dummy data for threads (Replace with actual API call later)
let threadData = [
    { 
        title: "How to improve AI Ethics?", 
        content: "Discussion on AI bias and ethics.", 
        likes: 12, 
        comments: 5, 
        image: "src/ai_ethics.jpeg" 
    },
    { 
        title: "Best practices in UX design", 
        content: "Exploring the latest trends in UX.", 
        likes: 8, 
        comments: 3,
        image: null // No image for this thread
    },
    { 
        title: "Quantum Computing Advances", 
        content: "New research breakthroughs in QC.", 
        likes: 15, 
        comments: 7, 
        image: "src/quantum_advances.jpg"
    },
    { 
        title: "Is JavaScript still the king?", 
        content: "Debate on JS dominance in web dev.", 
        likes: 20, 
        comments: 10,
        image: "src/js_king.webp"
    }
];

// Function to create a thread card
function createThreadElement(thread) {
    const threadDiv = document.createElement("div");
    threadDiv.classList.add("thread");

    threadDiv.innerHTML = `
        <div class="thread-title">${thread.title}</div>
        <div class="thread-content">${thread.content}</div>
        ${thread.image ? `<img src="${thread.image}" class="thread-image" alt="Thread Image">` : ""}
        <div class="thread-meta">
            <div class="thread-actions">
                <span class="like-btn">❤️ ${thread.likes}</span>
                <span class="comment-btn">💬 ${thread.comments}</span>
            </div>
        </div>
    `;

    // Like button click event
    threadDiv.querySelector(".like-btn").addEventListener("click", function() {
        thread.likes++;
        this.innerHTML = `❤️ ${thread.likes}`;
    });

    return threadDiv;
}

// Function to load threads into the thread list
function loadThreads() {
    const threadList = document.getElementById("thread-list");
    threadData.forEach(thread => {
        threadList.appendChild(createThreadElement(thread));
    });
}

// Infinite Scroll: Load more threads when scrolling to the bottom
function checkScroll() {
    const threadList = document.getElementById("thread-list");
    if (threadList.scrollTop + threadList.clientHeight >= threadList.scrollHeight) {
        loadThreads();
    }
}

// Attach Scroll Event Listener
document.getElementById("thread-list").addEventListener("scroll", checkScroll);

// Initial Load
loadThreads();

