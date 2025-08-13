const BACKEND_URL = 'http://localhost:5000'; 
const token = localStorage.getItem("token");
if(!token || token === "0") {
    alert("Please log in first!");
    window.location.href = "login.html";
}

// profile.js

const form = document.getElementById('profile-form');
const avatarInput = document.getElementById('avatar');
const avatarPreview = document.getElementById('avatarPreview');

// ----------------------------
// 1. Fetch current profile
// ----------------------------
async function loadProfile() {
  try {
    const res = await fetch('http://localhost:5000/api/profile/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Failed to fetch profile');

    const profile = await res.json();

    form.username.value = profile.username || '';
    form.bio.value = profile.bio || '';
    form.location.value = profile.location || '';
    form.website.value = profile.website || '';
    form.twitter.value = profile.socialLinks?.twitter || '';
    form.linkedin.value = profile.socialLinks?.linkedin || '';
    form.github.value = profile.socialLinks?.github || '';

    if (profile.avatar) {
      avatarPreview.src = profile.avatar;
    }

  } catch (err) {
    console.error(err);
    alert('Could not load profile. Please try again.');
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

  try {
    const res = await fetch('http://localhost:5000/api/profile', {
      method: 'POST',
      body: formData,
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data.message || 'Failed to update profile');

    alert(data.message);

    if (data.profile.avatar) {
      avatarPreview.src = data.profile.avatar;
    }

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
});

// ----------------------------
// Initialize
// ----------------------------
loadProfile();
