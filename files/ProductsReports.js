document.addEventListener("DOMContentLoaded", () => {
  const PAGE_SIZE = 10;
  const body = document.getElementById("productsBody");
  const searchInput = document.getElementById("productSearch");
  const subtitle = document.getElementById("pageSubtitle");
  const previousButton = document.getElementById("prevPageBtn");
  const nextButton = document.getElementById("nextPageBtn");
  const pageIndicator = document.getElementById("pageIndicator");
  const filterButton = document.getElementById("categoryFilterBtn");
  const filterLabel = document.getElementById("categoryFilterLabel");
  const categoryMenu = document.getElementById("categoryFilterMenu");
  const countryFilter = document.getElementById("countryFilter");
  const countryFilterToggle = document.getElementById("countryFilterToggle");
  const countryFilterMenu = document.getElementById("countryFilterMenu");
  const editCountry = document.getElementById("editProductCountry");
  const editCountryToggle = document.getElementById("editProductCountryToggle");
  const editCountryMenu = document.getElementById("editProductCountryMenu");
  const editCategoriesToggle = document.getElementById("editCategoriesToggle");
  const editCategoriesMenu = document.getElementById("editCategoriesMenu");
  const editCategoriesLabel = document.getElementById("editCategoriesLabel");
  const editStatus = document.getElementById("editProductStatus");
  const statusToggle = document.getElementById("productVisibilityToggle");
  const statusLabel = document.getElementById("productVisibilityLabel");
  const addProductButton = document.getElementById("addProductBtn");
  const initialStockInput = document.getElementById("newProductInitialStock");
  const currentStockDisplay = document.getElementById("editProductStock");
  let creatingProduct = false;
  const tabs = [...document.querySelectorAll(".pr-type-tab")];
  const editDialog = document.getElementById("editProductDialog");
  const deleteDialog = document.getElementById("deleteProductDialog");
  const editForm = document.getElementById("editProductForm");
  const saveButton = document.getElementById("saveProductButton");
  const editMessage = document.getElementById("editProductMessage");
  const deleteError = document.getElementById("deleteProductError");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const imageSrc = (path) => !path ? "" : /^(https?:|\/)/i.test(path) ? path : `/${path}`;
  let products = [];
  let countries = [];
  let categories = [];
  let page = 1;
  let activeType = "1";
  let selectedCategory = "";
  let editingProduct = null;
  let deletingProduct = null;
  let initialEditValues = "";

  filterButton.addEventListener("click", () => toggleMenu(categoryMenu, filterButton));
  countryFilterToggle.addEventListener("click", () => toggleMenu(countryFilterMenu, countryFilterToggle));
  editCountryToggle.addEventListener("click", () => toggleMenu(editCountryMenu, editCountryToggle));
  editCategoriesToggle.addEventListener("click", () => toggleMenu(editCategoriesMenu, editCategoriesToggle));
  addProductButton.addEventListener("click", openAddDialog);
  statusToggle.addEventListener("click", () => {
    editStatus.value = editStatus.value === "Shown" ? "Hidden" : "Shown";
    statusToggle.setAttribute("aria-checked", String(editStatus.value === "Shown"));
    statusLabel.textContent = editStatus.value;
    updateSaveState();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".pr-category-filter-wrap, .pr-select-wrap, .pr-multiselect")) closeAllMenus();
  });
  countryFilterMenu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-country-id]");
    if (!option) return;
    countryFilter.value = option.dataset.countryId === "__all__" ? "" : option.dataset.countryId;
    document.getElementById("countryFilterLabel").textContent = option.dataset.countryName;
    renderCountryOptions();
    countryFilterMenu.hidden = true;
    countryFilterToggle.setAttribute("aria-expanded", "false");
    page = 1;
    render();
  });
  editCountryMenu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-country-id]");
    if (!option) return;
    editCountry.value = option.dataset.countryId;
    document.getElementById("editProductCountryLabel").textContent = option.dataset.countryName;
    renderCountryOptions();
    editCountryMenu.hidden = true;
    editCountryToggle.setAttribute("aria-expanded", "false");
    updateSaveState();
  });
  editCategoriesMenu.addEventListener("change", updateCategorySelection);
  categoryMenu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-category]");
    if (!option) return;
    selectedCategory = option.dataset.category === "__all__" ? "" : option.dataset.category;
    filterLabel.textContent = selectedCategory || "All categories";
    categoryMenu.hidden = true;
    filterButton.setAttribute("aria-expanded", "false");
    page = 1;
    render();
  });
  searchInput.addEventListener("input", () => { page = 1; render(); });
  countryFilter.addEventListener("change", () => { page = 1; render(); });
  tabs.forEach((tab) => tab.addEventListener("click", () => {
    activeType = tab.dataset.typeId;
    tabs.forEach((item) => {
      const selected = item === tab;
      item.classList.toggle("is-active", selected);
      item.setAttribute("aria-selected", String(selected));
    });
    selectedCategory = "";
    filterLabel.textContent = "All categories";
    page = 1;
    updateTypeCopy();
    renderCategoryOptions();
    render();
  }));
  previousButton.addEventListener("click", () => { if (page > 1) { page -= 1; render(); } });
  nextButton.addEventListener("click", () => {
    if (page < Math.ceil(filteredProducts().length / PAGE_SIZE)) { page += 1; render(); }
  });

  body.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    event.preventDefault();
    const row = action.closest("[data-product-id]");
    const product = products.find((item) => String(item.product_id) === row?.dataset.productId);
    if (!product) return;
    if (action.dataset.action === "visibility") {
      setProductVisibility(product, action);
      return;
    }
    if (action.dataset.action === "edit") openEditDialog(product);
    if (action.dataset.action === "delete") openDeleteDialog(product);
  });

  editForm.addEventListener("input", updateSaveState);
  editForm.addEventListener("change", updateSaveState);
  editForm.addEventListener("submit", saveProduct);
  document.querySelectorAll("[data-close-edit]").forEach((button) => button.addEventListener("click", () => editDialog.close()));
  document.querySelectorAll("[data-close-delete]").forEach((button) => button.addEventListener("click", () => deleteDialog.close()));
  document.getElementById("confirmDeleteProduct").addEventListener("click", deleteProduct);
  [editDialog, deleteDialog].forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));

  loadProducts();

  async function loadProducts() {
    try {
      const [productsResponse, optionsResponse] = await Promise.all([
        fetch("/api/admin/products", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/admin/product-options", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const [productData, optionData] = await Promise.all([productsResponse.json(), optionsResponse.json()]);
      if (!productsResponse.ok) throw new Error(productData.error || "Unable to load products.");
      if (!optionsResponse.ok) throw new Error(optionData.error || "Unable to load country options.");
      products = Array.isArray(productData) ? productData : [];
      countries = Array.isArray(optionData.countries) ? optionData.countries : [];
      categories = Array.isArray(optionData.categories) ? optionData.categories : [];
      renderCountryOptions();
      renderEditCategoryOptions();
      updateTypeCopy();
      renderCategoryOptions();
      render();
    } catch (error) {
      body.innerHTML = `<tr><td colspan="8" class="products-loading">${escapeHtml(error.message)}</td></tr>`;
      subtitle.textContent = "Unable to load product reports";
    }
  }

  function currentTypeProducts() { return products.filter((product) => String(product.type_id) === activeType); }

  function toggleMenu(menu, button) {
    const willOpen = menu.hidden;
    closeAllMenus();
    menu.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
  }

  function closeAllMenus() {
    [categoryMenu, countryFilterMenu, editCountryMenu, editCategoriesMenu].forEach((menu) => { menu.hidden = true; });
    [filterButton, countryFilterToggle, editCountryToggle, editCategoriesToggle].forEach((button) => button.setAttribute("aria-expanded", "false"));
  }

  function renderCountryOptions() {
    countryFilterMenu.innerHTML = [
      countryOption("__all__", "All countries", !countryFilter.value),
      ...countries.map((country) => countryOption(country.country_id, country.country_name, String(country.country_id) === countryFilter.value)),
    ].join("");
    editCountryMenu.innerHTML = countries.map((country) => countryOption(country.country_id, country.country_name, String(country.country_id) === editCountry.value)).join("");
  }

  function countryOption(id, name, selected) {
    return `<button class="pr-select-option${selected ? " is-selected" : ""}" type="button" role="option" aria-selected="${selected}" data-country-id="${escapeHtml(id)}" data-country-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
  }

  function renderEditCategoryOptions() {
    editCategoriesMenu.innerHTML = categories.map((category) => `<label class="pr-multiselect-option"><input type="checkbox" value="${escapeHtml(category.category_id)}"><span>${escapeHtml(category.category_name)}</span></label>`).join("");
  }

  function updateCategorySelection() {
    const selected = [...editCategoriesMenu.querySelectorAll('input[type="checkbox"]:checked')];
    const selectedNames = selected.map((checkbox) => categories.find((category) => String(category.category_id) === checkbox.value)?.category_name).filter(Boolean);
    editCategoriesLabel.textContent = selectedNames.length === 0 ? "Select one or more categories" : selectedNames.length <= 2 ? selectedNames.join(", ") : `${selectedNames.length} categories selected`;
    updateSaveState();
  }

  function updateTypeCopy() {
    const noun = activeType === "2" ? "bundle" : "product";
    const plural = activeType === "2" ? "bundles" : "products";
    const count = currentTypeProducts().length;
    subtitle.textContent = `${count} ${count === 1 ? noun : plural} present`;
    document.getElementById("productsSectionTitle").textContent = activeType === "2" ? "Bundles" : "Products";
    document.getElementById("addProductLabel").textContent = activeType === "2" ? "Add new bundle" : "Add new product";
    searchInput.placeholder = activeType === "2" ? "Search bundles" : "Search products";
    searchInput.setAttribute("aria-label", activeType === "2" ? "Search bundles" : "Search products");
  }

  function renderCategoryOptions() {
    const categories = [...new Set(currentTypeProducts().flatMap((product) => product.categories || []))].sort((a, b) => a.localeCompare(b));
    if (selectedCategory && !categories.includes(selectedCategory)) selectedCategory = "";
    filterLabel.textContent = selectedCategory || "All categories";
    categoryMenu.innerHTML = [
      `<button class="pr-category-option${selectedCategory ? "" : " is-selected"}" type="button" role="option" data-category="__all__">All categories</button>`,
      ...categories.map((category) => `<button class="pr-category-option${selectedCategory === category ? " is-selected" : ""}" type="button" role="option" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`),
    ].join("");
  }

  function filteredProducts() {
    const query = searchInput.value.trim().toLowerCase();
    return currentTypeProducts().filter((product) => {
      const categories = product.categories || [];
      const searchable = [product.product_name, product.description, product.country, ...categories].join(" ").toLowerCase();
      const matchesCountry = !countryFilter.value || String(product.country_id) === countryFilter.value;
      return (!query || searchable.includes(query)) && (!selectedCategory || categories.includes(selectedCategory)) && matchesCountry;
    });
  }

  function render() {
    const filtered = filteredProducts();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    if (!visible.length) {
      const noun = activeType === "2" ? "bundles" : "products";
      body.innerHTML = `<tr><td colspan="8" class="products-loading pr-empty-state">No ${noun} found.</td></tr>`;
    } else {
      body.innerHTML = visible.map(rowHtml).join("");
      body.querySelectorAll("img.pr-product-image").forEach((image) => image.addEventListener("error", () => { image.outerHTML = imageFallback(); }, { once: true }));
    }
    pageIndicator.textContent = `${page} out of ${totalPages} pages`;
    previousButton.disabled = page <= 1;
    nextButton.disabled = page >= totalPages;
  }

  function rowHtml(product) {
    const categories = product.categories?.length
      ? `<div class="pr-category-list">${product.categories.map((category) => `<span class="pr-category-tag">${escapeHtml(category)}</span>`).join("")}</div>`
      : "—";
    const image = product.product_image
      ? `<img class="pr-product-image" src="${escapeHtml(imageSrc(product.product_image))}" alt="${escapeHtml(product.product_name || "Product")}">`
      : imageFallback();
    const country = product.country ? `<span class="pr-country-tag">${escapeHtml(product.country)}</span>` : "—";
    const isShown = product.status !== "Hidden";
    const visibilityLabel = isShown ? "Hide" : "Show";
    const visibilityIcon = isShown
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3 21 21M10.6 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10 10 0 0 0 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
    return `<tr data-product-id="${escapeHtml(product.product_id)}">
      <td><button class="pr-visibility-button${isShown ? " is-shown" : " is-hidden"}" type="button" data-action="visibility" aria-label="${visibilityLabel} ${escapeHtml(product.product_name)}" title="${visibilityLabel} product">${visibilityIcon}</button></td>
      <td>${image}</td>
      <td class="pr-product-name">${escapeHtml(product.product_name || "Unnamed item")}</td>
      <td class="pr-product-price">₱${Number(product.product_price || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td><div class="pr-description" tabindex="0" aria-label="Description for ${escapeHtml(product.product_name)}">${escapeHtml(product.description || "No description")}</div></td>
      <td>${categories}</td>
      <td>${country}</td>
      <td><div class="row-actions"><a href="#" class="action-edit" data-action="edit">Edit</a><a href="#" class="action-delete" data-action="delete">Delete</a></div></td>
    </tr>`;
  }

  async function setProductVisibility(product, button) {
    const status = product.status === "Hidden" ? "Shown" : "Hidden";
    button.disabled = true;
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(product.product_id)}/status`, {
        method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update product visibility.");
      product.status = result.status;
      render();
    } catch (error) {
      button.disabled = false;
      button.title = error.message;
      button.setAttribute("aria-label", error.message);
    }
  }

  function readEditValues() {
    const values = {
      country_id: editCountry.value,
      status: editStatus.value,
      product_name: document.getElementById("editProductName").value.trim(),
      product_price: document.getElementById("editProductPrice").value,
      product_image: document.getElementById("editProductImage").value.trim(),
      description: document.getElementById("editProductDescription").value,
      type_id: editForm.querySelector('input[name="type_id"]:checked')?.value || "",
      category_ids: [...editCategoriesMenu.querySelectorAll('input[type="checkbox"]:checked')].map((checkbox) => Number(checkbox.value)).sort((a, b) => a - b),
    };
    if (creatingProduct) values.initial_stock = Number(initialStockInput.value);
    return values;
  }

  function openEditDialog(product) {
    creatingProduct = false;
    editingProduct = product;
    document.querySelector(".pr-status-control").hidden = false;
    document.getElementById("editProductRating").hidden = false;
    currentStockDisplay.hidden = false;
    initialStockInput.hidden = true;
    initialStockInput.required = false;
    document.getElementById("editProductStockLabel").textContent = "Current stock";
    saveButton.textContent = "Save changes";
    document.getElementById("editProductKind").textContent = `${product.type_name || (String(product.type_id) === "2" ? "Bundle" : "Product")} details`;
    document.getElementById("editProductTitle").textContent = `Edit ${String(product.type_id) === "2" ? "bundle" : "product"}`;
    document.getElementById("editProductId").textContent = `#${product.product_id}`;
    document.getElementById("editProductStock").textContent = String(product.stock ?? 0);
    editStatus.value = product.status === "Hidden" ? "Hidden" : "Shown";
    statusToggle.setAttribute("aria-checked", String(editStatus.value === "Shown"));
    statusLabel.textContent = editStatus.value;
    const rating = Math.max(0, Math.min(5, Number(product.product_rating) || 0));
    document.getElementById("editProductRating").textContent = rating.toFixed(1);
    document.getElementById("editProductReviewCount").textContent = `${Number(product.review_count) || 0} ${(Number(product.review_count) || 0) === 1 ? "review" : "reviews"}`;
    editCountry.value = String(product.country_id ?? "");
    document.getElementById("editProductCountryLabel").textContent = countries.find((country) => String(country.country_id) === editCountry.value)?.country_name || "Choose a country";
    editCategoriesMenu.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = (product.category_ids || []).map(String).includes(checkbox.value)
        || (!product.category_ids?.length && (product.categories || []).includes(categories.find((category) => String(category.category_id) === checkbox.value)?.category_name));
    });
    updateCategorySelection();
    renderCountryOptions();
    document.getElementById("editProductName").value = product.product_name || "";
    document.getElementById("editProductPrice").value = product.product_price ?? 0;
    document.getElementById("editProductImage").value = product.product_image || "";
    document.getElementById("editProductDescription").value = product.description || "";
    editForm.querySelectorAll('input[name="type_id"]').forEach((radio) => { radio.checked = radio.value === String(product.type_id); });
    editMessage.textContent = "";
    initialEditValues = JSON.stringify(readEditValues());
    updateSaveState();
    editDialog.showModal();
  }

  function openAddDialog() {
    creatingProduct = true;
    editingProduct = null;
    closeAllMenus();
    const typeName = activeType === "2" ? "bundle" : "product";
    document.getElementById("editProductKind").textContent = "New listing";
    document.getElementById("editProductTitle").textContent = `Add new ${typeName}`;
    document.getElementById("editProductId").textContent = "Assigned on save (manual ID)";
    currentStockDisplay.hidden = true;
    initialStockInput.hidden = false;
    initialStockInput.required = true;
    initialStockInput.value = "0";
    document.getElementById("editProductStockLabel").textContent = "Initial stock";
    document.getElementById("editProductRating").hidden = true;
    document.getElementById("editProductReviewCount").textContent = "No ratings yet";
    document.querySelector(".pr-status-control").hidden = true;
    editStatus.value = "Shown";
    statusLabel.textContent = "Shown";
    statusToggle.setAttribute("aria-checked", "true");
    editCountry.value = "";
    document.getElementById("editProductCountryLabel").textContent = "Choose a country";
    renderCountryOptions();
    editCategoriesMenu.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => { checkbox.checked = false; });
    editCategoriesLabel.textContent = "Select one or more categories";
    document.getElementById("editProductName").value = "";
    document.getElementById("editProductPrice").value = "";
    document.getElementById("editProductImage").value = "";
    document.getElementById("editProductDescription").value = "";
    editForm.querySelectorAll('input[name="type_id"]').forEach((radio) => { radio.checked = radio.value === activeType; });
    editMessage.textContent = "";
    saveButton.textContent = `Add ${typeName}`;
    initialEditValues = JSON.stringify(readEditValues());
    updateSaveState();
    editDialog.showModal();
  }

  function updateSaveState() {
    const values = readEditValues();
    saveButton.disabled = !editForm.checkValidity() || !values.country_id || !values.category_ids.length || JSON.stringify(values) === initialEditValues;
  }

  async function saveProduct(event) {
    event.preventDefault();
    if ((!creatingProduct && !editingProduct) || saveButton.disabled) return;
    saveButton.disabled = true;
    editMessage.textContent = "Saving…";
    try {
      const values = readEditValues();
      const isCreating = creatingProduct;
      const endpoint = isCreating ? "/api/admin/products" : `/api/admin/products/${encodeURIComponent(editingProduct.product_id)}`;
      const response = await fetch(endpoint, {
        method: isCreating ? "POST" : "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || (isCreating ? "Unable to add this item." : "Unable to save changes."));
      const country = countries.find((item) => String(item.country_id) === values.country_id);
      const savedProduct = isCreating ? {
        product_id: Number(result.product_id),
        product_likes: 0,
        product_rating: 0,
        review_count: 0,
        stock: values.initial_stock,
        status: "Shown",
      } : editingProduct;
      Object.assign(savedProduct, {
        country_id: Number(values.country_id), country: country?.country_name || "",
        product_name: values.product_name, product_price: Number(values.product_price),
        product_image: values.product_image, description: values.description,
        status: isCreating ? "Shown" : values.status,
        type_id: Number(values.type_id), type_name: values.type_id === "2" ? "Bundle" : "Product",
        category_ids: values.category_ids,
        categories: values.category_ids.map((id) => categories.find((category) => Number(category.category_id) === id)?.category_name).filter(Boolean),
      });
      if (isCreating) {
        products.unshift(savedProduct);
        page = 1;
        activeType = String(savedProduct.type_id);
        tabs.forEach((tab) => {
          const selected = tab.dataset.typeId === activeType;
          tab.classList.toggle("is-active", selected);
          tab.setAttribute("aria-selected", String(selected));
        });
        selectedCategory = "";
        searchInput.value = "";
        countryFilter.value = "";
        document.getElementById("countryFilterLabel").textContent = "All countries";
        renderCountryOptions();
      }
      editDialog.close();
      creatingProduct = false;
      updateTypeCopy();
      renderCategoryOptions();
      render();
    } catch (error) {
      editMessage.textContent = error.message;
      updateSaveState();
    }
  }

  function openDeleteDialog(product) {
    deletingProduct = product;
    document.getElementById("deleteProductTitle").textContent = `Delete ${String(product.type_id) === "2" ? "bundle" : "product"}?`;
    document.getElementById("deleteProductMessage").textContent = `Mark “${product.product_name}” as Deleted? It will be removed from product and stock listings, and customers will no longer be able to order it. Existing order history will be preserved.`;
    deleteError.textContent = "";
    document.getElementById("confirmDeleteProduct").disabled = false;
    deleteDialog.showModal();
  }

  async function deleteProduct() {
    if (!deletingProduct) return;
    const confirmButton = document.getElementById("confirmDeleteProduct");
    confirmButton.disabled = true;
    deleteError.textContent = "Deleting…";
    try {
      const response = await fetch(`/api/admin/products/${encodeURIComponent(deletingProduct.product_id)}`, { method: "DELETE", credentials: "same-origin" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete this item.");
      products = products.filter((item) => String(item.product_id) !== String(deletingProduct.product_id));
      deletingProduct = null;
      deleteDialog.close();
      updateTypeCopy();
      renderCategoryOptions();
      render();
    } catch (error) {
      deleteError.textContent = error.message;
      confirmButton.disabled = false;
    }
  }

  function imageFallback() {
    return '<span class="pr-image-fallback" aria-label="No product image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 17 4.5-4 3.2 2.6 2.4-2 4 3.4"/></svg></span>';
  }
});
