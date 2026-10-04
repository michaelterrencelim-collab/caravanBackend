let selectedItem = null;
let cartData = [];
let productsData = [];
let bundlesData = [];
let selectedPaymentMethod = null;
let addresses = [];
let selectedAddress = null;

let vouchers = [];
let selectedVoucher = null;

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
    Promise.all([
        loadCartItems(),
        loadAddresses(),
        loadVouchers()
    ]) .finally (() => {
        hideLoader();
    });
    
    updateNavbarLogin();

    // Voucher dropdown
    document.addEventListener("change", function(event) {

        if (event.target.id !== "voucherSelect") {
            return;
        }

        const voucherId = parseInt(event.target.value);
        const desc = document.getElementById("voucherDescription");

        selectedVoucher =
            vouchers.find(
                v => Number(v.Voucher_id) === voucherId
            ) || null;

        desc.textContent =
            selectedVoucher
                ? selectedVoucher.Voucher_desc
                : "";

        updatePriceSummary();
    });

    // Address dropdown
    document.addEventListener(
        "change",
        function(event) {

            if (
                event.target.id !==
                "addressSelect"
            ) {
                return;
            }

            const addressId =
                parseInt(
                    event.target.value
                );

            selectedAddress = addresses.find(address =>
                Number(address.Address_id) === addressId
            ) || null;


            console.log(
                "Selected address:",
                selectedAddress
            );
        }
    );

    // Payment selector
    const paymentOptions = document.querySelectorAll(".payment-option");

    paymentOptions.forEach(option => {
        option.addEventListener("click", () => {
            const paymentType =
                option.dataset.paymentType;

            if (paymentType === "card") {
                alert("Card payment is not available yet.");
                return;
            }

            paymentOptions.forEach(button => {
                button.classList.remove("selected");
            });

            option.classList.add("selected");

            selectedPaymentMethod = {
                methodId: Number(option.dataset.methodId),
                paymentType: paymentType,
                paymentName: option.textContent.trim()
            };
        });
    });
});
``

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

const delete_modal = document.querySelector(".delete-warning-modal");

/*Warning for delete*/

function deleteWarn(button) {
    selectedItem = button.closest(".item-card");

    delete_modal.style.visibility = "visible";
    delete_modal.style.opacity = "1";
}

function warning_No() {
    delete_modal.style.visibility = "hidden";
    delete_modal.style.opacity = "0";

    selectedItem = null;
}

function warning_Yes() {
    if (selectedItem) {
        // Use the cart entry index so identical products with different sizes are distinct.
        const cartIndex = parseInt(selectedItem.dataset.cartIndex, 10);

        // Remove from DOM
        selectedItem.remove();

        // Remove from localStorage cart
        if (!Number.isNaN(cartIndex)) {
            let cart = JSON.parse(localStorage.getItem("cart")) || [];
            if (cartIndex > -1 && cartIndex < cart.length) {
                cart.splice(cartIndex, 1);
                localStorage.setItem("cart", JSON.stringify(cart));

                cartData = cart;
                // Updates Checkoutbtn depending on cart content
                updateCheckoutButton();
                displayCartItems();
            }
        }

        // Update price summary
        updatePriceSummary();
    }

    warning_No();
}

/*warning for checkout*/
const warning_modal = document.querySelector(".checkout-warning-modal");
const checkout_button = document.querySelector(".checkout-btn");

function checkoutWarn() {

    if (!selectedPaymentMethod) {
        alert("Please select a payment method first.");
        return;
    }

    if (!selectedAddress) {
        alert("Please select a delivery address.");
        return;
    }

    warning_modal.style.visibility = "visible";
    warning_modal.style.opacity = "1";
}

function checkout_No() {
    warning_modal.style.visibility = "hidden";
    warning_modal.style.opacity = "0";
}

let checkoutInProgress = false;

async function checkout_Yes() {
    if (checkoutInProgress) {
        return;
    }

    checkout_No();

    const modal = document.querySelector(".checkout-result-modal");
    const processingState = document.getElementById("checkoutProcessingState");
    const successState = document.getElementById("checkoutSuccessState");

    modal.style.display = "flex";
    processingState.style.display = "block";
    successState.style.display = "none";

    checkoutInProgress = true;

    try {
        if (cartData.length === 0) {
            throw new Error(
                "Your cart is empty"
            );
        }

        if (!selectedAddress) {
            throw new Error(
                "Please select a delivery address"
            );
        }

        if (!selectedPaymentMethod) {
            throw new Error(
                "Please select a payment method"
            );
        }

        if (
            selectedPaymentMethod.paymentType === "card"
        ) {
            throw new Error(
                "Card payment is not available yet"
            );
        }

        const items = cartData.map(cartItem => {
            const productId = cartItem.isBundle
                ? Number(cartItem.cartbundle_id)
                : Number(cartItem.cartprod_id);

            return {
                productId,
                quantity: Number(cartItem.quantity) || 1,
                productSize: cartItem.cartprod_size || "8oz"
            };
        });

        const payload = {
            items,

            addressId: Number(selectedAddress.Address_id),
            methodId: selectedPaymentMethod.methodId,
            voucherId: selectedVoucher
                    ? Number(
                        selectedVoucher.Voucher_id
                    )
                    : null
        };

        const response = await fetch("/checkout", {
            method: "POST",

            headers: {
                "Content-Type":
                    "application/json"
            },

            body:
                JSON.stringify(payload)
        });

        const result = await response.json();

        //Console log of the TEST_MODE
        console.log("Checkout Response:", result);

        if (!response.ok) {
            throw new Error(
                result.error ||
                "Unable to place order"
            );
        }

        if (result.testMode) {
            console.log(
                "TEST MODE CHECKOUT PREVIEW:",
                JSON.stringify(result.preview, null, 4)
            );

            processingState.style.display = "none";
            successState.style.display = "block";

            return;
        }

        console.log("Order placed:", result);

        /*
         * Only clear the cart after the API
         * confirms that checkout succeeded.
         */
        localStorage.removeItem("cart");

        cartData = [];
        selectedVoucher = null;
        selectedAddress = null;
        selectedPaymentMethod = null;

        displayCartItems();
        updateCheckoutButton();
        updatePriceSummary();

        document
            .querySelectorAll(".payment-option")
            .forEach(option => {
                option.classList.remove("selected");
            });

        const voucherSelect = document.getElementById("voucherSelect");
        const addressSelect = document.getElementById("addressSelect");
        const voucherDescription = document.getElementById("voucherDescription");

        if (voucherSelect) {
            voucherSelect.value = "";
        }

        if (addressSelect) {
            addressSelect.value = "";
        }

        if (voucherDescription) {
            voucherDescription.textContent = "";
        }

        processingState.style.display = "none";
        successState.style.display = "block";

    } catch (error) {
        console.error(
            "Checkout failed:",
            error
        );

        modal.style.display = "none";

        alert(error.message || "Failed to process order.");
    } finally {
        checkoutInProgress = false;
    }
}

// Load cart items from localStorage and products_list.json
async function loadCartItems() {

    showLoader();

    try {

        cartData =
            JSON.parse(
                localStorage.getItem("cart")
            ) || [];

        updateCheckoutButton();

        const response =
            await fetch("/api/fetchProducts");

        if (!response.ok) {
            throw new Error(
                `Unable to load products: ${response.status}`
            );
        }

        const items = await response.json();
        const allItems =
            Array.isArray(items)
                ? items
                : [];

        productsData =
            allItems.filter(
                item =>
                    Number(item.type_id) === 1
            );

        bundlesData =
            allItems.filter(
                item =>
                    Number(item.type_id) === 2
            );

        displayCartItems();

    } catch (error) {
        console.error("Error loading cart items:", error);
        document.querySelector(".cart-items").innerHTML = "<p>Unable to load cart items.</p>";
    } finally {
        hideLoader();
    }
}

// Loads User's available vouchers
async function loadVouchers() {
    try {
        console.log("Loading vouchers...");
        const response = await fetch("/vouchers/me");
        console.log("status:", response.status);
        const data = await response.json();
        console.log("Data:", data);
        vouchers = data;
        renderVoucherDropdown();
    } catch (error) {
        console.error(
            "Voucher load error:",
            error
        );
    }
}

// Loads User's Stored addresses from db
async function loadAddresses() {

    try {

        const response =
            await fetch("/api/addresses");

        if (!response.ok) {
            console.error(
                "Failed to load addresses"
            );
            return;
        }

        addresses =
            await response.json();

        renderAddressDropdown();

    } catch (error) {

        console.error(
            "Address load error:",
            error
        );

    }
}

const cartItemsContainer = document.querySelector(".cart-items");

// display cart empty screen when cart empty
function displayCartEmpty() {
    cartItemsContainer.innerHTML = `
            <div style="display: flex; justify-content: center; align-items: center; padding: 40px;">
                <img
                    src="Images/emptycart.png"
                    alt="empty cart image"
                    style="width: 150px; height: 150px;"
                >
            </div>

            <h4 style="text-align: center; padding: 0px;">
                Your cart is empty.
            </h4>
        `;
}

// Display cart items in the UI
function displayCartItems() {

    // Clear existing items
    cartItemsContainer.innerHTML = "";

    // Check if cart is empty
    if (cartData.length === 0) {
        
        displayCartEmpty();
        updatePriceSummary();
        return;
    }

    // Create item cards for each product/bundle in cart
    cartData.forEach((cartItem, index) => {
        let item = null;
        let itemCard = null;
        
        if (cartItem.isBundle) {
            // Find bundle
            item = bundlesData.find(
                bundle => Number(bundle.product_id) === Number(cartItem.cartbundle_id)
            );
            if (item) {
                itemCard = createBundleCard(item, cartItem, index);
            }
        } else {
            // Find product
            item = productsData.find(
                p => p.product_id === Number(cartItem.cartprod_id)
            );
            if (item) {
                itemCard = createItemCard(item, cartItem, index);
            }
        }

        if (itemCard) {
            cartItemsContainer.appendChild(itemCard);
        }
    });

    // Update price summary
    updatePriceSummary();
}

// Create a single item card element
function createItemCard(product, cartItem, index) {
    const itemCard = document.createElement("div");
    itemCard.classList.add("item-card");
    itemCard.dataset.productId = product.product_id;
    itemCard.dataset.cartIndex = index;
    itemCard.dataset.index = index;

    const size = cartItem.cartprod_size || "8oz";
    const sizeMultiplier = size === "16oz" ? 16 : 8;
    const quantity = cartItem.quantity || 1;
    const itemPrice = product.product_price * sizeMultiplier;

    // Get first category
    const category = product.product_category.length > 0
        ? product.product_category[0].category_name
        : "Uncategorized";

    itemCard.innerHTML = `
        <div class="product-image">
            <img src="${product.product_image}" alt="${product.product_name}">
        </div>

        <div class="item-info">
            <h4 class="product_name">${product.product_name}</h4>
            <p class="product_size">Size: ${size.replace("oz", " oz")}</p>
            <p class="product_category">Category: ${category}</p>

            <div class="quantity-control">
                <span>Quantity:</span>
                <button class="quantity-btn" onclick="decreaseQuantity(${index})">−</button>
                <span class="product_quantity" data-index="${index}">${quantity}</span>
                <button class="quantity-btn" onclick="increaseQuantity(${index})">+</button>

                <button class="delete-btn" onclick="deleteWarn(this)">🗑 Delete</button>
            </div>
        </div>

        <div class="item-price">
            <p class="product_price">Price: ₱${(itemPrice*quantity).toFixed(2)}</p>
        </div>
    `;

    return itemCard;
}

// Create a bundle card element for cart
function createBundleCard(bundle, cartItem, index) {
    const itemCard = document.createElement("div");

    itemCard.classList.add("item-card");

    itemCard.dataset.bundleId = bundle.product_id;
    itemCard.dataset.cartIndex = index;
    itemCard.dataset.index = index;
    const size = cartItem.cartprod_size || "8oz";
    const sizeMultiplier =
        size === "16oz" ? 16 : 8;

    const quantity = Number(cartItem.quantity) || 1;
    const basePrice = Number(bundle.product_price) || 0;
    const itemPrice = basePrice * sizeMultiplier;

    itemCard.innerHTML = `
        <div class="product-image">
            <img src="${bundle.product_image}" alt="${bundle.product_name}">
        </div>

        <div class="item-info">
            <h4 class="product_name">
                ${bundle.product_name || "Unnamed Bundle"}
            </h4>

            <p class="product_size">
                Size: ${size.replace("oz", " oz")}
            </p>

            <p class="product_category">
                Bundle
            </p>

            <div class="quantity-control">
                <span>Quantity:</span>

                <button
                    class="quantity-btn"
                    onclick="decreaseQuantity(${index})">
                    −
                </button>

                <span
                    class="product_quantity"
                    data-index="${index}">
                    ${quantity}
                </span>

                <button
                    class="quantity-btn"
                    onclick="increaseQuantity(${index})">
                    +
                </button>

                <button
                    class="delete-btn"
                    onclick="deleteWarn(this)">
                    🗑 Delete
                </button>
            </div>
        </div>

        <div class="item-price">
            <p class="product_price">
                Price: ₱${(itemPrice * quantity).toFixed(2)}
            </p>
        </div>
    `;

    return itemCard;
}
``

function updateCheckoutButton() {
    const checkoutButton = document.querySelector(".checkout-btn");

    if (!checkoutButton) return;

    if (cartData.length === 0) {
        checkoutButton.disabled = true;
    } else {
        checkoutButton.disabled = false;
    }
}

// Increase quantity for a cart item
function increaseQuantity(index) {
    const itemCard = document.querySelector(
        `.item-card[data-cart-index="${index}"]`
    );

    if (!itemCard) return;

    const quantityElement = itemCard.querySelector(".product_quantity");
    const priceElement = itemCard.querySelector(".product_price");

    let quantity = parseInt(quantityElement.textContent, 10);
    quantity++;

    // Update cart data
    cartData[index].quantity = quantity;

    // Save cart
    localStorage.setItem("cart", JSON.stringify(cartData));

    // Update displayed quantity
    quantityElement.textContent = quantity;
    const cartItem = cartData[index];

    if (cartItem.isBundle) {

        const bundleId = Number(itemCard.dataset.bundleId);
        const bundle = bundlesData.find(
            item => Number(item.product_id) === bundleId
        );

        if (bundle) {
            const sizeMultiplier =
                cartItem.cartprod_size === "16oz" ? 16 : 8;

            const itemPrice =
                bundle.product_price *
                sizeMultiplier *
                quantity;

            priceElement.textContent =
                `Price: ₱${itemPrice.toFixed(2)}`;
        }
    } else {
        const productId = Number(itemCard.dataset.productId);
        const product = productsData.find(
            p => p.product_id === productId
        );
        if (product) {
            const sizeMultiplier =
                cartItem.cartprod_size === "16oz" ? 16 : 8;

            const itemPrice =
                product.product_price *
                sizeMultiplier *
                quantity;

            priceElement.textContent =
                `Price: ₱${itemPrice.toFixed(2)}`;
        }
    }
    updatePriceSummary();
}

// Decrease quantity for a cart item
function decreaseQuantity(index) {
    const itemCard = document.querySelector(
        `.item-card[data-cart-index="${index}"]`
    );

    if (!itemCard) return;
    const quantityElement = itemCard.querySelector(".product_quantity");
    const priceElement = itemCard.querySelector(".product_price");

    let quantity = parseInt(quantityElement.textContent, 10);

    if (quantity > 1) {
        quantity--;

        // Update cart data
        cartData[index].quantity = quantity;

        // Save cart
        localStorage.setItem("cart", JSON.stringify(cartData));

        // Update displayed quantity
        quantityElement.textContent = quantity;
        const cartItem = cartData[index];

        if (cartItem.isBundle) {
            const bundleId = Number(itemCard.dataset.bundleId);

            const bundle = bundlesData.find(
                b => Number(b.product_id) === bundleId
            );

            if (bundle) {
                const sizeMultiplier =
                    cartItem.cartprod_size === "16oz"
                        ? 16
                        : 8;

                const itemPrice =
                    Number(bundle.product_price) *
                    sizeMultiplier *
                    quantity;

                priceElement.textContent = `Price: ₱${itemPrice.toFixed(2)}`;
            }
        } else {
            const productId = Number(itemCard.dataset.productId);
            const product = productsData.find(
                p => p.product_id === productId
            );

            if (product) {
                const sizeMultiplier =
                    cartItem.cartprod_size === "16oz" ? 16 : 8;

                const itemPrice =
                    product.product_price *
                    sizeMultiplier *
                    quantity;

                priceElement.textContent =
                    `Price: ₱${itemPrice.toFixed(2)}`;
            }
        }
        updatePriceSummary();
    }
}

// voucher dropdown
function renderVoucherDropdown() {

    const select = document.getElementById("voucherSelect");

    if (!select) {
        return;
    }

    select.innerHTML = "";

    if (vouchers.length === 0) {
        select.innerHTML =
            '<option value="">No vouchers available</option>';
        return;
    }
    select.innerHTML =
        '<option value="">Select Voucher</option>';

    vouchers.forEach(voucher => {
        const option = document.createElement("option");

        option.value = voucher.Voucher_id;
        option.textContent = `${voucher.Voucher_name} (${voucher.discount}% OFF)`;
        select.appendChild(option);
    });
}

// address dropdown
function renderAddressDropdown() {

    const select =
        document.getElementById(
            "addressSelect"
        );

    if (!select) return;

    select.innerHTML = "";

    if (addresses.length === 0) {

        select.innerHTML =
            `
            <option value="">
                No saved addresses
            </option>
            `;

        return;
    }

    select.innerHTML =
        `
        <option value="">
            Select Address
        </option>
        `;

    addresses.forEach(address => {

        const option =
            document.createElement("option");

        option.value =
            address.Address_id;

        option.textContent =
            `${address.Street_address}, `
            + `${address.City} `
            + `${address.Zip_code}`;

        select.appendChild(option);

    });
}

// Update price summary
function updatePriceSummary() {
    let totalProductCost = 0;

    // Calculate total based on quantities
    document.querySelectorAll(".item-card").forEach((itemCard, index) => {
        const cartIndex = parseInt(itemCard.dataset.cartIndex, 10);
        const cartItem = cartData[cartIndex];
        if (!cartItem) {
            return;
        }
        const quantityElement = itemCard.querySelector(".product_quantity");
        const quantity = quantityElement ? parseInt(quantityElement.textContent) : 1;
        const sizeMultiplier = cartItem && cartItem.cartprod_size === "16oz" ? 16 : 8;

            if (cartItem.isBundle) {
                //handle bundle
                const bundleId = Number(itemCard.dataset.bundleId);

                const bundle = bundlesData.find(
                    item => Number(item.product_id) === bundleId
                );

                if (bundle) {
                    totalProductCost +=
                        Number(bundle.product_price) *
                        sizeMultiplier *
                        quantity;
                }
            } else {
            // Handle product
            const productId = parseInt(itemCard.dataset.productId, 10);
            const product = productsData.find(p => p.product_id === productId);
            if (product) {
                totalProductCost += product.product_price * sizeMultiplier * quantity;
            }
        }
    });

    // Update price breakdown
    const shippingFee = 100.00;
    let discount = 0;

    if (selectedVoucher) {
        const discountPercentage =
            Number(selectedVoucher.discount) || 0;

        discount =
            totalProductCost *
            (discountPercentage / 100);

        discount = Math.min(
            discount,
            totalProductCost
        );
    }

    const totalCost = Math.max(
        0,
        totalProductCost +
        shippingFee -
        discount
    );

    // Update the price breakdown display
    const priceBreakdown = document.querySelector(".price-breakdown");
    if (priceBreakdown) {
        const priceRows = priceBreakdown.querySelectorAll(".price-row");
        if (priceRows.length >= 3) {
            priceRows[0].innerHTML = `<span>Products Cost:</span><span>₱${totalProductCost.toFixed(2)}</span>`;
            priceRows[1].innerHTML = `<span>Shipping Fee:</span><span>₱${shippingFee.toFixed(2)}</span>`;
            priceRows[2].innerHTML = `<span>Discount:</span><span>-₱${discount.toFixed(2)}</span>`;
        }

        const totalRow = priceBreakdown.querySelector(".total-row");
        if (totalRow) {
            totalRow.innerHTML = `<span>Total Cost:</span><span>₱${totalCost.toFixed(2)}</span>`;
        }
    }
}

document.addEventListener("click", function(event) {
    
        if (event.target.id === "continueShoppingBtn") {
            window.location.href = "/store";
        }
        if (event.target.id === "viewOrdersBtn") {
            window.location.href = "/user/order";
        }
    }
);


