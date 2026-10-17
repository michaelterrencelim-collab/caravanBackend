document.addEventListener("DOMContentLoaded", () => {
  const pageSize = 15;
  const salesBody = document.getElementById("salesBody");
  const searchInput = document.getElementById("productSearchInput");
  const filterButton = document.getElementById("categoryFilterBtn");
  const filterMenu = document.getElementById("categoryFilterMenu");
  const exportButton = document.getElementById("exportBtn");
  const pageIndicator = document.getElementById("salesPageIndicator");
  const previousButton = document.getElementById("prevSalesPageBtn");
  const nextButton = document.getElementById("nextSalesPageBtn");
  const tableScroll = document.querySelector(".sales-table-scroll");
  const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
  const state = { products: [], category: "all", search: "", page: 1, loading: true };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  function filteredProducts() {
    const query = state.search.trim().toLocaleLowerCase();
    return state.products.filter((product) => {
      const hasCategory = state.category === "all" || product.categories.some((category) => String(category.category_id) === state.category);
      const searchable = [product.product_id, product.product_name, product.type_name, ...product.categories.map((category) => category.category_name)]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return hasCategory && (!query || searchable.includes(query));
    });
  }

  function render() {
    if (state.loading) {
      salesBody.innerHTML = '<tr><td colspan="5" class="sales-message">Loading product sales…</td></tr>';
      return;
    }

    const filtered = filteredProducts();
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.page = Math.min(state.page, pageCount);
    const start = (state.page - 1) * pageSize;
    const rows = filtered.slice(start, start + pageSize);

    if (!rows.length) {
      const message = state.products.length ? "No products match your search and category filter." : "No products found.";
      salesBody.innerHTML = `<tr><td colspan="5" class="sales-message">${message}</td></tr>`;
    } else {
      salesBody.innerHTML = rows.map((product) => {
        const categoryTags = product.categories.length
          ? product.categories.map((category) => `<span class="sales-category-tag">${escapeHtml(category.category_name)}</span>`).join("")
          : '<span class="sales-no-category">Uncategorized</span>';
        const typeLabel = product.type_name ? `<span class="sales-product-type">${escapeHtml(product.type_name)}</span>` : "";
        return `<tr>
          <td class="mono">#${escapeHtml(product.product_id)}</td>
          <td class="sales-product-name">${escapeHtml(product.product_name)}${typeLabel}</td>
          <td><div class="sales-category-list">${categoryTags}</div></td>
          <td class="mono">${escapeHtml(product.units_sold)}</td>
          <td class="mono">${escapeHtml(currency.format(product.revenue))}</td>
        </tr>`;
      }).join("");
    }

    pageIndicator.textContent = `Page ${state.page} of ${pageCount} · ${filtered.length} product${filtered.length === 1 ? "" : "s"}`;
    previousButton.disabled = state.page <= 1;
    nextButton.disabled = state.page >= pageCount;
  }

  function updateFilterMenu(categories) {
    filterMenu.replaceChildren();
    const choices = [{ category_id: "all", category_name: "All Categories" }, ...categories];
    for (const category of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.category = String(category.category_id);
      button.textContent = category.category_name;
      button.classList.toggle("is-active", state.category === String(category.category_id));
      button.addEventListener("click", () => {
        state.category = String(category.category_id);
        state.page = 1;
        filterButton.querySelector("span").textContent = category.category_id === "all" ? "Category Filter" : category.category_name;
        filterMenu.querySelectorAll("button").forEach((option) => option.classList.toggle("is-active", option === button));
        filterMenu.classList.remove("is-open");
        filterButton.setAttribute("aria-expanded", "false");
        render();
      });
      filterMenu.append(button);
    }
  }

  async function loadSales() {
    try {
      const response = await fetch("/api/admin/sales", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load sales report");
      state.products = Array.isArray(data.products) ? data.products : [];
      updateFilterMenu(Array.isArray(data.categories) ? data.categories : []);
    } catch (error) {
      salesBody.innerHTML = `<tr><td colspan="5" class="sales-message is-error">${escapeHtml(error.message)}. Please refresh to try again.</td></tr>`;
      pageIndicator.textContent = "Sales report unavailable";
      previousButton.disabled = true;
      nextButton.disabled = true;
      return;
    }
    state.loading = false;
    render();
  }

  function exportText() {
    const filtered = filteredProducts();
    const selectedCategory = state.category === "all"
      ? "All Categories"
      : filterMenu.querySelector(`[data-category="${CSS.escape(state.category)}"]`)?.textContent || "Selected category";
    const lines = [
      "CARAVAN SALES REPORT",
      `Exported: ${new Date().toLocaleString()}`,
      `Search: ${state.search.trim() || "None"}`,
      `Category: ${selectedCategory}`,
      "",
      "Product ID | Product Name | Type | Categories | Units Sold | Revenue",
      ...filtered.map((product) => [
        product.product_id,
        product.product_name,
        product.type_name || "Product",
        product.categories.map((category) => category.category_name).join(", ") || "Uncategorized",
        product.units_sold,
        currency.format(product.revenue),
      ].join(" | ")),
    ];
    const file = new Blob([lines.join("\r\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `caravan-sales-report-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  searchInput.addEventListener("input", () => {
    state.search = searchInput.value;
    state.page = 1;
    render();
  });
  filterButton.addEventListener("click", () => {
    const isOpen = filterMenu.classList.toggle("is-open");
    filterButton.setAttribute("aria-expanded", String(isOpen));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".filter-wrap")) {
      filterMenu.classList.remove("is-open");
      filterButton.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      filterMenu.classList.remove("is-open");
      filterButton.setAttribute("aria-expanded", "false");
    }
  });
  previousButton.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      render();
      tableScroll.scrollTop = 0;
    }
  });
  nextButton.addEventListener("click", () => {
    if (state.page < Math.ceil(filteredProducts().length / pageSize)) {
      state.page += 1;
      render();
      tableScroll.scrollTop = 0;
    }
  });
  exportButton.addEventListener("click", exportText);

  loadSales();
});
