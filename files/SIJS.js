document.addEventListener("DOMContentLoaded", () => {
  const API = "/api";
  const PAGE_SIZE = 10;

  const filterPills = document.querySelectorAll(".filter-pill");
  const stockBody = document.getElementById("stockBody");
  const searchInput = document.getElementById("stockSearch");
  const exportBtn = document.getElementById("exportBtn");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageIndicator = document.getElementById("pageIndicator");
  const pageSubtitle = document.getElementById("pageSubtitle");

  const requestedProductId = new URLSearchParams(window.location.search).get("productId");
  const state = { filter: "all", search: requestedProductId || "", page: 1, totalPages: 1 };
  if (requestedProductId) searchInput.value = requestedProductId;
  let requestCounter = 0; // ignore out-of-date responses while typing/clicking fast

  const THUMB_SVG =
    '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="6" width="16" height="13" rx="1.6" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="11" r="1.6" fill="currentColor"/><path d="m5 17 4.5-4.5L13 16l2.5-2.5L19 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const ACTIONS_HTML = `
    <div class="row-actions">
      <a href="#" class="action-adjust"><svg viewBox="0 0 24 24" fill="none"><path d="M4 12h6M14 12h6M9 6h6M9 18h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="12" r="2" stroke="currentColor" stroke-width="1.6"/></svg>Adjust Stocks</a>
      <a href="#" class="action-edit"><svg viewBox="0 0 24 24" fill="none"><path d="M4 6h2l1.4 9.6A2 2 0 0 0 9.4 17H18a2 2 0 0 0 2-1.6L21 9H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="20" r="1.2" fill="currentColor"/><circle cx="17" cy="20" r="1.2" fill="currentColor"/></svg>Order Stocks</a>
      <a href="#" class="action-delete"><svg viewBox="0 0 24 24" fill="none"><path d="M8 8H16.5A3.5 3.5 0 0 1 20 11.5v0A3.5 3.5 0 0 1 16.5 15H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="m10 4-4 4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Log a return</a>
    </div>`;

  // ---------- Small styles for the forms + toast (uses AdminCSS variables) ----------
  const style = document.createElement("style");
  style.textContent = `
    .status-out { color: var(--red); }
    .product-thumb { overflow: hidden; }
    .product-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .si-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
    .si-modal { width: 440px; max-width: 100%; max-height: 90vh; overflow-y: auto; background: var(--card-bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; color: var(--text-primary); }
    .si-modal h2 { margin: 0 0 4px; font-size: 1.1rem; color: var(--gold); }
    .si-modal .si-sub { margin: 0 0 16px; font-size: .88rem; color: var(--text-secondary); }
    .si-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; font-size: .88rem; color: var(--text-secondary); }
    .si-field input, .si-field select, .si-field textarea { background: var(--panel-bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; color: var(--text-primary); font: inherit; }
    .si-field input:focus, .si-field select:focus, .si-field textarea:focus { outline: none; border-color: var(--gold); }
    .si-check { flex-direction: row; align-items: center; gap: 8px; }
    .si-error { min-height: 18px; margin: 0 0 10px; font-size: .86rem; color: var(--red); }
    .si-buttons { display: flex; justify-content: flex-end; gap: 10px; }
    .si-buttons .btn { padding: 10px 18px; }
    .si-toast { position: fixed; right: 24px; bottom: 24px; background: var(--card-bg); border: 1px solid var(--gold-dim); color: var(--text-primary); border-radius: 10px; padding: 12px 18px; font-size: .9rem; z-index: 1100; box-shadow: 0 6px 24px rgba(0,0,0,.4); }
    .si-toast.is-error { border-color: var(--red); color: var(--red); }
  `;
  document.head.appendChild(style);

  // ---------- Helpers ----------
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function imageSrc(path) {
    if (!path) return "";
    return /^(https?:|data:|\/)/i.test(path) ? path : `/${path}`;
  }
  async function api(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: options.method || "GET",
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const isJson = (res.headers.get("content-type") || "").includes("application/json");

    let data = null;
    if (isJson) {
      try {
        data = await res.json();
      } catch (_) {
        /* ignore */
      }
    }

    if (!res.ok) {
      const error = new Error((data && data.error) || `Request failed (${res.status})`);
      error.status = res.status;
      throw error;
    }
    if (res.redirected || !isJson) {
      const error = new Error("The server sent back a page instead of data. Are you signed in as an admin?");
      error.status = 401;
      throw error;
    }
    return data;
  }

  let toastTimer;
  function toast(message, isError = false) {
    document.querySelectorAll(".si-toast").forEach((t) => t.remove());
    const node = document.createElement("div");
    node.className = `si-toast${isError ? " is-error" : ""}`;
    node.textContent = message;
    document.body.appendChild(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 3500);
  }

  // ---------- Generic form modal ----------
  function openForm({ title, subtitle, fields, submitLabel, onSubmit }) {
    const overlay = document.createElement("div");
    overlay.className = "si-overlay";

    const fieldHtml = fields
      .map((f) => {
        const id = `si-f-${f.name}`;
        if (f.type === "checkbox") {
          return `<label class="si-field si-check"><input type="checkbox" id="${id}" ${f.value ? "checked" : ""}> ${esc(f.label)}</label>`;
        }
        let control;
        if (f.type === "select") {
          control = `<select id="${id}">${f.options
            .map((o) => `<option value="${esc(o.value)}" ${o.disabled ? "disabled" : ""}>${esc(o.label)}</option>`)
            .join("")}</select>`;
        } else if (f.type === "textarea") {
          control = `<textarea id="${id}" rows="3" placeholder="${esc(f.placeholder || "")}"></textarea>`;
        } else {
          control = `<input id="${id}" type="${f.type || "text"}" ${f.min !== undefined ? `min="${f.min}"` : ""} ${f.type === "number" ? 'step="1"' : ""} value="${esc(f.value ?? "")}" placeholder="${esc(f.placeholder || "")}">`;
        }
        return `<label class="si-field">${esc(f.label)}${control}</label>`;
      })
      .join("");

    overlay.innerHTML = `
      <form class="si-modal" novalidate>
        <h2>${esc(title)}</h2>
        <p class="si-sub">${esc(subtitle || "")}</p>
        ${fieldHtml}
        <p class="si-error" role="alert"></p>
        <div class="si-buttons">
          <button type="button" class="btn si-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary si-submit">${esc(submitLabel)}</button>
        </div>
      </form>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector("form");
    const errorBox = overlay.querySelector(".si-error");
    const submitBtn = overlay.querySelector(".si-submit");
    const close = () => overlay.remove();

    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelector(".si-cancel").addEventListener("click", close);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.textContent = "";

      const values = {};
      for (const f of fields) {
        const input = overlay.querySelector(`#si-f-${f.name}`);
        values[f.name] = f.type === "checkbox" ? input.checked : input.value.trim();
        if (f.required && values[f.name] === "") {
          errorBox.textContent = `${f.label} is required.`;
          return;
        }
      }

      submitBtn.disabled = true;
      try {
        await onSubmit(values);
        close();
      } catch (error) {
        errorBox.textContent = error.message || "Something went wrong.";
        submitBtn.disabled = false;
      }
    });

    const first = overlay.querySelector("input:not([type=checkbox]), select, textarea");
    if (first) first.focus();
  }

  // ---------- Rendering ----------
  function colspanMessage(text) {
    stockBody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-secondary)">${esc(text)}</td></tr>`;
  }

  function statusClass(status) {
    if (status === "in-stock") return "status-completed";
    if (status === "low-stock") return "status-processing";
    return "status-out";
  }

  function rowHtml(item) {
    const thumb = item.product_image
      ? `<img class="si-thumb" src="${esc(imageSrc(item.product_image))}" alt="${esc(item.product_name)}">`
      : THUMB_SVG;

    return `
      <tr data-status="${esc(item.status)}" data-id="${esc(item.product_id)}" data-name="${esc(item.product_name)}" data-stock="${esc(item.stock)}">
        <td><span class="product-thumb">${thumb}</span></td>
        <td>${esc(item.product_name)}</td>
        <td class="mono">#${esc(item.product_id)}</td>
        <td class="mono strong">${esc(item.stock)}</td>
        <td><span class="level-ring level-${esc(item.level)}"></span></td>
        <td><span class="status ${statusClass(item.status)}">${esc(item.status_label)}</span></td>
        <td>${ACTIONS_HTML}</td>
      </tr>`;
  }

  function renderRows(items) {
    if (!items.length) {
      colspanMessage("No products found.");
      return;
    }
    stockBody.innerHTML = items.map(rowHtml).join("");

    // If an image fails to load, fall back to the placeholder icon
    stockBody.querySelectorAll("img.si-thumb").forEach((img) => {
      img.addEventListener("error", () => {
        img.parentElement.innerHTML = THUMB_SVG;
      });
    });
  }

  function renderSubtitle(summary) {
    const total = summary.totalProducts;
    const need = summary.needRestock;
    const noun = need === 1 ? "product needs" : "products need";
    pageSubtitle.innerHTML =
      need > 0
        ? `${total} products: <span class="stock-warning">Warning ${need} ${noun} restocking</span>`
        : `${total} products: all well stocked`;
  }

  function updatePager() {
    pageIndicator.textContent = `${state.page} out of ${state.totalPages} pages`;
    prevPageBtn.disabled = state.page <= 1;
    nextPageBtn.disabled = state.page >= state.totalPages;
    prevPageBtn.style.opacity = prevPageBtn.disabled ? "0.35" : "";
    nextPageBtn.style.opacity = nextPageBtn.disabled ? "0.35" : "";
  }

  function filterQuery(extra = {}) {
    const params = new URLSearchParams(extra);
    if (state.filter !== "all") params.set("filter", state.filter);
    if (state.search) params.set("search", state.search);
    return params;
  }

  // ---------- Loading ----------
  async function loadStocks() {
    const requestId = ++requestCounter;
    colspanMessage("Loading stocks...");

    try {
      const data = await api(`/fetchStocks?${filterQuery({ page: state.page, limit: PAGE_SIZE })}`);
      if (requestId !== requestCounter) return; // a newer request replaced this one

      state.totalPages = data.totalPages;
      renderSubtitle(data.summary);

      if (state.page > data.totalPages) {
        state.page = data.totalPages;
        return loadStocks();
      }

      renderRows(data.items);
      updatePager();
    } catch (error) {
      if (requestId !== requestCounter) return;
      colspanMessage(
        error.status === 401 || error.status === 403
          ? `You are not signed in as an admin (${error.status}).`
          : `Failed to load stocks: ${error.message}`
      );
      state.totalPages = 1;
      updatePager();
    }
  }

  function reloadFromFirstPage() {
    state.page = 1;
    loadStocks();
  }

  // ---------- Row actions ----------
  function adjustStock(row) {
    const { id, name, stock } = row.dataset;
    openForm({
      title: "Adjust Stocks",
      subtitle: `${name} (#${id}). Current stock: ${stock}`,
      submitLabel: "Save",
      fields: [{ name: "amount", label: "New stock amount", type: "number", min: 0, value: stock, required: true }],
      onSubmit: async ({ amount }) => {
        const newAmount = Number(amount);
        if (!Number.isInteger(newAmount) || newAmount < 0) throw new Error("Enter a whole number of 0 or more.");
        if (newAmount === Number(stock)) throw new Error("That is already the current stock.");
        await api("/adjustStock", { method: "POST", body: { product_id: Number(id), new_amount: newAmount } });
        toast(`Stock for "${name}" updated to ${newAmount}.`);
        loadStocks();
      },
    });
  }

  function orderStock(row) {
    const { id, name } = row.dataset;
    openForm({
      title: "Order Stocks",
      subtitle: `${name} (#${id}). This records the request in the audit trail; use Adjust Stocks once the delivery arrives.`,
      submitLabel: "Record order",
      fields: [{ name: "quantity", label: "Quantity to order", type: "number", min: 1, required: true }],
      onSubmit: async ({ quantity }) => {
        const qty = Number(quantity);
        if (!Number.isInteger(qty) || qty < 1) throw new Error("Enter a whole number of 1 or more.");
        await api("/orderStock", { method: "POST", body: { product_id: Number(id), quantity: qty } });
        toast(`Stock order for "${name}" recorded.`);
      },
    });
  }

  async function logReturn(row) {
    const { id, name } = row.dataset;

    let items;
    try {
      items = await api(`/fetchReturnableItems?productId=${encodeURIComponent(id)}`);
    } catch (error) {
      toast(error.message, true);
      return;
    }
    if (!items.length) {
      toast(`No orders contain "${name}" yet, so there is nothing to return.`, true);
      return;
    }

    const options = items.map((i) => ({
      value: i.Order_item_id,
      disabled: Boolean(Number(i.Already_returned)),
      label: `Order #${i.Order_id} - qty ${i.Quantity}${Number(i.Already_returned) ? " (already returned)" : ""}`,
    }));
    if (options.every((o) => o.disabled)) {
      toast(`Every recent order of "${name}" already has a return logged.`, true);
      return;
    }
    options.sort((a, b) => Number(a.disabled) - Number(b.disabled));

    openForm({
      title: "Log a return",
      subtitle: `${name} (#${id})`,
      submitLabel: "Log return",
      fields: [
        { name: "order_item_id", label: "Order line", type: "select", options },
        { name: "reason", label: "Reason", type: "textarea", placeholder: "Why is it being returned?", required: true },
        { name: "quantity", label: "Quantity returned (optional)", type: "number", min: 1, placeholder: "Defaults to the full line" },
        { name: "restock", label: "Add the returned units back to stock", type: "checkbox", value: true },
      ],
      onSubmit: async (values) => {
        const body = {
          product_id: Number(id),
          order_item_id: Number(values.order_item_id),
          reason: values.reason,
          restock: values.restock,
        };
        if (values.quantity !== "") body.quantity = Number(values.quantity);
        await api("/logStockReturn", { method: "POST", body });
        toast(`Return logged for "${name}".`);
        loadStocks();
      },
    });
  }

  stockBody.addEventListener("click", (e) => {
    const link = e.target.closest(".row-actions a");
    if (!link) return;
    e.preventDefault();
    const row = link.closest("tr");
    if (!row || !row.dataset.id) return;

    if (link.classList.contains("action-adjust")) adjustStock(row);
    else if (link.classList.contains("action-edit")) orderStock(row);
    else if (link.classList.contains("action-delete")) logReturn(row);
  });

  // ---------- Filters, search, paging ----------
  filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      filterPills.forEach((p) => p.classList.remove("is-active"));
      pill.classList.add("is-active");
      state.filter = pill.dataset.filter;
      reloadFromFirstPage();
    });
  });

  let searchTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      reloadFromFirstPage();
    }, 300);
  });

  prevPageBtn.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      loadStocks();
    }
  });

  nextPageBtn.addEventListener("click", () => {
    if (state.page < state.totalPages) {
      state.page += 1;
      loadStocks();
    }
  });

  // ---------- Export (CSV of everything matching the current filter + search) ----------
  exportBtn.addEventListener("click", () => {
    window.location.href = `${API}/exportStocks?${filterQuery()}`;
  });

  // ---------- Start ----------
  loadStocks();
});
