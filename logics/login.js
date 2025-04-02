document.addEventListener("DOMContentLoaded", function () {
    const text = "CrowdMind!"; 
    let index = 0;
    const speed = 150; // Typing speed (ms)
    const typewriter = document.getElementById("typewriter");

    function type() {
        if (index < text.length) {
            typewriter.textContent += text.charAt(index);
            index++;
            setTimeout(type, speed);
        } else {
            typewriter.style.borderRight = "none"; // Remove cursor after typing
        }
    }

    type(); // Start typing effect
});