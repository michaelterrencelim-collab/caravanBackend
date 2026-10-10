const params = new URLSearchParams(window.location.search);
const productId =Number(params.get("productId")) || Number(params.get("bundleId"));

function showLoader() {
  document.getElementById("loadingOverlay").classList.add("active");
}

function hideLoader() {
  document.getElementById("loadingOverlay").classList.remove("active");
}

document.addEventListener("DOMContentLoaded", async () => {

    // Initialise DOM references before calling functions that use them.
    const leaveReviewBtn = document.getElementById("leaveReviewBtn");
    const reviewsGrid = document.getElementById("reviewsGrid");
    const controlButtons = document.querySelectorAll(".control-btn");
    const prevBtn = controlButtons[0];
    const nextBtn = controlButtons[1];
    let currentUserReview = null;

    showLoader();

    try {
        await updateNavbarLogin();
        await loadProductOverview();
        await loadReviewSummary();
        await loadMyReview();
    } catch (error) {
        console.error("Failed to initialise review page:", error);
    } finally {
        hideLoader();
    }

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
        } else {
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
                <a class="nav-link" href="/login">
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

  async function loadMyReview() {
    const myReviewSection =
        document.getElementById(
            "myReviewSection"
        );

    if (!myReviewSection) {
        console.error(
            "myReviewSection is missing from Review.html"
        );

        return;
    }

    /*
     * Keep the section hidden unless a review
     * is successfully retrieved.
     */
    myReviewSection.style.display = "none";
    myReviewSection.innerHTML = "";

    try {
        const response = await fetch(`/api/myReview?productId=${encodeURIComponent(productId)}`);

        const contentType =
            response.headers.get(
                "content-type"
            ) || "";

        if (
            !contentType.includes(
                "application/json"
            )
        ) {
            const responseText =
                await response.text();

            console.error(
                "Non-JSON myReview response:",
                responseText
            );

            return;
        }

        const review = await response.json();
        currentUserReview = review;

        if (!review) {
            currentUserReview = null;

            if (leaveReviewBtn) {
                leaveReviewBtn.style.display = "inline-block";
            }
            return;
        }

        console.log(
            "Logged-in customer's review:",
            review
        );

        if (!response.ok) {
            console.error(
                review.error ||
                "Unable to retrieve customer review"
            );
            return;
        }

        /*
         * The API returns null when the customer
         * has not reviewed this product.
         */
        if (!review) {
            if (leaveReviewBtn) {
                leaveReviewBtn.style.display =
                    "inline-block";
            }
            return;
        }

        const rating =
            Math.max(
                1,
                Math.min(
                    5,
                    Number(review.rating) || 1
                )
            );

        const reviewStars =
            "★".repeat(rating) +
            "☆".repeat(5 - rating);

        const reviewDate =
            review.review_date
                ? new Date(
                    review.review_date
                ).toLocaleDateString(
                    "en-GB",
                    {
                        day: "2-digit",
                        month: "short",
                        year: "numeric"
                    }
                )
                : "";

        myReviewSection.innerHTML = `
            <div class="my-review-header">
                <div>
                    <h3>Your Review</h3>

                    <div class="my-review-rating">
                        <span class="my-review-stars">
                            ${reviewStars}
                        </span>

                        <strong>
                            ${rating} ${
                                rating === 1
                                    ? "Star"
                                    : "Stars"
                            }
                        </strong>
                    </div>
                </div>

                <button
                    type="button"
                    class="edit-review-btn"
                    id="editReviewBtn"
                >
                    Edit Review
                </button>
            </div>

            <h4 class="my-review-title">
                ${escapeHTML(
                    review.review_title || ""
                )}
            </h4>

            <p class="my-review-comment">
                ${escapeHTML(
                    review.review_text || ""
                )}
            </p>

            ${
                reviewDate
                    ? `
                        <p class="my-review-date">
                            ${reviewDate}
                        </p>
                    `
                    : ""
            }
        `;

        myReviewSection.style.display = "block";

        /*
         * A customer can only submit one review
         * per product, so hide this button.
         */
        if (leaveReviewBtn) {
            leaveReviewBtn.style.display =
                "none";
        }

    } catch (error) {
        console.error(
            "Failed to load customer review:",
            error
        );
    }
  }

  document.addEventListener("click", event => {
        if (event.target.id === "editReviewBtn") {
            console.log(
                "Edit button clicked",
                currentUserReview
            );

            if (!currentUserReview) {
                return;
            }

            editReviewTitle.value = currentUserReview.review_title || "";
            editReviewComment.value = currentUserReview.review_text || "";
            editSelectedRating.value = currentUserReview.rating || 5;

            highlightEditStars(
                Number(editSelectedRating.value)
            );
            editReviewModal.classList.add("active");
        }
    }
  );

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
  
  const editModalHTML = `
    <div
        class="modal-overlay"
        id="editReviewModal"
    >
        <div class="modal-box">
            <div class="modal-header">
                <h3>Edit Review</h3>

                <button
                    type="button"
                    class="close-modal"
                    id="closeEditReviewModal"
                >
                    &times;
                </button>
            </div>

            <form id="editReviewForm">
                <div class="form-field-group">
                    <label>Rating</label>

                    <div
                        class="star-rating-select"
                        id="editStarSelect"
                    >
                        <span class="star" data-value="1">★</span>
                        <span class="star" data-value="2">★</span>
                        <span class="star" data-value="3">★</span>
                        <span class="star" data-value="4">★</span>
                        <span class="star" data-value="5">★</span>
                    </div>

                    <input
                        type="hidden"
                        id="editSelectedRating"
                        value="5"
                    >
                </div>

                <div class="form-field-group">
                    <label for="editReviewTitle">
                        Review Title
                    </label>

                    <input
                        type="text"
                        id="editReviewTitle"
                        class="radius-10-input"
                        maxlength="150"
                        required
                    >
                </div>

                <div class="form-field-group">
                    <label for="editReviewComment">
                        Review Text
                    </label>

                    <textarea
                        id="editReviewComment"
                        class="custom-input-box"
                        rows="5"
                        maxlength="2000"
                        required
                    ></textarea>
                </div>

                <div class="edit-review-actions">
                    <button
                        type="submit"
                        class="save-review-btn"
                        id="saveEditedReviewBtn"
                    >
                        Save
                    </button>

                    <button
                        type="button"
                        class="cancel-review-btn"
                        id="cancelEditReviewBtn"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        class="delete-review-btn"
                        id="deleteReviewBtn"
                    >
                        Delete
                    </button>
                </div>
            </form>
        </div>
    </div>
  `;

  document.body.insertAdjacentHTML(
      "beforeend",
      editModalHTML
  );

  const editReviewModal = document.getElementById("editReviewModal");
  const editReviewForm = document.getElementById("editReviewForm");
  const closeEditReviewModalBtn = document.getElementById("closeEditReviewModal");
  const cancelEditReviewBtn = document.getElementById("cancelEditReviewBtn");
  const deleteReviewBtn = document.getElementById("deleteReviewBtn");
  const editReviewTitle = document.getElementById("editReviewTitle");
  const editReviewComment = document.getElementById("editReviewComment");
  const editSelectedRating = document.getElementById("editSelectedRating");
  const editStars = document.querySelectorAll("#editStarSelect .star");

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

  closeEditReviewModalBtn.addEventListener(
      "click",
      () => {
          editReviewModal.classList.remove(
              "active"
          );
      }
  );

  cancelEditReviewBtn.addEventListener(
      "click",
      () => {
          editReviewModal.classList.remove(
              "active"
          );
      }
  );

  editReviewModal.addEventListener(
      "click",
      event => {

          if (event.target === editReviewModal) {
              editReviewModal.classList.remove(
                  "active"
              );
          }
      }
  );

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

  function highlightEditStars(count) {
    editStars.forEach((star, idx) => {

        star.style.color =
            idx < count
                ? "#E2B02B"
                : "#CCC";
    });
  }

  editStars.forEach((star, index) => {
    star.addEventListener(
        "click",
        () => {
            editSelectedRating.value = index + 1;
            highlightEditStars(index + 1);
        }
    );
  });

// --- Submit Review Handler ---
reviewForm.addEventListener("submit", async event => {
    event.preventDefault();

    const title =
        document
            .getElementById("reviewTitle")
            .value
            .trim();

    const comment =
        document
            .getElementById("reviewComment")
            .value
            .trim();

    const rating = Number(selectedRatingInput.value);

    if (!productId) {
        alert("Unable to identify this product or bundle.");
        return;
    }

    if (
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
    ) {
        alert("Please select a rating from 1 to 5 stars.");
        return;
    }

    if (!title) {
        alert("Please enter a review title.");
        return;
    }

    if (!comment) {
        alert("Please enter your review comment.");
        return;
    }

    const submitButton = reviewForm.querySelector(".submit-btn");
    try {
        showLoader();

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent =
                "Submitting...";
        }

        const response =
            await fetch("/api/addReview", {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    productId: productId,
                    rating: rating,
                    review_title: title,
                    review_text: comment
                })
            });

        const contentType =
            response.headers.get(
                "content-type"
            ) || "";

        /*
         * Authentication middleware may redirect
         * unauthorised users to an HTML login page.
         */
        if (
            !contentType.includes(
                "application/json"
            )
        ) {
            const responseText =
                await response.text();

            console.error(
                "Non-JSON add-review response:",
                responseText
            );

            if (
                response.status === 401 ||
                response.redirected
            ) {
                alert(
                    "Please log in before leaving a review."
                );

                window.location.href =
                    `/login?redirect=${encodeURIComponent(
                        window.location.href
                    )}`;

                return;
            }

            throw new Error(
                "The server returned an invalid response."
            );
        }

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Unable to submit review."
            );
        }

        console.log(
            "Review successfully saved:",
            result
        );

        reviewForm.reset();

        selectedRatingInput.value = "5";

        highlightStars(5);

        reviewModal.classList.remove(
            "active"
        );

        /*
         * Refresh the summary so the average rating
         * and review count include the new review.
         */
        await Promise.all([
            loadReviewSummary(),
            loadMyReview()
        ]);

        alert(result.message || "Review added successfully.");

        /*
         * Hide Leave a Review after a successful
         * submission because one customer can only
         * review each product once.
         */
        if (leaveReviewBtn) {
            leaveReviewBtn.style.display =
                "none";
        }

    } catch (error) {
        console.error(
            "Failed to submit review:",
            error
        );

        alert(
            error.message ||
            "Failed to submit review."
        );

    } finally {
        hideLoader();

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent =
                "Submit Review";
        }
    }
});

editReviewForm.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        if (!currentUserReview) {
            return;
        }

        try {
            showLoader();
            const response =
                await fetch(
                    "/api/updateReview",
                    {
                        method: "PUT",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            reviewId: currentUserReview.review_id,
                            rating: Number(editSelectedRating.value),
                            review_title: editReviewTitle.value.trim(),
                            review_text: editReviewComment.value.trim()
                        })
                    }
                );

            const result = await response.json();
            if (!response.ok) {

                throw new Error(
                    result.error ||
                    "Unable to update review."
                );

            }

            editReviewModal.classList.remove(
                "active"
            );

            await Promise.all([
                loadMyReview(),
                loadReviewSummary()
            ]);

            alert(
                result.message ||
                "Review updated successfully."
            );
        }

        catch(error) {
            console.error(
                "Update review error:",
                error
            );
            alert(error.message);
        
        }finally {
          hideLoader();
        }
    }
);

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