// 🚨 Redirect if not logged in
const token = localStorage.getItem("token");
if (!token || token === "0") {
    showToast("Please log in first!");
    window.location.href = "login.html";
}

const BaseURL = "https://crowdmind-backend.onrender.com/api";
// const BaseURL="http://localhost:5000/api"

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("new-thread-form");
    const fileInput = document.getElementById("media-upload-input");
    const customButton = document.getElementById("custom-upload-btn");
    const fileNameDisplay = document.getElementById("file-name");
    const previewContainer = document.getElementById("preview-container");
    const loading = document.getElementById("loading");
    const submitButton = document.getElementById("submitButton");

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

        // Show loading, hide button
        loading.classList.remove("hidden");
        submitButton.classList.add("hidden");

        try {
            const result = await postThread(formData);

            if (result.message === "Content requires moderation") {
                showModerationModal(result.moderated, formData, form, loading, submitButton, previewContainer);
            } else {
                showToast("Thread posted successfully!");
                resetForm(form, previewContainer);
            }
        } catch (error) {
            console.error("Network error:", error);
            showToast("Network error. Please try again.");
        } finally {
            loading.classList.add("hidden");
            submitButton.classList.remove("hidden");
        }
    });
});

// 🔔 Toast utility
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

// 📝 Reset form
function resetForm(form, previewContainer) {
    form.reset();
    previewContainer.innerHTML = "";
    document.getElementById("file-name").textContent = "No file chosen";
}

// ⚖️ Moderation Modal
const moderationModal = document.getElementById("moderationModal");
const moderatedTitle = document.getElementById("moderatedTitle");
const moderatedDescription = document.getElementById("moderatedDescription");
const acceptBtn = document.getElementById("acceptModerated");
const recheckBtn = document.getElementById("recheckModerated");

function showModerationModal(moderatedData, originalFormData, form, loading, submitButton, previewContainer) {
    moderatedTitle.value = moderatedData.moderated_title;
    moderatedDescription.value = moderatedData.moderated_description;
    moderationModal.classList.remove("hidden");

    acceptBtn.onclick = async () => {
        const finalTitle = moderatedTitle.value.trim();
        const finalDescription = moderatedDescription.value.trim();

        if (!finalTitle || !finalDescription) {
            return showToast("Title and description cannot be empty!");
        }

        originalFormData.set("title", finalTitle);
        originalFormData.set("description", finalDescription);

        try {
            const result = await postThread(originalFormData);

            if (result.thread) {
                // ✅ Success → close modal
                moderationModal.classList.add("hidden");
                showToast("Thread posted successfully!");
                resetForm(form, previewContainer);
            }
            else if (result.moderated) {
                // ❌ Still flagged → update modal fields
                moderatedTitle.value = result.moderated.moderated_title;
                moderatedDescription.value = result.moderated.moderated_description;
                showToast("Still flagged. Please edit and try again.");
            }
            else {
                showToast("Something went wrong, try again.");
            }
        } catch (err) {
            console.error(err);
            showToast("Failed to post moderated thread.");
        }
    };


    const exitModeratedBtn = document.getElementById("exitModerated");
    exitModeratedBtn.onclick = () => {
        moderationModal.classList.add("hidden");
        showToast("Exited moderation without posting");
    };
}

// 📡 API call wrapper
async function postThread(formData) {
    const response = await fetch(`${BaseURL}/threads`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`
        },
        body: formData
    });
    return await response.json();
}
