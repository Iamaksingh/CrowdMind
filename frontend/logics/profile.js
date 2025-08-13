const BACKEND_URL = 'http://localhost:5000'; 
const token = localStorage.getItem("token");

if(!token || token === "0") {
    showToast("Please log in first!");
    window.location.href = "login.html";
}

// Profile form elements
const form = document.getElementById('profile-form');
const avatarInput = document.getElementById('avatar');
const avatarPreview = document.getElementById('avatarPreview');

// Loader & toast container
const loader = document.getElementById('profile-loading');
const toastContainer = document.getElementById('toast-container');

// ----------------------------
// Toast function
// ----------------------------
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

// ----------------------------
// 1. Fetch current profile
// ----------------------------
async function loadProfile() {
    loader.classList.remove("hidden"); // show loader
    try {
        const res = await fetch(`${BACKEND_URL}/api/profile/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            // Try to parse JSON, otherwise just use default message
            let errMsg = "Please create a profile first!";
            try {
                const errData = await res.json();
                if (errData.message) errMsg = errData.message;
            } catch {}
            showToast(errMsg);
            return;
        }

        let profile = {};
        try {
            profile = await res.json();
        } catch {}

        form.username.value = profile.username || '';
        form.bio.value = profile.bio || '';
        form.location.value = profile.location || '';
        form.website.value = profile.website || '';
        form.twitter.value = profile.socialLinks?.twitter || '';
        form.linkedin.value = profile.socialLinks?.linkedin || '';
        form.github.value = profile.socialLinks?.github || '';

        if (profile.avatar) avatarPreview.src = profile.avatar;

    } catch (err) {
        console.error(err);
        showToast("Could not load profile. Please try again!");
    } finally {
        loader.classList.add("hidden"); // always hide loader
    }
}

// ----------------------------
// 2. Clickable avatar & live preview
// ----------------------------
avatarPreview.addEventListener('click', () => avatarInput.click());

avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = () => avatarPreview.src = reader.result;
        reader.readAsDataURL(file);
    }
});

// ----------------------------
// 3. Handle form submission
// ----------------------------
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    loader.classList.remove("hidden"); // show loader

    try {
        const res = await fetch(`${BACKEND_URL}/api/profile`, {
            method: 'POST',
            body: formData,
            headers: { 'Authorization': `Bearer ${token}` }
        });

        let data = {};
        try { data = await res.json(); } catch {}

        if (!res.ok) throw new Error(data.message || 'Failed to update profile');

        showToast(data.message || "Profile updated successfully!");
        if (data.profile?.avatar) avatarPreview.src = data.profile.avatar;

    } catch (err) {
        console.error(err);
        showToast(err.message || "Failed to update profile");
    } finally {
        loader.classList.add("hidden"); // always hide loader
    }
});

// ----------------------------
// Initialize
// ----------------------------
loadProfile();
