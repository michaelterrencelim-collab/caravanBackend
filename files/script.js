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

const elements = document.querySelectorAll(
    ".Categories, .fade-title, .card, .explore-btn, .teamSection, .aboutUs"
  );

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

  elements.forEach((element) => {
    observer.observe(element);
});


fetch("products_list.json")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Unable to load products: ${response.status}`);
    }

    return response.json();
  })

  .then((products) => {

    // NEW ARRIVALS
    // Product IDs used: 1, 8, 11

    const newArrivalIds = [1, 8, 11];

    const newArrivals = newArrivalIds
      .map(id => products.find(product => product.product_id === id))
      .filter(product => product !== undefined);

    const newArrivalContainer =
      document.querySelector("#newArrivalsContainer");

    newArrivals.forEach(product => {

      const card = document.createElement("div");
      card.classList.add("card");

      card.dataset.productId = product.product_id;

      card.innerHTML = `
        <div class="cardImg">
          <img
            src="${product.product_image}"
            class="card-img-top"
            alt="${product.product_name}"
          >
        </div>

        <div class="card-body">
          <h5 class="card-title">${product.product_name}</h5>
          <p class="art-price">
            ₱${product.product_price.toFixed(2)}
          </p>
        </div>
      `;

      card.addEventListener("click", () => {
        window.location.href =
          `productpage.html?productId=${product.product_id}`;
      });

      newArrivalContainer.appendChild(card);

      // IMPORTANT
      observer.observe(card);
    });


    // ========================================
    // MOST POPULAR
    // Top 3 products by product_likes
    // ========================================

    const popularProducts = [...products]
      .sort((a, b) => b.product_likes - a.product_likes)
      .slice(0, 3);

    const popularContainer =
      document.querySelector("#popularProductsContainer");

    popularProducts.forEach(product => {

      const card = document.createElement("div");
      card.classList.add("card");

      card.dataset.productId = product.product_id;

      card.innerHTML = `
        <div class="cardImg">
          <img
            src="${product.product_image}"
            class="card-img-top"
            alt="${product.product_name}"
          >
        </div>

        <div class="card-body">
          <h5 class="card-title">${product.product_name}</h5>
          <p class="art-price">
            ₱${product.product_price.toFixed(2)}
          </p>
        </div>
      `;

      // Make card clickable
      card.addEventListener("click", () => {
        window.location.href =
          `productpage.html?productId=${product.product_id}`;
      });

      popularContainer.appendChild(card);

      observer.observe(card);
    });

  })

  .catch((error) => {
  });
