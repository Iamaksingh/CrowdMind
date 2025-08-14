// 🚨 Redirect if not logged in
const token = localStorage.getItem("token");
if (!token || token === "0") {
    showToast("Please log in first!");
    window.location.href = "login.html";
}

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("new-thread-form");
    const fileInput = document.getElementById("media-upload-input");
    const customButton = document.getElementById("custom-upload-btn");
    const fileNameDisplay = document.getElementById("file-name");
    const previewContainer = document.getElementById("preview-container");

    let selectedFiles = [];

    // 📂 Open file dialog
    customButton.addEventListener("click", (e) => {
        e.preventDefault();
        fileInput.click();
    });

    // 📷 File selection preview
    fileInput.addEventListener("change", () => {
        selectedFiles = Array.from(fileInput.files);
        updateFileName();
        updatePreviews();
    });

    function updateFileName() {
        fileNameDisplay.textContent = selectedFiles.length
            ? `${selectedFiles.length} file(s) selected`
            : "No file chosen";
    }

    function updatePreviews() {
        previewContainer.innerHTML = "";

        selectedFiles.forEach((file, index) => {
            const fileURL = URL.createObjectURL(file);
            const previewElement = document.createElement("div");
            previewElement.classList.add("preview-item");

            if (file.type.startsWith("image")) {
                previewElement.innerHTML = `<img src="${fileURL}" alt="Uploaded Image">`;
            } else if (file.type.startsWith("video")) {
                previewElement.innerHTML = `<video controls><source src="${fileURL}" type="${file.type}"></video>`;
            }

            const removeButton = document.createElement("button");
            removeButton.textContent = "✖";
            removeButton.classList.add("remove-btn");
            removeButton.addEventListener("click", () => {
                selectedFiles.splice(index, 1);
                updateFileInput();
                updatePreviews();
            });

            previewElement.appendChild(removeButton);
            previewContainer.appendChild(previewElement);
        });
    }

    function updateFileInput() {
        const dataTransfer = new DataTransfer();
        selectedFiles.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;
        updateFileName();
    }

    // 🚀 Submit form
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const title = document.getElementById("title").value.trim();
        const description = document.getElementById("description").value.trim();
        const tags = document.getElementById("tags").value.trim();

        if (!title || !description) {
            showToast("Title and description are required!");
            return;
        }

        const formData = new FormData();
        formData.append("title", title);
        formData.append("description", description);
        formData.append("tags", tags);

        selectedFiles.forEach(file => {
            formData.append("file", file);
        });

        //add loading
        loading.classList.remove("hidden");
        //remove thread button
        let submitButton = document.getElementById("submitButton");
        submitButton.classList.add("hidden");

        try {
            const response = await fetch("http://localhost:5000/api/threads", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData
            });

            const result = await response.json();
            if (!response.ok) {
                console.error("Error posting thread:", result);
                showToast(`Failed to post: ${result.message || "Unknown error"}`);
                return;
            }

            console.log("✅ Thread posted:", result);
            showToast("Thread posted successfully!");

            form.reset();
            selectedFiles = [];
            updateFileName();
            previewContainer.innerHTML = "";

        } catch (error) {
            console.error("Network error:", error);
            showToast("Network error. Please try again.");
        } finally {
            // Hide loading spinner
            loading.classList.add("hidden");
            // show submit button
            submitButton.classList.remove("hidden");
        }
    });
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