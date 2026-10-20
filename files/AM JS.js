document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".account-tab");
  const panels = { customer: document.getElementById("panelCustomer"), admin: document.getElementById("panelAdmin") };
  const summaryLine1 = document.getElementById("accountsSummaryLine1");
  const searchInput = document.getElementById("accountSearchInput");
  const inviteBtn = document.getElementById("inviteUserBtn");
  const customerBody = document.getElementById("customerBody");
  const adminBody = document.getElementById("adminBody");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const statusClass = (status) => String(status || "pending").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const titleCase = (status) => String(status || "Pending").charAt(0).toUpperCase() + String(status || "Pending").slice(1).toLowerCase();
  const summaryPrefix = { customer: "Number of customer accounts:", admin: "Number of Admin accounts:" };
  const detailsDialog = document.createElement("dialog");
  detailsDialog.className = "account-dialog account-details-dialog";
  detailsDialog.setAttribute("aria-labelledby", "accountDetailsTitle");
  detailsDialog.innerHTML = '<div class="account-dialog__header"><div><p class="account-dialog__eyebrow">Account details</p><h2 id="accountDetailsTitle">Customer</h2></div><button type="button" class="account-dialog__close" aria-label="Close details">&times;</button></div><div class="account-dialog__body" id="accountDetailsBody"></div>';
  document.body.append(detailsDialog);
  const detailsBody = detailsDialog.querySelector("#accountDetailsBody");
  const confirmDialog = document.createElement("dialog");
  confirmDialog.className = "account-dialog account-confirm-dialog";
  confirmDialog.setAttribute("aria-labelledby", "accountConfirmTitle");
  confirmDialog.innerHTML = '<div class="account-dialog__body"><span class="account-dialog__warning" aria-hidden="true">!</span><h2 id="accountConfirmTitle">Change account status?</h2><p id="accountConfirmMessage"></p><div class="account-dialog__actions"><button type="button" class="account-dialog__cancel">Cancel</button><button type="button" class="account-dialog__confirm">Confirm</button></div></div>';
  document.body.append(confirmDialog);
  let pendingStatusChange = null;
  detailsDialog.querySelector(".account-dialog__close").addEventListener("click", () => detailsDialog.close());
  detailsDialog.addEventListener("click", (event) => { if (event.target === detailsDialog) detailsDialog.close(); });
  confirmDialog.querySelector(".account-dialog__cancel").addEventListener("click", () => confirmDialog.close());
  confirmDialog.addEventListener("click", (event) => { if (event.target === confirmDialog) confirmDialog.close(); });
  confirmDialog.querySelector(".account-dialog__confirm").addEventListener("click", async () => {
    if (!pendingStatusChange) return;
    const { row, status } = pendingStatusChange;
    const confirmButton = confirmDialog.querySelector(".account-dialog__confirm");
    confirmButton.disabled = true;
    confirmButton.textContent = "Saving…";
    try {
      const response = await fetch(`/api/admin/accounts/${row.dataset.kind}/${encodeURIComponent(row.dataset.accountId)}/status`, {
        method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to update account status");
      updateStatus(row, data.status || status);
      confirmDialog.close();
    } catch (error) {
      confirmDialog.querySelector("#accountConfirmMessage").textContent = error.message;
    } finally {
      confirmButton.disabled = false;
      confirmButton.textContent = "Confirm";
    }
  });

  const searchPlaceholderByTab = { customer: "Search for a customer", admin: "Search for an Employee" };
  function setActiveTab(tabName) {
    tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
    Object.entries(panels).forEach(([name, panel]) => panel?.classList.toggle("is-active", name === tabName));
    if (summaryLine1) summaryLine1.textContent = `${summaryPrefix[tabName]} ${document.getElementById(tabName === "customer" ? "customerBody" : "adminBody")?.querySelectorAll("tr").length || 0}`;
    if (searchInput) {
      searchInput.placeholder = searchPlaceholderByTab[tabName];
      searchInput.value = "";
    }
    filterRows(tabName, "");
  }
  tabs.forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));

  function filterRows(tabName, query) {
    const body = document.getElementById(tabName === "customer" ? "customerBody" : "adminBody");
    const term = query.trim().toLowerCase();
    body?.querySelectorAll("tr").forEach((row) => { row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none"; });
  }
  if (searchInput) searchInput.addEventListener("input", (event) => {
    const activeTab = document.querySelector(".account-tab.is-active")?.dataset.tab || "customer";
    filterRows(activeTab, event.target.value);
  });

  if (inviteBtn) inviteBtn.addEventListener("click", () => recordManageAction("invite_opened"));
  loadAccounts();

  async function loadAccounts() {
    [customerBody, adminBody].forEach((body) => { if (body) body.innerHTML = '<tr><td colspan="5">Loading accounts…</td></tr>'; });
    try {
      const response = await fetch("/api/admin/accounts", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load accounts");
      renderCustomers(data.customers || []);
      renderAdmins(data.admins || []);
      setActiveTab(document.querySelector(".account-tab.is-active")?.dataset.tab || "customer");
    } catch (error) {
      [customerBody, adminBody].forEach((body) => { if (body) body.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}. Please refresh to try again.</td></tr>`; });
    }
  }

  function renderCustomers(customers) {
    if (!customerBody) return;
    customerBody.innerHTML = customers.length ? customers.map((account) => {
      const first = account.first_name || "";
      const last = account.last_name || "";
      const name = `${first} ${last}`.trim() || account.email || `Customer ${account.accountId}`;
      const status = titleCase(account.account_status);
      const initials = `${first[0] || ""}${last[0] || ""}`.toUpperCase() || "CU";
      const disabled = status.toLowerCase() === "disabled";
      return `<tr data-kind="customer" data-account-id="${escapeHtml(account.accountId)}" data-status="${statusClass(status)}"><td><div class="name-cell"><span class="avatar avatar-blue">${escapeHtml(initials)}</span><span class="name-text">${escapeHtml(name)}</span></div></td><td class="mono">#${escapeHtml(account.accountId)}</td><td class="mono">${escapeHtml(account.email)}</td><td><span class="pill status-${statusClass(status)}">${escapeHtml(status)}</span></td><td><div class="account-actions"><button type="button" class="action-view">View</button><button type="button" class="${disabled ? "action-activate" : "action-suspend"}">${disabled ? "Enable" : "Suspend"}</button></div></td></tr>`;
    }).join("") : '<tr><td colspan="5">No customer accounts found.</td></tr>';
  }

  function renderAdmins(admins) {
    if (!adminBody) return;
    adminBody.innerHTML = admins.length ? admins.map((account) => {
      const first = account.first_name || "";
      const last = account.last_name || "";
      const name = `${first} ${last}`.trim() || account.email || `Admin ${account.accountId}`;
      const status = titleCase(account.account_status);
      const role = Number(account.role_id) === 1 ? "Super Admin" : "Admin";
      const initials = `${first[0] || ""}${last[0] || ""}`.toUpperCase() || "AD";
      const roleClass = role === "Super Admin" ? "role-super-admin" : "role-admin";
      const disabled = ["suspended", "disabled"].includes(status.toLowerCase());
      const statusAction = status.toLowerCase() === "pending" ? "" : `<button type="button" class="${disabled ? "action-activate" : "action-suspend"}">${disabled ? "Enable" : "Suspend"}</button>`;
      return `<tr data-kind="admin" data-account-id="${escapeHtml(account.accountId)}" data-status="${statusClass(status)}"><td><div class="name-cell"><span class="avatar avatar-teal">${escapeHtml(initials)}</span><span class="name-text">${escapeHtml(name)}</span></div></td><td><span class="pill ${roleClass}">${escapeHtml(role)}</span></td><td class="mono">${escapeHtml(account.email)}</td><td><span class="pill status-${statusClass(status)}">${escapeHtml(status)}</span></td><td><div class="account-actions"><button type="button" class="action-view">View</button>${statusAction}</div></td></tr>`;
    }).join("") : '<tr><td colspan="5">No admin accounts found.</td></tr>';
  }

  document.querySelectorAll("#customerBody, #adminBody").forEach((body) => body.addEventListener("click", async (event) => {
    const action = event.target.closest("a, button");
    if (!action) return;
    event.preventDefault();
    const row = action.closest("tr");
    const name = row.querySelector(".name-text")?.textContent.trim() || "account";
    if (action.classList.contains("action-suspend") || action.classList.contains("action-activate")) {
      const nextStatus = action.classList.contains("action-suspend")
        ? (row.dataset.kind === "customer" ? "Disabled" : "Suspended")
        : (row.dataset.kind === "customer" ? "Enabled" : "Active");
      pendingStatusChange = { row, status: nextStatus };
      confirmDialog.querySelector("#accountConfirmTitle").textContent = `${nextStatus === "Disabled" || nextStatus === "Suspended" ? "Disable" : "Enable"} account?`;
      confirmDialog.querySelector("#accountConfirmMessage").textContent = `Are you sure you want to ${nextStatus === "Disabled" || nextStatus === "Suspended" ? "disable" : "enable"} ${name}? The account status will change to ${nextStatus}.`;
      confirmDialog.showModal();
    } else if (action.classList.contains("action-view")) {
      if (row.dataset.kind === "customer") loadCustomerDetails(row.dataset.accountId);
      else {
        const role = row.querySelector("td:nth-child(2)")?.textContent.trim() || "Admin";
        recordManageAction("admin_view", row.dataset.accountId);
        openDetails(name, "Admin account", [
          detailSection("Account information", [["Admin ID", `#${row.dataset.accountId}`], ["Name", name], ["Email", row.querySelector("td:nth-child(3)")?.textContent.trim()], ["Role", role], ["Status", row.dataset.status]]),
        ]);
      }
    } else if (action.classList.contains("action-message")) {
      console.log("Message account:", name);
    }
  }));

  function updateStatus(row, statusValue) {
    const status = titleCase(statusValue);
    const cssStatus = statusClass(status);
    row.dataset.status = cssStatus;
    const pill = row.querySelector("td .pill[class*='status-']");
    if (pill) { pill.textContent = status; pill.className = `pill status-${cssStatus}`; }
    const actions = row.querySelector(".account-actions");
    const existing = actions.querySelector(".action-suspend, .action-activate");
    if (existing) {
      const disabled = ["suspended", "disabled"].includes(status.toLowerCase());
      existing.className = disabled ? "action-activate" : "action-suspend";
      existing.textContent = disabled ? "Enable" : "Suspend";
    }
  }

  async function loadCustomerDetails(customerId) {
    detailsBody.innerHTML = '<p class="account-dialog__loading">Loading customer details…</p>';
    detailsDialog.querySelector("#accountDetailsTitle").textContent = `Customer #${customerId}`;
    detailsDialog.showModal();
    try {
      const response = await fetch(`/api/admin/accounts/customer/${encodeURIComponent(customerId)}/details`, { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load customer details");
      const customer = data.customer;
      const fullName = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || `Customer #${customer.accountId}`;
      detailsDialog.querySelector("#accountDetailsTitle").textContent = fullName;
      const addresses = (data.addresses || []).map((address) => [address.Street_address, address.City, address.Zip_code].filter(Boolean).join(", "));
      const vouchers = (data.vouchers || []).map((voucher) => `${voucher.Voucher_name} · ${voucher.Voucher_status}${voucher.discount != null ? ` · ${voucher.discount}% off` : ""}`);
      const orders = (data.orders || []).map((order) => {
        const items = order.items.map((item) => `${item.quantity} × ${item.product_name}${item.product_size ? ` (${item.product_size})` : ""}`).join(", ") || "No items";
        return `Order #${order.order_id} · ${titleCase(order.order_status)} · ${new Date(order.order_date).toLocaleDateString()} · ₱${Number(order.total_cost).toLocaleString("en-PH", { minimumFractionDigits: 2 })} — ${items}`;
      });
      openDetails(fullName, `Customer #${customer.accountId}`, [
        detailSection("Personal information", [["Email", customer.email], ["Phone", customer.phone], ["Birthdate", customer.birthdate], ["Status", customer.account_status]]),
        detailListSection("Addresses", addresses, "No addresses on file."),
        detailListSection("Vouchers", vouchers, "No vouchers assigned."),
        detailListSection("Orders", orders, "No orders found."),
      ]);
    } catch (error) {
      detailsBody.innerHTML = `<p class="account-dialog__error">${escapeHtml(error.message)}</p>`;
    }
  }

  function detailSection(title, fields) {
    return `<section class="account-detail-section"><h3>${escapeHtml(title)}</h3><dl>${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || "Not provided")}</dd></div>`).join("")}</dl></section>`;
  }

  function detailListSection(title, values, emptyMessage) {
    return `<section class="account-detail-section"><h3>${escapeHtml(title)} <span>${values.length}</span></h3>${values.length ? `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : `<p class="account-dialog__empty">${escapeHtml(emptyMessage)}</p>`}</section>`;
  }

  function openDetails(title, eyebrow, sections) {
    detailsDialog.querySelector("#accountDetailsTitle").textContent = title;
    detailsDialog.querySelector(".account-dialog__eyebrow").textContent = eyebrow;
    detailsBody.innerHTML = sections.join("");
    if (!detailsDialog.open) detailsDialog.showModal();
  }

  async function recordManageAction(action, accountId) {
    try {
      await fetch("/api/admin/accounts/actions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(accountId ? { accountId } : {}) }),
      });
    } catch (error) {
      console.error("Unable to record account action:", error);
    }
  }
});
