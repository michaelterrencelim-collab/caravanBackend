const params = new URLSearchParams(window.location.search);
const productId =Number(params.get("productId")) || Number(params.get("bundleId"));

function showLoader() {
  document.getElementById("loadingOverlay").classList.add("active");
}

function hideLoader() {
  document.getElementById("loadingOverlay").classList.remove("active");
}

document.addEventListener("DOMContentLoaded", async () => {

    showLoader();
    await updateNavbarLogin();

    try {
        await loadProductOverview();
        await loadReviewSummary();
    } finally {
        hideLoader();
    }

  // --- DOM Elements ---
  const leaveReviewBtn = document.querySelector(".leave-review-btn");
  const reviewsGrid = document.getElementById("reviewsGrid");
  const prevBtn = document.querySelectorAll(".control-btn")[0];
  const nextBtn = document.querySelectorAll(".control-btn")[1];

  async function updateNavbarLogin() {

    try {
        const response = await fetch("/api/isLoggedIn");
        const accountButton = document.getElementById("accountButton");

        if (!accountButton) {
            return;
        }

        if (!response.ok) {
            accountButton.innerHTML = `
                /login
                    Login
                </a>
            `;
            return;
        }

        const data = await response.json();
        if (data.loggedIn) {
            accountButton.innerHTML = `
                <a class="nav-link" href="/user/profile">
                    Profile
                </a>
            `;
        }

        else {
            accountButton.innerHTML = `
                <a class="nav-link" href="/login">
                    Login
                </a>
            `;
        }

    } catch(error) {
        console.error("Navbar login error:", error);
        const accountButton = document.getElementById("accountButton");

        if (accountButton) {
            accountButton.innerHTML = `
                /login
                    Login
                </a>
            `;
        }
    }
}

  async function loadProductOverview() {
    try {
        const response = await fetch(`/api/fetchProducts?productId=${productId}`);
        const products = await response.json();

        if (!products.length) {
            return;
        }

        const product =products[0];

        document.getElementById("productImage").src = product.product_image;

        document.getElementById(
            "productOrigin"
        ).innerHTML = `
            <strong>
                ${product.product_name}
            </strong>
            - Origin:
            ${product.product_country}
        `;

        document.getElementById("productDescription").textContent = product.product_desc;
    } catch(error) {
        console.error("Failed to load product:", error);
    }
  }

  async function loadReviewSummary() {
    try {
        const response = await fetch(`/api/reviewSummary?productId=${productId}`);

        const summary = await response.json();
        const average = Number(summary.average_rating || 0);
        const reviewCount = Number(summary.review_count || 0);

        document.getElementById(
            "averageRating"
        ).textContent =
            `${average} Out of 5 Stars`;

        document.getElementById(
            "reviewCount"
        ).textContent =
            `Based on ${reviewCount} review${reviewCount === 1 ? "" : "s"}`;

        renderAverageStars(average);

    } catch(error) {
        console.error("Review summary error: ",error);
    }
  }

  function renderAverageStars(rating) {
    const starContainer = document.querySelector(".hero-stars");

    if (!starContainer) {
        return;
    }

    starContainer.innerHTML = "";

    const rounded = Math.round(rating);

    for (let i = 1; i <= 5; i++) {
        const star = document.createElement("i");
        star.className =
            i <= rounded
                ? "fa-solid fa-star"
                : "fa-regular fa-star";

        starContainer.appendChild(star);
    }
  }

  // --- Dynamic Modal Injection ---
  const modalHTML = `
    <div class="modal-overlay" id="reviewModal">
      <div class="modal-box">
        <div class="modal-header">
          <h3>Leave a Review</h3>
          <button class="close-modal" id="closeReviewModal">&times;</button>
        </div>
        <form id="reviewForm">
          
          <div class="form-field-group">
            <label>Rating</label>
            <div class="star-rating-select" id="starSelect">
              <span class="star" data-value="1">&#9733;</span>
              <span class="star" data-value="2">&#9733;</span>
              <span class="star" data-value="3">&#9733;</span>
              <span class="star" data-value="4">&#9733;</span>
              <span class="star" data-value="5">&#9733;</span>
            </div>
            <input type="hidden" id="selectedRating" value="5" />
          </div>

          <div class="form-field-group">
            <label for="reviewTitle">Review Title</label>
            <input type="text" id="reviewTitle" class="radius-10-input" placeholder="e.g. Amazing quality!" required />
          </div>

          <div class="form-field-group">
            <label for="reviewComment">Comment</label>
            <textarea id="reviewComment" class="custom-input-box" rows="4" placeholder="Share your experience..." required></textarea>
          </div>

          <button type="submit" class="submit-btn" style="border-radius: 8px; margin-top: 10px;">Submit Review</button>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);

  const reviewModal = document.getElementById("reviewModal");
  const closeModalBtn = document.getElementById("closeReviewModal");
  const reviewForm = document.getElementById("reviewForm");
  const stars = document.querySelectorAll("#starSelect .star");
  const selectedRatingInput = document.getElementById("selectedRating");

  // --- Pagination & View Configuration ---
  let currentPage = 0;
  const cardsPerPage = 6;

  // Render empty state if no reviews exist initially
  checkEmptyState();

  // --- Modal Open / Close Handlers ---
  leaveReviewBtn.addEventListener("click", () => {
    reviewModal.classList.add("active");
  });

  closeModalBtn.addEventListener("click", () => {
    reviewModal.classList.remove("active");
  });

  reviewModal.addEventListener("click", (e) => {
    if (e.target === reviewModal) {
      reviewModal.classList.remove("active");
    }
  });

  // --- Star Rating Input Control ---
  stars.forEach((star, index) => {
    star.addEventListener("mouseover", () => highlightStars(index + 1));
    star.addEventListener("mouseout", () => highlightStars(selectedRatingInput.value));
    star.addEventListener("click", () => {
      selectedRatingInput.value = index + 1;
      highlightStars(index + 1);
    });
  });

  function highlightStars(count) {
    stars.forEach((star, idx) => {
      star.style.color = idx < count ? "#E2B02B" : "#CCC";
    });
  }
  highlightStars(5);

  // --- Submit Review Handler ---
  reviewForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = document.getElementById("reviewerName").value.trim();
    const title = document.getElementById("reviewTitle").value.trim();
    const comment = document.getElementById("reviewComment").value.trim();
    const ratingVal = parseInt(selectedRatingInput.value, 10);

    // Format current date
    const today = new Date();
    const dateFormatted = today.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    const starString = "★".repeat(ratingVal) + "☆".repeat(5 - ratingVal);

    // Remove empty state message if present
    const emptyMsg = document.getElementById("noReviewsMsg");
    if (emptyMsg) emptyMsg.remove();

    // Build review card element
    const newCard = document.createElement("article");
    newCard.className = "review-card";
    newCard.innerHTML = `
      <img src="./Images/paprika.jpg" alt="Paprika" class="review-card-img" />
      <div class="review-card-body">
        <p class="reviewer-name">User: ${escapeHTML(name)}</p>
        <div class="review-rating">
          Rating: <span class="stars">${starString}</span> <span class="rating-num">[${ratingVal} stars]</span>
        </div>
        <h3 class="review-title">Title: ${escapeHTML(title)}</h3>
        <p class="review-comment">Comment: ${escapeHTML(comment)}</p>
        <p class="review-date">Date: ${dateFormatted}</p>
      </div>
    `;

    // Prepend new review card to top of grid
    reviewsGrid.prepend(newCard);

    // Reset pagination to first page & update view
    currentPage = 0;
    updatePagination();

    // Reset form and close modal
    reviewForm.reset();
    selectedRatingInput.value = "5";
    highlightStars(5);
    reviewModal.classList.remove("active");
  });

  // --- Pagination / Carousel Controller ---
  function updatePagination() {
    const cards = document.querySelectorAll(".review-card");
    if (cards.length === 0) {
      prevBtn.style.opacity = "0.5";
      nextBtn.style.opacity = "0.5";
      return;
    }

    const totalPages = Math.ceil(cards.length / cardsPerPage);

    cards.forEach((card, index) => {
      const start = currentPage * cardsPerPage;
      const end = start + cardsPerPage;
      card.style.display = (index >= start && index < end) ? "flex" : "none";
    });

    prevBtn.style.opacity = currentPage === 0 ? "0.5" : "1";
    nextBtn.style.opacity = currentPage >= totalPages - 1 ? "0.5" : "1";
  }

  prevBtn.addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage--;
      updatePagination();
    }
  });

  nextBtn.addEventListener("click", () => {
    const cards = document.querySelectorAll(".review-card");
    if ((currentPage + 1) * cardsPerPage < cards.length) {
      currentPage++;
      updatePagination();
    }
  });

  // Helper: Empty state handling
  function checkEmptyState() {
    const cards = document.querySelectorAll(".review-card");
    if (cards.length === 0) {
      reviewsGrid.innerHTML = `
        <div id="noReviewsMsg" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #888; font-family: InstrumentSans, sans-serif;">
          No reviews yet. Be the first to leave a review!
        </div>
      `;
    }
  }

  // Helper: Prevent XSS
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
});