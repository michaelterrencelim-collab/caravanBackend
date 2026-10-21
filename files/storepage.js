//loading screen while products load
function showContentLoader() {

    const loader =
        document.getElementById(
            "contentLoader"
        );

    if (loader) {
        loader.classList.add(
            "active"
        );
    }
}

function hideContentLoader() {

    const loader =
        document.getElementById(
            "contentLoader"
        );

    if (loader) {
        loader.classList.remove(
            "active"
        );
    }
}

//fade-in/out animation for product cards
const observer = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("show");
            } else {
                entry.target.classList.remove("show");
            }
        });
    },
    {
        threshold: 0.2
    }
);

// State management for current tab
let currentTab = "products";

// Tab switching functionality
function switchTab(tab) {

    showContentLoader();
    currentTab = tab;

    document
        .getElementById("productsTab")
        .classList.toggle(
            "active",
            tab === "products"
        );

    document
        .getElementById("bundlesTab")
        .classList.toggle(
            "active",
            tab === "bundles"
        );

    document
        .getElementById("productsContent")
        .classList.toggle(
            "active",
            tab === "products"
        );

    document
        .getElementById("bundlesContent")
        .classList.toggle(
            "active",
            tab === "bundles"
        );

    document
        .getElementById("product_country")
        .disabled = (tab === "bundles");

    updateNavbarForTab(tab);

    if (tab === "products") {
        renderProducts();
    } else {
        renderBundles();
    }
    hideContentLoader();
}

// checks if user Logged in; if so, change login to profile
async function updateNavbarLogin(){

      const response = await fetch("/api/isLoggedIn");

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
updateNavbarLogin();

// Update navbar based on tab
function updateNavbarForTab(tab) {

    const categories = document.querySelectorAll(".category");

    if (tab === "bundles") {
        categories.forEach(category => {

            const title = category.querySelector(
                    ".category-title span:first-child"
                )
                ?.textContent
                ?.trim()
                ?.toUpperCase();

            if (title && title.toUpperCase() === "DEFAULT") {

                category.style.display = "block";
                const subcategories = category.querySelectorAll(".subcategory");

                subcategories.forEach(sub => {

                    if (
                        sub.textContent.trim().toUpperCase() === "All Products"
                    ) {
                        sub.style.display = "block";
                    } else {
                        sub.style.display = "none";
                    }
                });
            } else {
                category.style.display = "none";
            }
        });
    } else {
        categories.forEach(category => {
            category.style.display = "block";
            category
                .querySelectorAll(
                    ".subcategory"
                )
                .forEach(sub => {
                    sub.style.display =
                        "block";
                });
        });
    }
}

function toggleCategoryMenu() {
    const sidebar = document.querySelector(".vertical-navbar");
    const overlay = document.getElementById("sidebarOverlay");
    const hamburger = document.getElementById("categoryMenuToggle");

    sidebar.classList.toggle("active");
    overlay.classList.toggle("active");
    hamburger.classList.toggle("active");
}

function toggleSubcategories(element) {
    const subcategories = element.nextElementSibling;
    const arrow = element.querySelector(".toggle-icon");

    subcategories.classList.toggle("hidden");
    arrow.classList.toggle("rotate");
}

let products = [];
let bundles = [];
let selectedCategory = "";
let selectedBundleCategory = "";
``
// render product cards
function renderProducts() {

    const productsection =
        document.getElementById("productsSection");

    const noItemContainer =
        productsection.querySelector(
            ".noitem-container"
        );

    const searchTerm =
        document.getElementById("searchInput")
            .value
            .trim()
            .toLowerCase();

    const selectedCountry =
        document.getElementById(
            "product_country"
        ).value;

    productsection
        .querySelectorAll(".product-card")
        .forEach(card => card.remove());

    const filteredProducts =
        products
            .filter(product => {

                const matchesCategory =
                    !selectedCategory ||
                    product.product_category.some(
                        category =>
                            category.category_name ===
                            selectedCategory
                    );

                const matchesCountry =
                    !selectedCountry ||
                    product.product_country ===
                    selectedCountry;

                const matchesSearch =
                    product.product_name
                        .toLowerCase()
                        .includes(searchTerm);

                return (
                    matchesCategory &&
                    matchesCountry &&
                    matchesSearch
                );

            })
            .sort((a, b) =>
                a.product_name.localeCompare(
                    b.product_name
                )
            );

    filteredProducts.forEach(product => {

        const productCard =
            document.createElement("div");

        productCard.classList.add(
            "product-card"
        );

        productCard.dataset.productId =
            product.product_id;

        productCard.innerHTML = `
            <img  
                src=${product.product_image}  
                alt=${product.product_name}
                class="product-image"
            />

            <div class="product-info">
                <h3 class="product-name">
                    ${product.product_name}
                </h3>

                <p class="product-price">
                    ₱${Number(product.product_price).toFixed(2)}/oz.
                </p>
            </div>
        `;

        productCard.addEventListener(
            "click",
            () => {

                window.location.href =
                    `product?productId=${product.product_id}`;

            }
        );

        productsection.appendChild(
            productCard
        );

        observer.observe(productCard);

    });

    noItemContainer.style.display =
        filteredProducts.length
            ? "none"
            : "block";
}

// render bundle cards
function renderBundles() {

    const bundleSection =
        document.getElementById(
            "bundlesSection"
        );

    const noItemContainer =
        bundleSection.querySelector(
            ".noitem-container"
        );

    const searchTerm =
        document.getElementById(
            "searchInput"
        )
            .value
            .trim()
            .toLowerCase();

    bundleSection
        .querySelectorAll(".product-card")
        .forEach(card => card.remove());

    const filteredBundles =
        bundles
            .filter(bundle => {

                return bundle.product_name
                    .toLowerCase()
                    .includes(searchTerm);

            })
            .sort((a, b) =>
                a.product_name.localeCompare(
                    b.product_name
                )
            );

    filteredBundles.forEach(bundle => {

        const bundleCard =
            document.createElement("div");

        bundleCard.classList.add(
            "product-card"
        );

        bundleCard.dataset.bundleId =
            bundle.product_id;

        bundleCard.innerHTML = `
            <img 
                src=${bundle.product_image}
                alt=${bundle.product_name}
                class="product-image"
            />

            <div class="product-info">
                <h3 class="product-name">
                    ${bundle.product_name}
                </h3>

                <p class="product-price">
                    ₱${Number(bundle.product_price).toFixed(2)}/oz.
                </p>
            </div>
        `;

        bundleCard.addEventListener(
            "click",
            () => {

                window.location.href =
                    `product?bundleId=${bundle.product_id}`;

            }
        );

        bundleSection.appendChild(
            bundleCard
        );

        observer.observe(bundleCard);

    });

    noItemContainer.style.display =
        filteredBundles.length
            ? "none"
            : "block";
}

function filterBundlesByCategory(element) {
    const categoryName = element.textContent.trim();

    selectedBundleCategory = categoryName;

    // Highlight selected category
    document.querySelectorAll(".subcategory").forEach(item => {
        item.classList.toggle(
            "active",
            item === element
        );
    });

    // Re-render bundles
    renderBundles();
}

showContentLoader();
// fetches all the products inside products and bundles inside db
fetch("/api/fetchProducts")
    .then(response => {

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        return response.json();

    })
    .then(data => {

        products = data.filter(
            item =>
                Number(item.type_id) === 1
        );

        bundles = data.filter(
            item =>
                Number(item.type_id) === 2
        );

        const countrySelect =
            document.getElementById(
                "product_country"
            );

        countrySelect.innerHTML =
            `<option value="">ALL COUNTRIES</option>`;

        const countries = [
            ...new Set(
                products
                    .filter(
                        p =>
                            p.product_country
                    )
                    .map(
                        p =>
                            p.product_country
                    )
            )
        ].sort();

        countries.forEach(country => {

            const option =
                document.createElement(
                    "option"
                );

            option.value = country;
            option.textContent = country;

            countrySelect.appendChild(
                option
            );

        });

        renderProducts();
        renderBundles();
        hideContentLoader();



    })
    .catch(error => {

        hideContentLoader();

    });

const form = document.getElementById("Searchbar");
const countrySelect = document.getElementById("product_country");

form.addEventListener("submit", (event) => {
    event.preventDefault(); // Prevent the form from refreshing the page on submit
    SearchProducts();
});

countrySelect.addEventListener("change", () => {
    if (currentTab === "products") {
        renderProducts();
    }
});

document.querySelectorAll(".subcategory").forEach(subcategory => {
    subcategory.addEventListener("click", () => {

        const categoryName = subcategory.textContent.trim();

        if (currentTab === "products") {
            if (categoryName === "All Products") {
                selectedCategory = "";
            }
            else {
                selectedCategory = categoryName;
            }

            // Highlight selected category
            document.querySelectorAll(".subcategory").forEach(item => {
                item.classList.toggle(
                    "active",
                    item === subcategory
                );
            });

            // Re-render products
            renderProducts();
        }
    });
});

const allProducts = document.querySelector(".subcategory");
if (allProducts) {
    allProducts.classList.add("active");
}
selectedCategory = "";

function SearchProducts() {

    if (currentTab === "products") {
        renderProducts();
    } else {
        renderBundles();
    }
}


