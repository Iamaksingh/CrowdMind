document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("new-thread-form"); // Reference the form
    const fileInput = document.getElementById("media-upload-input");

    form.addEventListener("submit", function (event) {
        event.preventDefault(); // Prevent default submission behavior
        console.log("Thread posted!"); // Replace this with actual post logic
    });

    fileInput.addEventListener("change", function (event) {
        event.stopPropagation(); // Stop event from bubbling up
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const fileInput = document.getElementById("media-upload-input"); // Hidden input
    const customButton = document.getElementById("custom-upload-btn"); // Custom button
    const fileNameDisplay = document.getElementById("file-name"); // Text next to button
    const previewContainer = document.getElementById("preview-container");

    let selectedFiles = []; // Store files manually

    // Open file dialog when clicking custom button
    customButton.addEventListener("click", function () {
        fileInput.click();
    });

    fileInput.addEventListener("change", function () {
        previewContainer.innerHTML = ""; // Clear previous previews
        selectedFiles = Array.from(fileInput.files); // Store selected files

        if (selectedFiles.length > 0) {
            fileNameDisplay.textContent = selectedFiles.length + " file(s) selected";
        } else {
            fileNameDisplay.textContent = "No file chosen";
        }

        updatePreviews();
    });

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

            // Remove Button
            const removeButton = document.createElement("button");
            removeButton.textContent = "✖";
            removeButton.classList.add("remove-btn");
            removeButton.addEventListener("click", function () {
                selectedFiles.splice(index, 1); // Remove from array
                updateFileInput(); // Update file input
                updatePreviews(); // Refresh preview
            });

            previewElement.appendChild(removeButton);
            previewContainer.appendChild(previewElement);
        });
    }

    function updateFileInput() {
        const dataTransfer = new DataTransfer();
        selectedFiles.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files; // Update input element

        if (selectedFiles.length > 0) {
            fileNameDisplay.textContent = selectedFiles.length + " file(s) selected";
        } else {
            fileNameDisplay.textContent = "No file chosen";
        }
    }
});

document.getElementById("media-upload-input").addEventListener("change", function (event) {
    event.preventDefault(); // Prevent form reset
});