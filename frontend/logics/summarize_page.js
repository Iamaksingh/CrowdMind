const token = localStorage.getItem("token");
if(!token || token === "0") {
    alert("Please log in first!");
    window.location.href = "login.html";
}

// Wait until page loads before rendering charts
document.addEventListener("DOMContentLoaded", function () {
    renderCharts();
});

function renderCharts() {
    // Gender Ratio - Donut Chart
    const genderCtx = document.getElementById('genderChart').getContext('2d');
    new Chart(genderCtx, {
        type: 'doughnut',
        data: {
            labels: ['Male', 'Female', 'Other'],
            datasets: [{
                data: [50, 45, 5], // Dummy data
                backgroundColor: ['#36A2EB', '#FF6384', '#FFCE56']
            }]
        },
        options: {
            cutout: '60%', // Makes it a donut
            responsive: true
        }
    });

    // User Engagement - Line Chart with Time
    const engagementCtx = document.getElementById('engagementChart').getContext('2d');
    new Chart(engagementCtx, {
        type: 'line',
        data: {
            labels: ['10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM'], // Time labels
            datasets: [{
                label: 'User Engagement Over Time',
                data: [10, 25, 50, 75, 120], // Dummy engagement data
                borderColor: '#4CAF50',
                backgroundColor: 'rgba(76, 175, 80, 0.2)',
                fill: true,
                tension: 0.3 // Smooth curves
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Engagement Count'
                    }
                }
            }
        }
    });
}


// document.addEventListener("DOMContentLoaded", function () {
//     const cards = document.querySelectorAll(".card");

//     cards.forEach(card => {
//         card.addEventListener("click", function (event) {
//             // Remove expanded class from any other card
//             document.querySelectorAll(".card.expanded").forEach(expandedCard => {
//                 expandedCard.classList.remove("expanded");
//             });

//             // Expand the clicked card
//             card.classList.add("expanded");
//             event.stopPropagation(); // Prevent click event from reaching document
//         });
//     });

//     // Click outside to close the expanded card
//     document.addEventListener("click", function (event) {
//         document.querySelectorAll(".card.expanded").forEach(expandedCard => {
//             if (!expandedCard.contains(event.target)) {
//                 expandedCard.classList.remove("expanded");
//             }
//         });
//     });
// });

document.addEventListener("DOMContentLoaded", function () {
    const cards = document.querySelectorAll(".card");
    
    cards.forEach(card => {
        card.addEventListener("click", function (event) {
            event.stopPropagation(); // Prevent click from bubbling

            if (!card.classList.contains("expanded")) {
                const rect = card.getBoundingClientRect();
                const mainContent = document.querySelector(".main-content");
                const mainRect = mainContent.getBoundingClientRect();
                
                const initialX = rect.left - mainRect.left;
                const initialY = rect.top - mainRect.top;
                const centerX = (mainRect.width / 2) - (rect.width / 2);
                const centerY = (mainRect.height / 2) - (rect.height / 2);

                card.style.setProperty("--initial-x", `${initialX}px`);
                card.style.setProperty("--initial-y", `${initialY}px`);
                card.style.setProperty("--center-x", `${centerX}px`);
                card.style.setProperty("--center-y", `${centerY}px`);
                
                card.classList.add("expanded");
            } else {
                card.classList.remove("expanded");
            }
        });
    });

    document.addEventListener("click", function (event) {
        const expandedCard = document.querySelector(".card.expanded");
        if (expandedCard && !expandedCard.contains(event.target)) {
            expandedCard.classList.remove("expanded");
        }
    });
});
