document.addEventListener("DOMContentLoaded", () => {
  const API = "/api";
  const PAGE_SIZE = 10;

  const searchInput = document.getElementById("reportsSearch");
  const reportsBody = document.getElementById("reportsBody");
  const categoryFilterBtn = document.getElementById("categoryFilterBtn");
  const exportBtn = document.getElementById("exportBtn");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const pageIndicator = document.getElementById("pageIndicator");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const toolbar = categoryFilterBtn.parentElement;

  const baseSubtitle = pageSubtitle.textContent;
  const DEFAULT_SORT = "date-desc";

  const requestedOrderId = new URLSearchParams(window.location.search).get("orderId");
  const state = { search: "", orderId: /^\d+$/.test(requestedOrderId || "") ? requestedOrderId : "", status: "", from: "", to: "", sort: DEFAULT_SORT, page: 1, totalPages: 1 };
  if (state.orderId) searchInput.value = state.orderId;
  let statuses = []; 
  let requestCounter = 0; 

  // Same icons as your HTML rows
  const RETURN_ICON =
    '<svg viewBox="0 0 24 24" fill="none"><path d="M8 8H16.5A3.5 3.5 0 0 1 20 11.5v0A3.5 3.5 0 0 1 16.5 15H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="m10 4-4 4 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const REFUND_ICON =
    '<svg viewBox="0 0 24 24" fill="none"><rect x="6" y="7" width="12" height="13" rx="1.2" stroke="currentColor" stroke-width="1.6"/><path d="M4 7h16M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  // ---------- Helpers ----------
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function peso(value) {
    return `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function statusClass(name) {
    const s = String(name || "").toLowerCase();
    if (/(deliver|complet)/.test(s)) return "status-completed";
    if (/(fail|cancel|return|refund)/.test(s)) return "status-failed";
    return "status-processing";
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
    document.querySelectorAll(".or-toast").forEach((t) => t.remove());
    const node = document.createElement("div");
    node.className = `or-toast${isError ? " is-error" : ""}`;
    node.textContent = message;
    document.body.appendChild(node);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 4000);
  }

  function filterQuery(extra = {}) {
    const params = new URLSearchParams(extra);
    if (state.search) params.set("search", state.search);
    if (state.orderId) params.set("orderId", state.orderId);
    if (state.status) params.set("status", state.status);
    if (state.from) params.set("from", state.from);
    if (state.to) params.set("to", state.to);
    params.set("sort", state.sort);
    return params;
  }

  // ---------- Rendering ----------
  function messageRow(text) {
    reportsBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">${esc(text)}</td></tr>`;
  }

  function rowHtml(order) {
    const current = String(order.Order_status || "").toLowerCase();
    const returnDisabled = current === "returned" || current === "refunded";
    const refundDisabled = current === "refunded";

    const items = order.items.length
      ? order.items
          .map(
            (i) =>
              `<span>${esc(i.Quantity)}x ${esc(i.Prod_name)}${i.Product_size ? ` (${esc(i.Product_size)})` : ""}</span>`
          )
          .join("")
      : "<span>No products</span>";

    const customerTip = [order.Customer_name, order.Customer_email].filter(Boolean).join(" · ");
    const options = statuses.length
      ? statuses
          .map(
            (s) =>
              `<option value="${esc(s.Status_id)}" ${Number(s.Status_id) === Number(order.Status_id) ? "selected" : ""}>${esc(s.Order_status)}</option>`
          )
          .join("")
      : `<option value="${esc(order.Status_id)}" selected>${esc(order.Order_status)}</option>`;

    return `
      <tr data-id="${esc(order.Order_id)}" data-status-id="${esc(order.Status_id)}" data-status="${esc(order.Order_status)}">
        <td class="mono strong">#${esc(order.Order_id)}</td>
        <td class="mono" title="${esc(customerTip)}">${order.Customer_id != null ? `#${esc(order.Customer_id)}` : "-"}</td>
        <td class="items-list">${items}</td>
        <td class="mono">${peso(order.Total_cost)}</td>
        <td>
          <select class="status status-select ${statusClass(order.Order_status)}" aria-label="Status of order ${esc(order.Order_id)}" ${statuses.length ? "" : "disabled"}>${options}</select>
        </td>
        <td>
          <div class="row-actions">
            <a href="#" class="action-edit action-return ${returnDisabled ? "is-disabled" : ""}">${RETURN_ICON}Return</a>
            <a href="#" class="action-delete action-refund ${refundDisabled ? "is-disabled" : ""}">${REFUND_ICON}Refund</a>
          </div>
        </td>
      </tr>`;
  }

  function renderOrders(orders) {
    if (!orders.length) {
      messageRow("No orders found.");
      return;
    }
    reportsBody.innerHTML = orders.map(rowHtml).join("");
  }

  function updatePager() {
    pageIndicator.textContent = `${state.page} out of ${state.totalPages} pages`;
    prevPageBtn.disabled = state.page <= 1;
    nextPageBtn.disabled = state.page >= state.totalPages;
    prevPageBtn.style.opacity = prevPageBtn.disabled ? "0.35" : "";
    nextPageBtn.style.opacity = nextPageBtn.disabled ? "0.35" : "";
  }

  // ---------- Loading ----------
  async function loadOrders() {
    const requestId = ++requestCounter;
    messageRow("Loading orders...");

    try {
      const data = await api(`/fetchOrders?${filterQuery({ page: state.page, limit: PAGE_SIZE })}`);
      if (requestId !== requestCounter) return; // a newer request replaced this one
      console.log("ORDERS RESPONSE:", data);

      state.totalPages = data.totalPages;
      pageSubtitle.textContent = `${baseSubtitle} · ${data.total} ${data.total === 1 ? "order" : "orders"}`;

      if (state.page > data.totalPages) {
        state.page = data.totalPages;
        return loadOrders();
      }

      renderOrders(data.orders);
      updatePager();
    } catch (error) {
      if (requestId !== requestCounter) return;
      console.error("Error loading orders:", error);
      pageSubtitle.textContent = baseSubtitle;
      messageRow(
        error.status === 401 || error.status === 403
          ? `You are not signed in as an admin (${error.status}).`
          : `Failed to load orders: ${error.message}`
      );
      state.totalPages = 1;
      updatePager();
    }
  }

  function reloadFromFirstPage() {
    state.page = 1;
    loadOrders();
  }

  async function loadStatuses() {
    try {
      statuses = await api("/fetchOrderStatuses");
      console.log("STATUSES RESPONSE:", statuses);
      fillStatusFilter();
    } catch (error) {
      console.error("Error loading order statuses:", error);
    }
  }

  // ---------- Category Filter panel (status, dates, sort) ----------
  const panel = document.createElement("div");
  panel.className = "or-popover";
  panel.hidden = true;
  panel.innerHTML = `
    <label>Status
      <select id="orStatusFilter"><option value="">All</option></select>
    </label>
    <label>From <input type="date" id="orFrom"></label>
    <label>To <input type="date" id="orTo"></label>
    <label>Sort
      <select id="orSort">
        <option value="date-desc">Latest first</option>
        <option value="date-asc">Oldest first</option>
        <option value="total-desc">Highest total</option>
        <option value="total-asc">Lowest total</option>
        <option value="id-desc">Order ID (high to low)</option>
        <option value="id-asc">Order ID (low to high)</option>
      </select>
    </label>
    <button type="button" class="btn or-clear">Clear filters</button>`;
  toolbar.appendChild(panel);

  const statusFilter = panel.querySelector("#orStatusFilter");
  const fromInput = panel.querySelector("#orFrom");
  const toInput = panel.querySelector("#orTo");
  const sortSelect = panel.querySelector("#orSort");

  function fillStatusFilter() {
    statusFilter.innerHTML =
      `<option value="">All</option>` +
      statuses.map((s) => `<option value="${esc(s.Status_id)}">${esc(s.Order_status)}</option>`).join("");
    statusFilter.value = state.status;
  }

  function updateFilterButton() {
    const active = [state.status, state.from, state.to].filter(Boolean).length + (state.sort !== DEFAULT_SORT ? 1 : 0);
    const label = categoryFilterBtn.querySelector("span");
    if (label) label.textContent = active ? `Category Filter (${active})` : "Category Filter";
  }

  function setPanel(open) {
    panel.hidden = !open;
    categoryFilterBtn.setAttribute("aria-expanded", String(open));
  }

  categoryFilterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setPanel(panel.hidden);
  });
  panel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => setPanel(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setPanel(false);
  });

  function applyPanelFilters() {
    state.status = statusFilter.value;
    state.from = fromInput.value;
    state.to = toInput.value;
    state.sort = sortSelect.value;
    updateFilterButton();
    reloadFromFirstPage();
  }

  [statusFilter, fromInput, toInput, sortSelect].forEach((el) => el.addEventListener("change", applyPanelFilters));

  panel.querySelector(".or-clear").addEventListener("click", () => {
    statusFilter.value = "";
    fromInput.value = "";
    toInput.value = "";
    sortSelect.value = DEFAULT_SORT;
    state.orderId = "";
    applyPanelFilters();
  });

  // ---------- Confirm dialog (status change / return / refund) ----------
  function openConfirm({ title, subtitle, submitLabel, withReason, onSubmit, onCancel }) {
    const overlay = document.createElement("div");
    overlay.className = "or-overlay";
    overlay.innerHTML = `
      <form class="or-modal" novalidate>
        <h2>${esc(title)}</h2>
        <p class="or-sub">${esc(subtitle)}</p>
        ${withReason ? '<label>Reason (optional)<textarea rows="3" id="or-reason" placeholder="Saved in the audit trail"></textarea></label>' : ""}
        <p class="or-error" role="alert"></p>
        <div class="or-buttons">
          <button type="button" class="btn or-cancel">Cancel</button>
          <button type="submit" class="btn btn-primary or-submit">${esc(submitLabel)}</button>
        </div>
      </form>`;
    document.body.appendChild(overlay);

    const errorBox = overlay.querySelector(".or-error");
    const submitBtn = overlay.querySelector(".or-submit");
    const cancel = () => {
      overlay.remove();
      if (onCancel) onCancel();
    };

    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) cancel();
    });
    overlay.querySelector(".or-cancel").addEventListener("click", cancel);
    overlay.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.textContent = "";
      submitBtn.disabled = true;
      try {
        const reasonBox = overlay.querySelector("#or-reason");
        await onSubmit(reasonBox ? reasonBox.value.trim() : "");
        overlay.remove();
      } catch (error) {
        errorBox.textContent = error.message || "Something went wrong.";
        submitBtn.disabled = false;
      }
    });

    const reasonBox = overlay.querySelector("#or-reason");
    if (reasonBox) reasonBox.focus();
  }

  // ---------- Row actions ----------
  function changeStatus(select) {
    const row = select.closest("tr");
    const orderId = Number(row.dataset.id);
    const oldStatusId = row.dataset.statusId;
    const oldName = row.dataset.status;
    const newName = select.options[select.selectedIndex].text;
    const revert = () => {
      select.value = oldStatusId;
    };

    openConfirm({
      title: `Change status of Order #${orderId}`,
      subtitle: `From ${oldName} to ${newName}.`,
      submitLabel: "Change status",
      withReason: false,
      onCancel: revert,
      onSubmit: async () => {
        try {
          await api("/updateOrderStatus", {
            method: "POST",
            body: { order_id: orderId, status_id: Number(select.value) },
          });
        } catch (error) {
          revert();
          throw error;
        }
        toast(`Order #${orderId} is now ${newName}.`);
        loadOrders();
      },
    });
  }

  function returnOrder(row) {
    const orderId = Number(row.dataset.id);
    openConfirm({
      title: `Return Order #${orderId}`,
      subtitle: "This sets the order status to Returned. Use Log a return on the Stocks page to put units back into stock.",
      submitLabel: "Mark as returned",
      withReason: true,
      onSubmit: async (reason) => {
        await api("/returnOrder", { method: "POST", body: { order_id: orderId, reason } });
        toast(`Order #${orderId} marked as Returned.`);
        loadOrders();
      },
    });
  }

  function refundOrder(row) {
    const orderId = Number(row.dataset.id);
    openConfirm({
      title: `Refund Order #${orderId}`,
      subtitle: "This sets the order status to Refunded. It does not send money back, so process the payment with your payment provider.",
      submitLabel: "Mark as refunded",
      withReason: true,
      onSubmit: async (reason) => {
        await api("/refundOrder", { method: "POST", body: { order_id: orderId, reason } });
        toast(`Order #${orderId} marked as Refunded.`);
        loadOrders();
      },
    });
  }

  reportsBody.addEventListener("click", (e) => {
    const link = e.target.closest(".action-return, .action-refund");
    if (!link) return;
    e.preventDefault();
    if (link.classList.contains("is-disabled")) return;
    const row = link.closest("tr");
    if (!row || !row.dataset.id) return;

    if (link.classList.contains("action-return")) returnOrder(row);
    else refundOrder(row);
  });

  reportsBody.addEventListener("change", (e) => {
    const select = e.target.closest(".status-select");
    if (select) changeStatus(select);
  });

  // ---------- Search, paging, export ----------
  let searchTimer;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.orderId = "";
      state.search = searchInput.value.trim();
      reloadFromFirstPage();
    }, 300);
  });

  prevPageBtn.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      loadOrders();
    }
  });

  nextPageBtn.addEventListener("click", () => {
    if (state.page < state.totalPages) {
      state.page += 1;
      loadOrders();
    }
  });

  exportBtn.addEventListener("click", () => {
    window.location.href = `${API}/exportOrders?${filterQuery()}`;
  });

  // ---------- Start ----------
  updateFilterButton();
  loadStatuses().then(loadOrders);
});
