const API_BASE_URL = "https://crowdmind-backend.onrender.com/api/auth";

document.addEventListener("DOMContentLoaded", () => {
  // Prefill email if stored
  const savedEmail = localStorage.getItem("email");
  if (savedEmail && savedEmail !== "") {
    document.getElementById("email").value = savedEmail;
    document.getElementById("rememberMe").checked = true;
  }

  // Typewriter effect
  const text = "CrowdMind!";
  let index = 0;
  const speed = 150;
  const typewriter = document.getElementById("typewriter");

  function type() {
    if (index < text.length) {
      typewriter.textContent += text.charAt(index);
      index++;
      setTimeout(type, speed);
    } else {
      typewriter.style.borderRight = "none";
    }
  }
  type();

  const loginForm = document.getElementById("loginForm");
  const loginBtn = document.getElementById("loginBtn");
  const signupBtn = document.getElementById("sign-up");

  // Popup div for messages
  const popup = document.createElement("div");
  popup.style.position = "fixed";
  popup.style.top = "20px";
  popup.style.right = "20px";
  popup.style.backgroundColor = "#1abc9c";
  popup.style.color = "white";
  popup.style.padding = "10px 20px";
  popup.style.borderRadius = "5px";
  popup.style.boxShadow = "0 0 10px rgba(0,0,0,0.2)";
  popup.style.fontFamily = "'Montserrat', sans-serif";
  popup.style.fontWeight = "600";
  popup.style.display = "none";
  popup.style.zIndex = "1000";
  document.body.appendChild(popup);

  function showPopup(message, duration = 2000) {
    popup.textContent = message;
    popup.style.display = "block";
    setTimeout(() => {
      popup.style.display = "none";
    }, duration);
  }

  // Loader HTML for button
  const loaderHTML = `<div class="spinner"></div>`;

  function showLoaderInButton(button) {
    button.dataset.originalText = button.innerHTML; // Save original text
    button.innerHTML = loaderHTML;
    button.disabled = true;
    signupBtn.disabled = true;
  }

  function restoreButton(button) {
    button.innerHTML = button.dataset.originalText;
    button.disabled = false;
    signupBtn.disabled = false;
  }

  async function loginUser(email, password) {
    showLoaderInButton(loginBtn);
    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed");

      // Save email if remember is checked
      const rememberTick = document.getElementById("rememberMe").checked;
      localStorage.setItem("email", rememberTick ? email : "");

      // Save token
      localStorage.setItem("token", data.token);

      // Redirect after successful login
      window.location.href = "landing.html";
    } catch (err) {
      restoreButton(loginBtn);
      showToast("Login Failed " + err.message);
    }
  }

  // Handle Login form submit
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {
      showToast("Please enter both email and password.");
      return;
    }

    await loginUser(email, password);
  });

  // Handle Signup button click
  signupBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    showLoaderInButton(signupBtn);

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const rememberTick = document.getElementById("rememberMe").checked;

    if (!email || !password) {
      restoreButton(signupBtn);
      showToast("Please enter both email and password.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Signup failed");

      // Save email if remember is checked
      localStorage.setItem("email", rememberTick ? email : "");

      restoreButton(signupBtn);
      showPopup("Signup successful! Logging you in...");

      // Auto login after signup
      await loginUser(email, password);
    } catch (err) {
      restoreButton(signupBtn);
      showToast(err.message);
    }
  });
});


function showToast(message, color = "#e74c3c") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.backgroundColor = color; // Red for error, green for success
  toast.className = "toast show";

  setTimeout(() => {
    toast.className = toast.className.replace("show", "");
  }, 3000);
}