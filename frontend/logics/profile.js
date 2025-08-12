const token = localStorage.getItem("token");
if(!token || token === "0") {
    alert("Please log in first!");
    window.location.href = "login.html";
}
