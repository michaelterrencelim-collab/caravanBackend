document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("productSearchInput");
  const tableBody = document.getElementById("salesBody");
  const rows = Array.from(tableBody.querySelectorAll("tr"));

  const filterBtn = document.getElementById("categoryFilterBtn");
  const filterMenu = document.getElementById("categoryFilterMenu");
  const filterOptions = Array.from(filterMenu.querySelectorAll("button"));

  const addReportBtn = document.getElementById("addReportBtn");
  const exportBtn = document.getElementById("exportBtn");

  let activeCategory = "all";

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();

    rows.forEach((row) => {
      const name = row.children[1]?.textContent.trim().toLowerCase() || "";
      const category = row.dataset.category || "";

      const matchesSearch = !query || name.includes(query);
      const matchesCategory = activeCategory === "all" || category === activeCategory;

      row.style.display = matchesSearch && matchesCategory ? "" : "none";
    });
  }

  searchInput.addEventListener("input", applyFilters);

  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = filterMenu.classList.toggle("is-open");
    filterBtn.setAttribute("aria-expanded", String(isOpen));
  });

  filterOptions.forEach((option) => {
    option.addEventListener("click", () => {
      activeCategory = option.dataset.category;
      filterOptions.forEach((opt) => opt.classList.toggle("is-active", opt === option));
      filterMenu.classList.remove("is-open");
      filterBtn.setAttribute("aria-expanded", "false");
      applyFilters();
    });
  });

  document.addEventListener("click", (e) => {
    if (!filterMenu.contains(e.target) && e.target !== filterBtn) {
      filterMenu.classList.remove("is-open");
      filterBtn.setAttribute("aria-expanded", "false");
    }
  });

  addReportBtn.addEventListener("click", () => {
  });

  exportBtn.addEventListener("click", () => {
  });
});
