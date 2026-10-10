
let isBundle = false;

// loeading screen mechanism
function showLoader() {
    document
        .getElementById("loadingOverlay")
        .classList.add("active");
}

function hideLoader() {
    document
        .getElementById("loadingOverlay")
        .classList.remove("active");
}

document.addEventListener("DOMContentLoaded", () => {
    showLoader();
    updateNavbarLogin();

    const sizeSelect = document.getElementById("spiceSize");
    const priceDisplay = document.getElementById("productPrice");

    let basePrice = 0;
    let currentItem = null;
    let allProducts = [];

    const productId = Number(
        new URLSearchParams(window.location.search).get("productId")
    );
    
    const bundleId = Number(
        new URLSearchParams(window.location.search).get("bundleId")
    );

    // LOAD PRODUCTS OR BUNDLES

    if (bundleId) {
        isBundle = true;

        Promise.all([
            fetch(
                `/api/fetchProducts?productId=${encodeURIComponent(bundleId)}`
            ),
            fetch("/api/fetchProducts")
        ])
        .then(async ([bundleResponse, productsResponse]) => {
            if (!bundleResponse.ok) {
                throw new Error(
                    `Unable to load bundle: ${bundleResponse.status}`
                );
            }

            if (!productsResponse.ok) {
                throw new Error(
                    `Unable to load products: ${productsResponse.status}`
                );
            }

            const bundleData = await bundleResponse.json();
            const productsData = await productsResponse.json();

            // Your single-item endpoint currently returns an array.
            const bundle = Array.isArray(bundleData)
                ? bundleData[0]
                : bundleData;

            const products = Array.isArray(productsData)
                ? productsData
                : [];

            if (!bundle) {
                throw new Error(
                    `Bundle with ID ${bundleId} was not found`
                );
            }

            if (Number(bundle.type_id) !== 2) {
                throw new Error(
                    `Product ID ${bundleId} is not a bundle`
                );
            }

            console.log("BUNDLE RESPONSE:", bundle);

            allProducts = products;
            currentItem = bundle;

            // Use product_price, not bundle_price.
            basePrice = Number(bundle.product_price) || 0;

            document.getElementById("mainProductImg").src =
                bundle.product_image || "";

            document.getElementById("mainProductImg").alt =
                bundle.product_name || "Bundle";

            document.getElementById("productTitle").textContent =
                bundle.product_name || "Unnamed Bundle";

            document.getElementById("likeCount").textContent =
                Number(bundle.product_likes) || 0;

            document.getElementById("productOrigin").textContent =
                `Origin: ${bundle.product_country || "Unknown"}`;

            document.getElementById("productDesc").textContent =
                `Description: ${bundle.product_desc || "No description available."}`;

            updatePrice();

            renderSimilarProducts(bundle, products);
            renderRandomProducts(bundle, products);

            hideLoader();
        })
        .catch(error => {
            console.error("Error loading bundle:", error);

            const productContainer = document.querySelector(".product-container");

            if (productContainer) {
                productContainer.innerHTML =
                    "<p>Unable to load this bundle.</p>";
            }

            hideLoader();
        });

    } else {
        Promise.all([
            fetch(
                `/api/fetchProducts?productId=${encodeURIComponent(productId)}`
            ),
            fetch("/api/fetchProducts")
        ])
        .then(async ([productResponse, productsResponse]) => {

            if (!productResponse.ok) {
                if (productResponse.status === 404) {
                    throw new Error(
                        `Product with ID ${productId} was not found`
                    );
                }

                throw new Error(
                    `Unable to load product: ${productResponse.status}`
                );
            }

            if (!productsResponse.ok) {
                throw new Error(
                    `Unable to load recommendations: ${productsResponse.status}`
                );
            }

            const productData = await productResponse.json();

            const product = Array.isArray(productData)
                ? productData[0]
                : productData;
                
            const products = await productsResponse.json();
            console.log("PRODUCT RESPONSE:", product);

            allProducts = products;
            currentItem = product;
            basePrice = Number(product.product_price);

            document.getElementById("mainProductImg").src =
                product.product_image;

            document.getElementById("mainProductImg").alt =
                product.product_name;

            document.getElementById("productTitle").textContent =
                product.product_name;

            document.getElementById("likeCount").textContent =
                product.product_likes;

            document.getElementById("productOrigin").textContent =
                `Origin: ${product.product_country || "Unknown"}`;

            document.getElementById("productDesc").textContent =
                `Description: ${product.product_desc}`;

            updatePrice();
            hideLoader();

            renderSimilarProducts(product, products);
            renderRandomProducts(product, products);
        })
        .catch(error => {
            console.error("Error loading product:", error);

            document.querySelector(".product-container").innerHTML =
                "<p>Unable to load this product.</p>";

            hideLoader();
        });
    }
    // PRICE

    function updatePrice() {
        const multiplier =
            sizeSelect.value === "8oz"
                ? 8
                : 16;
        const calculatedPrice =
            (basePrice * multiplier).toFixed(2);
        priceDisplay.textContent =
            `Price: ₱${calculatedPrice}`;
    }


    if (sizeSelect && priceDisplay) {
        sizeSelect.addEventListener(
            "change",
            updatePrice
        );
    }

    function renderSimilarProducts(product, products) {
        const recommendationsContainer =
            document.querySelector(
                ".recommendations-similar .product-grid"
            );

        if (!recommendationsContainer) {
            return;
        }

        recommendationsContainer.innerHTML = "";

        const currentCategories =
            Array.isArray(product.product_category)
                ? product.product_category
                : [];

        const similarProducts = products.filter(
            otherProduct => {
                if (
                    Number(otherProduct.product_id) ===
                    Number(product.product_id)
                ) {
                    return false;
                }

                const sameCountry =
                    otherProduct.product_country ===
                    product.product_country;

                const otherCategories =
                    Array.isArray(otherProduct.product_category)
                        ? otherProduct.product_category
                        : [];

                const sameCategory =
                    otherCategories.some(otherCategory =>
                        currentCategories.some(currentCategory =>
                            Number(currentCategory.category_id) ===
                            Number(otherCategory.category_id)
                        )
                    );

                return sameCountry || sameCategory;
            }
        );

        const recommendedProducts =
            shuffleArray(similarProducts).slice(0, 7);

        recommendedProducts.forEach(product => {
            recommendationsContainer.appendChild(
                createRecommendationCard(product)
            );
        });
    }

    // Randomize products
    function renderRandomProducts(currentProduct, products) {
        const likedContainer =
            document.querySelector(
                ".recommendations-like .product-grid"
            );

        if (!likedContainer) {
            return;
        }

        likedContainer.innerHTML = "";

        const otherProducts = products.filter(
            product =>
                Number(product.product_id) !==
                Number(currentProduct.product_id)
        );

        const randomProducts =
            shuffleArray(otherProducts).slice(0, 7);

        randomProducts.forEach(product => {
            likedContainer.appendChild(
                createRecommendationCard(product)
            );
        });
    }

    // Random recommendations card
    function createRecommendationCard(product) {
        const recommendationCard =
            document.createElement("div");

        recommendationCard.classList.add(
            "recommendation-card"
        );

        recommendationCard.dataset.productId =
            product.product_id;

        const productPrice =
            Number(product.product_price) || 0;

        recommendationCard.innerHTML = `
            <div class="cardImg">
                <img 
                    src="${product.product_image}"
                    alt="${product.product_name}"
                />
            </div>

            <div class="card-details">
                <h4 class="card-title">
                    ${product.product_name}
                </h4>

                <p class="art-price">
                    ₱${productPrice.toFixed(2)}
                </p>
            </div>
        `;

        recommendationCard.addEventListener(
            "click",
            () => {
                showLoader();
                
                const queryParameter = Number(product.type_id) === 2
                    ? "bundleId"
                    : "productId";

                window.location.href = `/product?${queryParameter}=${product.product_id}`;
            }
        );

        return recommendationCard;
    }

    function shuffleArray(items) {
        const shuffled = [...items];

        for (
            let index = shuffled.length - 1;
            index > 0;
            index--
        ) {
            const randomIndex =
                Math.floor(Math.random() * (index + 1));

            [
                shuffled[index],
                shuffled[randomIndex]
            ] = [
                shuffled[randomIndex],
                shuffled[index]
            ];
        }

        return shuffled;
    }

    // LIKE BUTTON
    const likeBtn = document.getElementById("likeBtn");
    const likeCount = document.getElementById("likeCount");

    if (likeBtn && likeCount) {

        likeBtn.addEventListener(
            "click",
            () => {

                let count =
                    parseInt(
                        likeCount.textContent,
                        10
                    );
                likeBtn.classList.toggle("liked");
                const heartIcon =
                    likeBtn.querySelector(".heart-icon");
                if (
                    likeBtn.classList.contains("liked")
                ) {
                    heartIcon.innerHTML =
                        "&#9829;";
                    likeCount.textContent =
                        count + 1;
                    // place the code to update the like count in the database here
                } else {
                    heartIcon.innerHTML =
                        "&#9825;";
                    likeCount.textContent =
                        count - 1;
                    // place the code to update the like count in the database here
                }
            }
        );
    }

    const addToCartBtn =
        document.getElementById("addToCartBtn");
    if (addToCartBtn) {

        addToCartBtn.addEventListener(
            "click",
            () => {
                addToCartBtn.style.transform =
                    "scale(1.2)";
                setTimeout(
                    () => {

                        addToCartBtn.style.transform =
                            "scale(1)";
                    },
                    200
                );
            }
        );
    }
});

// checks if user Logged in; if so, change login to profile
async function updateNavbarLogin(){

    const response = await fetch("/api/isLoggedIn");

    console.log(response);
        if(!response.ok){
    document.getElementById("accountButton").innerHTML = `
        <a class="nav-link" href="/login">Login</a>
    `;
        }else{
            document.getElementById("accountButton").innerHTML = `
        <a class="nav-link" href="/user/profile">Profile</a>
    `;
        }

}

//modal constant: selects modals
const addtocart_modal = document.querySelector(".addtocart-modal");
const success_modal = document.querySelector(".success-modal");
const login_required_modal = document.querySelector(".login-required-modal");
const wishlist_modal = document.querySelector(".wishlist-modal");

async function addtoCart() {

    try {
        const response = await fetch("/api/isLoggedIn");

        if (!response.ok) {
            showLoginRequiredModal();
            return;
        }

        const data = await response.json();

        if (!data.loggedIn) {
            showLoginRequiredModal();
            return;
        }

        // User is logged in
        addtocart_modal.style.visibility = "visible";
        addtocart_modal.style.opacity = "1";

    } catch (error) {

        console.error("Login check failed:", error);

        login_required_modal.style.visibility = "visible";
        login_required_modal.style.opacity = "1";
    }
}

function closeLoginRequiredModal() {
    login_required_modal.style.visibility = "hidden";
    login_required_modal.style.opacity = "0";
}

function goToLogin() {
    window.location.href = "/login";
}

function goToReviews() {

    showLoader();

    const params = new URLSearchParams(window.location.search);
    const productId = params.get("productId");
    const bundleId = params.get("bundleId");
    const itemId = productId || bundleId;

    if (!itemId) {
        console.error("Unable to identify item.");
        return;
    }

    window.location.href = `/user/reviews?productId=${itemId}`;
}

async function addToWishlist() {
    const params = new URLSearchParams(window.location.search);
    const productId = Number(params.get("productId"));
    const bundleId = Number(params.get("bundleId"));

    /*
     * Bundles and regular products both use product_id
     * in the database.
     */
    const itemId = 
        isBundle ? bundleId : productId;

    const wishlistButton = document.getElementById("wishlistBtn");

    if (!itemId) {
        showWishlistModal(
            "WISHLIST ERROR",
            "Unable to identify this item."
        );

        return;
    }

    try {
        if (wishlistButton) {
            wishlistButton.disabled = true;
            wishlistButton.textContent =
                "Adding...";
        }

        const response = await fetch(
            "/api/addWishlist",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    productId: itemId
                })
            }
        );

        /*
         * Check this before response.json().
         * This avoids Unexpected token '<' if authentication
         * redirects to an HTML login page.
         */
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
                "Non-JSON wishlist response:",
                responseText
            );

            if (
                response.status === 401 ||
                response.redirected
            ) {
                showLoginRequiredModal();
                return;
            }

            throw new Error(
                "The server returned an invalid response"
            );
        }

        const result =
            await response.json();

        if (response.status === 401) {
            showLoginRequiredModal();
            return;
        }

        if (
           response.status === 409 ||
            result.alreadyExists
        ) {
            showWishlistModal(
                "ALREADY IN WISHLIST",
                "This item is already in your wishlist."
            );

            return;
        }

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Unable to add item to wishlist."
            );
        }

        showWishlistModal(
            "WISHLIST",
            "Item added to wishlist."
        );

    } catch (error) {
        console.error(
            "Wishlist error:",
            error
        );

        showWishlistModal(
            "WISHLIST ERROR",
            error.message ||
            "Unable to add item to wishlist."
        );

    } finally {
        if (wishlistButton) {
            wishlistButton.disabled = false;
            wishlistButton.textContent =
                "✦ Add to Wishlist";
        }
    }
}

function showWishlistModal(
    title,
    description
) {
    if (!wishlist_modal) {
        return;
    }

    const modalTitle =
        wishlist_modal.querySelector(
            ".warning-title"
        );

    const modalDescription =
        wishlist_modal.querySelector(
            ".warning-desc"
        );

    if (modalTitle) {
        modalTitle.textContent = title;
    }

    if (modalDescription) {
        modalDescription.textContent =
            description;
    }

    wishlist_modal.style.visibility =
        "visible";

    wishlist_modal.style.opacity =
        "1";
}

function showLoginRequiredModal() {
    if (!login_required_modal) {
        return;
    }

    login_required_modal.style.visibility = "visible";
    login_required_modal.style.opacity = "1";
}

function closeWishlistModal() {
    wishlist_modal.style.visibility = "hidden";
    wishlist_modal.style.opacity = "0";
}

function addtocart_confirm() {
    const sizeSelect = document.getElementById("spiceSize");
    const params = new URLSearchParams(window.location.search);
    const productId = Number(params.get("productId"));
    const bundleId = Number(params.get("bundleId"));

    const itemId =
        isBundle
            ? bundleId
            : productId;

    const size =
        sizeSelect
            ? sizeSelect.value
            : "8oz";

    addtocart_modal.style.visibility = "hidden";

    addtocart_modal.style.opacity = "0";

    if (!itemId) {
        console.error("No valid product or bundle ID found.");
        showCartErrorModal("Unable to identify this item.");

        return;
    }

    /*
     * Load the existing cart from localStorage.
     */
    const cart =
        JSON.parse(
            localStorage.getItem("cart")
        ) || [];

    /*
     * Check whether the same product/bundle AND size
     * are already in the cart.
     */
    const existingItem =
        cart.find(item => {
            if (isBundle) {
                return (
                    item.isBundle === true &&
                    Number(item.cartbundle_id) ===
                        itemId &&
                    item.cartprod_size === size
                );
            }

            return (
                item.isBundle === false &&
                Number(item.cartprod_id) ===
                    itemId &&
                item.cartprod_size === size
            );
        });

    if (existingItem) {
        showAlreadyInCartModal();
        return;
    }

    /*
     * Add bundle to localStorage cart.
     */
    if (isBundle) {
        cart.push({
            cartbundle_id: itemId,
            cartprod_id: null,
            cartprod_size: size,
            quantity: 1,
            isBundle: true
        });
    } else {
        /*
         * Add regular product to localStorage cart.
         */
        cart.push({
            cartprod_id: itemId,
            cartbundle_id: null,
            cartprod_size: size,
            quantity: 1,
            isBundle: false
        });
    }

    /*
     * Save updated cart.
     */
    localStorage.setItem(
        "cart",
        JSON.stringify(cart)
    );

    console.log(
        "Cart saved to localStorage:",
        cart
    );

    showSuccessModal();
}

function addtocart_close() {
    addtocart_modal.style.visibility = "hidden";
    addtocart_modal.style.opacity = "0";
}

function showCartErrorModal(message) {
    if (!success_modal) {
        return;
    }

    const title = success_modal.querySelector(".warning-title");
    const description = success_modal.querySelector(".warning-desc");

    if (title) {
        title.textContent = "CART ERROR";
    }

    if (description) {
        description.textContent = message;
    }

    success_modal.style.visibility = "visible";
    success_modal.style.opacity = "1";
}

function showSuccessModal() {
    const successModal = document.querySelector(".success-modal");

    if (!successModal) {
        return;
    }

    const itemType =
        isBundle ? "bundle" : "product";

    successModal.querySelector(".warning-title")
        .textContent = "SUCCESS";

    successModal.querySelector(".warning-desc")
        .textContent =
            `Your ${itemType} has been added to your cart.`;

    successModal.style.visibility = "visible";
    successModal.style.opacity = "1";
}

function showAlreadyInCartModal() {
    const successModal = document.querySelector(".success-modal");

    if (!successModal) {
        return;
    }

    const itemType =
        isBundle ? "bundle" : "product";

    successModal.querySelector(".warning-title")
        .textContent = "ALREADY IN CART";

    successModal.querySelector(".warning-desc")
        .textContent =
            `This ${itemType} with the selected size is already in your cart.`;

    successModal.style.visibility = "visible";
    successModal.style.opacity = "1";
}

function closeModal() {
    success_modal.style.visibility = "hidden";
    success_modal.style.opacity = "0";
}