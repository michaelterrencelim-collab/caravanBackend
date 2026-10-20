document.addEventListener("DOMContentLoaded", () => {
  const pageSize = 15;
  const salesBody = document.getElementById("salesBody");
  const searchInput = document.getElementById("productSearchInput");
  const filterButton = document.getElementById("categoryFilterBtn");
  const filterMenu = document.getElementById("categoryFilterMenu");
  const typeFilterButton = document.getElementById("typeFilterBtn");
  const typeFilterMenu = document.getElementById("typeFilterMenu");
  const exportButton = document.getElementById("exportBtn");
  const pageIndicator = document.getElementById("salesPageIndicator");
  const previousButton = document.getElementById("prevSalesPageBtn");
  const nextButton = document.getElementById("nextSalesPageBtn");
  const tableScroll = document.querySelector(".sales-table-scroll");
  const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
  const state = { products: [], category: "all", type: "all", search: "", page: 1, loading: true };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  function filteredProducts() {
    const query = state.search.trim().toLocaleLowerCase();
    return state.products.filter((product) => {
      const hasCategory = state.category === "all" || product.categories.some((category) => String(category.category_id) === state.category);
      const productType = String(product.type_name || "product").toLocaleLowerCase();
      const hasType = state.type === "all" || productType.includes(state.type);
      const searchable = [product.product_id, product.product_name, product.type_name, ...product.categories.map((category) => category.category_name)]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return hasCategory && hasType && (!query || searchable.includes(query));
    });
  }

  function render() {
    if (state.loading) {
      salesBody.innerHTML = '<tr><td colspan="6" class="sales-message">Loading product sales…</td></tr>';
      return;
    }

    const filtered = filteredProducts();
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.page = Math.min(state.page, pageCount);
    const start = (state.page - 1) * pageSize;
    const rows = filtered.slice(start, start + pageSize);

    if (!rows.length) {
      const message = state.products.length ? "No products match your search or filters." : "No products found.";
      salesBody.innerHTML = `<tr><td colspan="6" class="sales-message">${message}</td></tr>`;
    } else {
      salesBody.innerHTML = rows.map((product) => {
        const categoryTags = product.categories.length
          ? product.categories.map((category) => `<span class="sales-category-tag">${escapeHtml(category.category_name)}</span>`).join("")
          : '<span class="sales-no-category">Uncategorized</span>';
        const typeName = product.type_name || "Product";
        return `<tr>
          <td class="mono">#${escapeHtml(product.product_id)}</td>
          <td class="sales-product-name">${escapeHtml(product.product_name)}</td>
          <td><span class="sales-product-type">${escapeHtml(typeName)}</span></td>
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

  function updateTypeFilterMenu() {
    typeFilterMenu.replaceChildren();
    const choices = [
      { type: "all", label: "All Types" },
      { type: "product", label: "Product" },
      { type: "bundle", label: "Bundle" },
    ];
    for (const choice of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.type = choice.type;
      button.textContent = choice.label;
      button.classList.toggle("is-active", state.type === choice.type);
      button.addEventListener("click", () => {
        state.type = choice.type;
        state.page = 1;
        typeFilterButton.querySelector("span").textContent = choice.type === "all" ? "Type Filter" : `Type: ${choice.label}`;
        typeFilterMenu.querySelectorAll("button").forEach((option) => option.classList.toggle("is-active", option === button));
        typeFilterMenu.classList.remove("is-open");
        typeFilterButton.setAttribute("aria-expanded", "false");
        render();
      });
      typeFilterMenu.append(button);
    }
  }

  async function loadSales() {
    try {
      const response = await fetch("/api/admin/sales", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load sales report");
      state.products = Array.isArray(data.products) ? data.products : [];
      updateFilterMenu(Array.isArray(data.categories) ? data.categories : []);
      updateTypeFilterMenu();
    } catch (error) {
      salesBody.innerHTML = `<tr><td colspan="6" class="sales-message is-error">${escapeHtml(error.message)}. Please refresh to try again.</td></tr>`;
      pageIndicator.textContent = "Sales report unavailable";
      previousButton.disabled = true;
      nextButton.disabled = true;
      return;
    }
    state.loading = false;
    render();
  }

  function exportSpreadsheet() {
    const filtered = filteredProducts();
    const csvCell = (value) => {
      let text = String(value ?? "");
      if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = [
      ["Product ID", "Product Name", "Type", "Categories", "Units Sold", "Revenue"],
      ...filtered.map((product) => [
        product.product_id,
        product.product_name,
        product.type_name || "Product",
        product.categories.map((category) => category.category_name).join(", ") || "Uncategorized",
        product.units_sold,
        Number(product.revenue || 0).toFixed(2),
      ]),
    ];
    const file = new Blob(["\ufeff", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    const now = new Date();
    const dateStamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    link.download = `caravan-sales-report-${dateStamp}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  searchInput.addEventListener("input", () => {
    state.search = searchInput.value;
    state.page = 1;
    render();
  });
  filterButton.addEventListener("click", () => {
    const isOpen = filterMenu.classList.toggle("is-open");
    filterButton.setAttribute("aria-expanded", String(isOpen));
    typeFilterMenu.classList.remove("is-open");
    typeFilterButton.setAttribute("aria-expanded", "false");
  });
  typeFilterButton.addEventListener("click", () => {
    const isOpen = typeFilterMenu.classList.toggle("is-open");
    typeFilterButton.setAttribute("aria-expanded", String(isOpen));
    filterMenu.classList.remove("is-open");
    filterButton.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".filter-wrap")) {
      filterMenu.classList.remove("is-open");
      typeFilterMenu.classList.remove("is-open");
      filterButton.setAttribute("aria-expanded", "false");
      typeFilterButton.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      filterMenu.classList.remove("is-open");
      typeFilterMenu.classList.remove("is-open");
      filterButton.setAttribute("aria-expanded", "false");
      typeFilterButton.setAttribute("aria-expanded", "false");
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
  exportButton.addEventListener("click", exportSpreadsheet);

  loadSales();
});
