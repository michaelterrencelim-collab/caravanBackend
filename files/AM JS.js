document.addEventListener("DOMContentLoaded", () => {
  const PAGE_SIZE = 15;
  const tabs = document.querySelectorAll(".account-tab");
  const panels = { customer: document.getElementById("panelCustomer"), admin: document.getElementById("panelAdmin") };
  const summaryLine1 = document.getElementById("accountsSummaryLine1");
  const searchInput = document.getElementById("accountSearchInput");
  const statusFilter = document.getElementById("accountStatusFilter");
  const inviteBtn = document.getElementById("inviteUserBtn");
  const customerBody = document.getElementById("customerBody");
  const adminBody = document.getElementById("adminBody");
  const accountData = { customer: [], admin: [] };
  const pageState = { customer: 1, admin: 1 };
  let currentAdminEmail = "";
  const pageControls = {
    customer: { label: document.getElementById("customerPageIndicator"), previous: document.getElementById("customerPrevPage"), next: document.getElementById("customerNextPage") },
    admin: { label: document.getElementById("adminPageIndicator"), previous: document.getElementById("adminPrevPage"), next: document.getElementById("adminNextPage") },
  };
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
  const voucherDialog = document.createElement("dialog");
  voucherDialog.className = "account-dialog account-voucher-dialog";
  voucherDialog.setAttribute("aria-labelledby", "voucherDialogTitle");
  voucherDialog.innerHTML = '<div class="account-dialog__header"><div><p class="account-dialog__eyebrow">Manage Accounts</p><h2 id="voucherDialogTitle">Give a voucher</h2></div><button type="button" class="account-dialog__close" aria-label="Close voucher selection">&times;</button></div><div class="account-dialog__body"><p class="voucher-picker-description" id="voucherPickerDescription"></p><div class="voucher-picker-list" id="voucherPickerList" role="radiogroup" aria-label="Available vouchers"></div><p class="voucher-picker-message" id="voucherPickerMessage" role="status" aria-live="polite"></p><div class="account-dialog__actions"><button type="button" class="account-dialog__cancel">Cancel</button><button type="button" class="account-dialog__confirm" id="giveVoucherConfirm" disabled>Give voucher</button></div></div>';
  document.body.append(voucherDialog);
  const inviteDialog = document.createElement("dialog");
  inviteDialog.className = "account-dialog account-invite-dialog";
  inviteDialog.setAttribute("aria-labelledby", "inviteDialogTitle");
  inviteDialog.innerHTML = '<div class="account-dialog__header"><div><p class="account-dialog__eyebrow">Manage Accounts</p><h2 id="inviteDialogTitle">Invite a customer as admin</h2></div><div class="invite-dialog__header-actions"><button type="button" class="invite-add-button" id="inviteAddButton" disabled>Add +</button><button type="button" class="account-dialog__close" id="closeInviteDialog" aria-label="Close invite selection">&times;</button></div></div><div class="account-dialog__body"><p class="voucher-picker-description">Select an enabled customer to invite. Only customer names are shown.</p><div class="invite-customer-list" id="inviteCustomerList" role="listbox" aria-label="Enabled customers"></div><p class="voucher-picker-message" id="invitePickerMessage" role="status" aria-live="polite"></p></div>';
  document.body.append(inviteDialog);
  const invitePasswordDialog = document.createElement("dialog");
  invitePasswordDialog.className = "account-dialog account-confirm-dialog invite-password-dialog";
  invitePasswordDialog.setAttribute("aria-labelledby", "invitePasswordTitle");
  invitePasswordDialog.innerHTML = '<div class="account-dialog__body"><span class="account-dialog__warning invite-security-icon" aria-hidden="true">+</span><h2 id="invitePasswordTitle">Confirm invitation</h2><p id="invitePasswordDescription"></p><label class="invite-password-label" for="inviteAdminPassword">Enter your admin password to send this invitation</label><input id="inviteAdminPassword" class="invite-password-input" type="password" autocomplete="current-password" required><p class="account-dialog__error invite-password-error" id="invitePasswordError" role="alert"></p><div class="account-dialog__actions"><button type="button" class="account-dialog__cancel" id="cancelInviteConfirmation">Cancel</button><button type="button" class="account-dialog__confirm" id="confirmInviteButton">Confirm</button></div></div>';
  document.body.append(invitePasswordDialog);
  const inviteAddButton = inviteDialog.querySelector("#inviteAddButton");
  const inviteCustomerList = inviteDialog.querySelector("#inviteCustomerList");
  const invitePickerMessage = inviteDialog.querySelector("#invitePickerMessage");
  const inviteAdminPassword = invitePasswordDialog.querySelector("#inviteAdminPassword");
  const invitePasswordError = invitePasswordDialog.querySelector("#invitePasswordError");
  const confirmInviteButton = invitePasswordDialog.querySelector("#confirmInviteButton");
  const voucherPickerList = voucherDialog.querySelector("#voucherPickerList");
  const voucherPickerMessage = voucherDialog.querySelector("#voucherPickerMessage");
  const giveVoucherConfirm = voucherDialog.querySelector("#giveVoucherConfirm");
  let selectedVoucherId = null;
  let voucherAssigned = false;
  let pendingStatusChange = null;
  let voucherTarget = null;
  let selectedInviteCustomer = null;
  let inviteRequestPending = false;
  detailsDialog.querySelector(".account-dialog__close").addEventListener("click", () => detailsDialog.close());
  detailsDialog.addEventListener("click", (event) => { if (event.target === detailsDialog) detailsDialog.close(); });
  confirmDialog.querySelector(".account-dialog__cancel").addEventListener("click", () => confirmDialog.close());
  confirmDialog.addEventListener("click", (event) => { if (event.target === confirmDialog) confirmDialog.close(); });
  voucherDialog.querySelector(".account-dialog__close").addEventListener("click", () => voucherDialog.close());
  voucherDialog.querySelector(".account-dialog__cancel").addEventListener("click", () => voucherDialog.close());
  voucherDialog.addEventListener("click", (event) => { if (event.target === voucherDialog) voucherDialog.close(); });
  inviteDialog.querySelector("#closeInviteDialog").addEventListener("click", () => inviteDialog.close());
  inviteDialog.addEventListener("click", (event) => { if (event.target === inviteDialog) inviteDialog.close(); });
  invitePasswordDialog.querySelector("#cancelInviteConfirmation").addEventListener("click", () => invitePasswordDialog.close());
  invitePasswordDialog.addEventListener("click", (event) => { if (event.target === invitePasswordDialog) invitePasswordDialog.close(); });
  inviteAddButton.addEventListener("click", () => {
    if (!selectedInviteCustomer || inviteRequestPending) return;
    invitePasswordDialog.querySelector("#invitePasswordDescription").textContent = `You are about to invite ${selectedInviteCustomer.name} to become an admin. They will need to accept by email.`;
    invitePasswordError.textContent = "";
    inviteAdminPassword.value = "";
    if (!invitePasswordDialog.open) invitePasswordDialog.showModal();
    inviteAdminPassword.focus();
  });
  inviteCustomerList.addEventListener("click", (event) => {
    const option = event.target.closest("[data-invite-customer-id]");
    if (!option) return;
    selectedInviteCustomer = { id: option.dataset.inviteCustomerId, name: option.textContent.trim() };
    inviteCustomerList.querySelectorAll("[data-invite-customer-id]").forEach((item) => {
      item.classList.toggle("is-selected", item === option);
      item.setAttribute("aria-selected", String(item === option));
    });
    inviteAddButton.disabled = false;
  });
  confirmInviteButton.addEventListener("click", sendAdminInvitation);
  invitePasswordDialog.querySelector("#inviteAdminPassword").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendAdminInvitation();
    }
  });
  voucherPickerList.addEventListener("change", (event) => {
    if (!event.target.matches('input[name="voucherChoice"]')) return;
    selectedVoucherId = Number(event.target.value);
    giveVoucherConfirm.disabled = false;
  });
  giveVoucherConfirm.addEventListener("click", assignSelectedVoucher);
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
    pageState[tabName] = 1;
    if (searchInput) {
      searchInput.placeholder = searchPlaceholderByTab[tabName];
      searchInput.value = "";
    }
    if (statusFilter) {
      const statuses = tabName === "customer"
        ? [["enabled", "Enabled"], ["disabled", "Disabled"]]
        : [["enabled", "Enabled"], ["suspended", "Suspended"]];
      statusFilter.innerHTML = '<option value="all">All statuses</option>' + statuses.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
      statusFilter.value = "all";
    }
    filterRows(tabName, "");
  }
  tabs.forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));

  function filterRows(tabName, query) {
    const term = query.trim().toLowerCase();
    const selectedStatus = statusFilter?.value || "all";
    const filtered = accountData[tabName].filter((account) => {
      const matchesSearch = JSON.stringify(account).toLowerCase().includes(term);
      const matchesStatus = selectedStatus === "all" || String(account.account_status || "").toLowerCase() === selectedStatus;
      return matchesSearch && matchesStatus;
    });
    const body = tabName === "customer" ? customerBody : adminBody;
    const controls = pageControls[tabName];
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    pageState[tabName] = Math.min(pageState[tabName], totalPages);
    const first = (pageState[tabName] - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(first, first + PAGE_SIZE);

    if (summaryLine1) summaryLine1.textContent = `${summaryPrefix[tabName]} ${accountData[tabName].length}`;
    if (tabName === "customer") {
      body.innerHTML = pageItems.length ? pageItems.map(customerRow).join("") : '<tr><td colspan="5">No customer accounts found.</td></tr>';
    } else {
      body.innerHTML = pageItems.length ? pageItems.map(adminRow).join("") : '<tr><td colspan="5">No admin accounts found.</td></tr>';
    }
    controls.label.textContent = `${pageState[tabName]} out of ${totalPages} pages`;
    controls.previous.disabled = pageState[tabName] <= 1;
    controls.next.disabled = pageState[tabName] >= totalPages;
  }
  if (searchInput) searchInput.addEventListener("input", (event) => {
    const activeTab = document.querySelector(".account-tab.is-active")?.dataset.tab || "customer";
    pageState[activeTab] = 1;
    filterRows(activeTab, event.target.value);
  });
  if (statusFilter) statusFilter.addEventListener("change", () => {
    const activeTab = document.querySelector(".account-tab.is-active")?.dataset.tab || "customer";
    pageState[activeTab] = 1;
    filterRows(activeTab, searchInput?.value || "");
  });

  Object.entries(pageControls).forEach(([tabName, controls]) => {
    controls.previous.addEventListener("click", () => {
      if (pageState[tabName] <= 1) return;
      pageState[tabName] -= 1;
      filterRows(tabName, searchInput?.value || "");
    });
    controls.next.addEventListener("click", () => {
      pageState[tabName] += 1;
      filterRows(tabName, searchInput?.value || "");
    });
  });

  if (inviteBtn) inviteBtn.addEventListener("click", openInvitePicker);
  loadAccounts();

  async function loadAccounts() {
    [customerBody, adminBody].forEach((body) => { if (body) body.innerHTML = '<tr><td colspan="5">Loading accounts…</td></tr>'; });
    try {
      const response = await fetch("/api/admin/accounts", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load accounts");
      currentAdminEmail = String(data.currentAdminEmail || "").trim().toLowerCase();
      renderCustomers(data.customers || []);
      renderAdmins(data.admins || []);
      setActiveTab(document.querySelector(".account-tab.is-active")?.dataset.tab || "customer");
    } catch (error) {
      [customerBody, adminBody].forEach((body) => { if (body) body.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}. Please refresh to try again.</td></tr>`; });
    }
  }

  function renderCustomers(customers) {
    accountData.customer = customers;
    filterRows("customer", searchInput?.value || "");
  }

  function renderAdmins(admins) {
    accountData.admin = admins;
    filterRows("admin", searchInput?.value || "");
  }

  function customerRow(account) {
    const first = account.first_name || "";
    const last = account.last_name || "";
    const name = `${first} ${last}`.trim() || account.email || `Customer ${account.accountId}`;
    const status = titleCase(account.account_status);
    const initials = `${first[0] || ""}${last[0] || ""}`.toUpperCase() || "CU";
    const disabled = status.toLowerCase() === "disabled";
    return `<tr data-kind="customer" data-account-id="${escapeHtml(account.accountId)}" data-status="${statusClass(status)}"><td><div class="name-cell"><span class="avatar avatar-blue">${escapeHtml(initials)}</span><span class="name-text">${escapeHtml(name)}</span></div></td><td class="mono">#${escapeHtml(account.accountId)}</td><td class="mono">${escapeHtml(account.email)}</td><td><span class="pill status-${statusClass(status)}">${escapeHtml(status)}</span></td><td><div class="account-actions"><button type="button" class="action-view">View</button><button type="button" class="action-give-voucher">Give Voucher</button><button type="button" class="${disabled ? "action-activate" : "action-suspend"}">${disabled ? "Enable" : "Suspend"}</button></div></td></tr>`;
  }

  function adminRow(account) {
    const first = account.first_name || "";
    const last = account.last_name || "";
    const name = `${first} ${last}`.trim() || account.email || `Admin ${account.accountId}`;
    const status = titleCase(account.account_status);
    const isSuperAdmin = Number(account.role_id) === 1;
    const role = isSuperAdmin ? "Super Admin" : "Admin";
    const initials = `${first[0] || ""}${last[0] || ""}`.toUpperCase() || "AD";
    const roleClass = role === "Super Admin" ? "role-super-admin" : "role-admin";
    const disabled = ["suspended", "disabled"].includes(status.toLowerCase());
    const isCurrentAdmin = String(account.email || "").trim().toLowerCase() === currentAdminEmail;
    const statusAction = status.toLowerCase() === "pending" || (isSuperAdmin && !disabled)
      ? ""
      : isCurrentAdmin && !disabled
        ? '<button type="button" class="action-suspend" disabled aria-disabled="true" title="You cannot suspend your own admin account">Suspend</button>'
        : `<button type="button" class="${disabled ? "action-activate" : "action-suspend"}">${disabled ? "Enable" : "Suspend"}</button>`;
    return `<tr data-kind="admin" data-account-id="${escapeHtml(account.accountId)}" data-status="${statusClass(status)}"><td><div class="name-cell"><span class="avatar avatar-teal">${escapeHtml(initials)}</span><span class="name-text">${escapeHtml(name)}</span></div></td><td><span class="pill ${roleClass}">${escapeHtml(role)}</span></td><td class="mono">${escapeHtml(account.email)}</td><td><span class="pill status-${statusClass(status)}">${escapeHtml(status)}</span></td><td><div class="account-actions"><button type="button" class="action-view">View</button>${statusAction}</div></td></tr>`;
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
        : "Enabled";
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
    } else if (action.classList.contains("action-give-voucher")) {
      openVoucherPicker(row.dataset.accountId, name);
    } else if (action.classList.contains("action-message")) {
    }
  }));

  function updateStatus(row, statusValue) {
    const status = titleCase(statusValue);
    const cssStatus = statusClass(status);
    row.dataset.status = cssStatus;
    const account = accountData[row.dataset.kind].find((item) => String(item.accountId) === String(row.dataset.accountId));
    if (account) account.account_status = status;
    const pill = row.querySelector("td .pill[class*='status-']");
    if (pill) { pill.textContent = status; pill.className = `pill status-${cssStatus}`; }
    const actions = row.querySelector(".account-actions");
    const existing = actions.querySelector(".action-suspend, .action-activate");
    if (existing) {
      const disabled = ["suspended", "disabled"].includes(status.toLowerCase());
      existing.className = disabled ? "action-activate" : "action-suspend";
      existing.textContent = disabled ? "Enable" : "Suspend";
    }
    filterRows(row.dataset.kind, searchInput?.value || "");
  }

  async function openVoucherPicker(customerId, customerName) {
    voucherTarget = { customerId, customerName };
    selectedVoucherId = null;
    voucherAssigned = false;
    voucherDialog.querySelector("#voucherDialogTitle").textContent = "Give a voucher";
    voucherDialog.querySelector("#voucherPickerDescription").textContent = `Select an available voucher to give to ${customerName}.`;
    voucherPickerMessage.textContent = "Loading available vouchers…";
    voucherPickerList.innerHTML = "";
    giveVoucherConfirm.disabled = true;
    giveVoucherConfirm.textContent = "Give voucher";
    voucherDialog.showModal();
    try {
      const response = await fetch(`/api/admin/accounts/customer/${encodeURIComponent(customerId)}/vouchers/available`, { credentials: "same-origin" });
      const vouchers = await response.json();
      if (!response.ok) throw new Error(vouchers.error || "Unable to load available vouchers");
      if (!vouchers.length) {
        voucherPickerMessage.textContent = "No unassigned vouchers are available for this customer.";
        return;
      }
      voucherPickerMessage.textContent = "Choose one voucher.";
      voucherPickerList.innerHTML = vouchers.map((voucher) => `
        <label class="voucher-option">
          <input type="radio" name="voucherChoice" value="${escapeHtml(voucher.Voucher_id)}">
          <span class="voucher-option__copy">
            <strong>${escapeHtml(voucher.Voucher_name || `Voucher #${voucher.Voucher_id}`)}</strong>
            <span>${escapeHtml(voucher.Voucher_desc || "No description provided")}</span>
          </span>
          <span class="voucher-option__discount">${escapeHtml(voucher.discount ?? 0)}% off</span>
        </label>
      `).join("");
    } catch (error) {
      voucherPickerMessage.textContent = error.message;
    }
  }

  async function openInvitePicker() {
    selectedInviteCustomer = null;
    inviteAddButton.disabled = true;
    invitePickerMessage.textContent = "Loading enabled customers…";
    inviteCustomerList.replaceChildren();
    if (!inviteDialog.open) inviteDialog.showModal();
    try {
      const response = await fetch("/api/admin/accounts/invite-candidates", { credentials: "same-origin" });
      const customers = await response.json();
      if (!response.ok) throw new Error(customers.error || "Unable to load enabled customers");
      if (!customers.length) {
        invitePickerMessage.textContent = "There are no enabled customers available to invite.";
        return;
      }
      invitePickerMessage.textContent = "Select a customer, then choose Add +.";
      inviteCustomerList.innerHTML = customers.map((customer) => {
        const name = `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || `Customer #${customer.accountId}`;
        return `<button class="invite-customer-option" type="button" role="option" aria-selected="false" data-invite-customer-id="${escapeHtml(customer.accountId)}">${escapeHtml(name)}</button>`;
      }).join("");
    } catch (error) {
      invitePickerMessage.textContent = error.message;
    }
  }

  async function sendAdminInvitation() {
    if (inviteRequestPending || !selectedInviteCustomer) return;
    const password = inviteAdminPassword.value;
    if (!password) {
      invitePasswordError.textContent = "Enter your admin password to continue.";
      inviteAdminPassword.focus();
      return;
    }

    inviteRequestPending = true;
    confirmInviteButton.disabled = true;
    confirmInviteButton.textContent = "Sending…";
    invitePasswordError.textContent = "";
    try {
      const response = await fetch("/api/admin/accounts/invitations", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: selectedInviteCustomer.id, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to send invitation");
      invitePasswordDialog.close();
      invitePickerMessage.textContent = `Invitation sent to ${selectedInviteCustomer.name}. It will be added to Admin only if they accept.`;
      inviteCustomerList.querySelectorAll("[data-invite-customer-id]").forEach((item) => {
        if (item.dataset.inviteCustomerId === String(selectedInviteCustomer.id)) item.remove();
      });
      selectedInviteCustomer = null;
      inviteAddButton.disabled = true;
    } catch (error) {
      invitePasswordError.textContent = error.message;
    } finally {
      inviteRequestPending = false;
      confirmInviteButton.disabled = false;
      confirmInviteButton.textContent = "Confirm";
    }
  }

  async function assignSelectedVoucher() {
    if (voucherAssigned) {
      voucherDialog.close();
      return;
    }
    if (!voucherTarget || !selectedVoucherId) return;
    giveVoucherConfirm.disabled = true;
    giveVoucherConfirm.textContent = "Giving…";
    voucherPickerMessage.textContent = "Assigning voucher…";
    try {
      const response = await fetch(`/api/admin/accounts/customer/${encodeURIComponent(voucherTarget.customerId)}/vouchers`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherId: selectedVoucherId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to assign voucher");
      voucherAssigned = true;
      voucherPickerMessage.textContent = `${data.voucherName} was given to ${voucherTarget.customerName} and added to the audit trail.`;
      giveVoucherConfirm.disabled = false;
      giveVoucherConfirm.textContent = "Done";
      voucherPickerList.innerHTML = "";
    } catch (error) {
      voucherPickerMessage.textContent = error.message;
      giveVoucherConfirm.disabled = false;
      giveVoucherConfirm.textContent = "Try again";
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
    }
  }
});
