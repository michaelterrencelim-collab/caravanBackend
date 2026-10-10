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

  if (inviteBtn) inviteBtn.addEventListener("click", () => console.log("Invite User clicked"));
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
      return `<tr data-kind="customer" data-account-id="${escapeHtml(account.accountId)}" data-status="${statusClass(status)}"><td><div class="name-cell"><span class="avatar avatar-blue">${escapeHtml(initials)}</span><span class="name-text">${escapeHtml(name)}</span></div></td><td class="mono">#${escapeHtml(account.accountId)}</td><td class="mono">${escapeHtml(account.email)}</td><td><span class="pill status-${statusClass(status)}">${escapeHtml(status)}</span></td><td><div class="account-actions"><a href="#" class="action-view">View</a><a href="#" class="action-edit">Edit</a>${status.toLowerCase() === "suspended" ? '<a href="#" class="action-activate">Activate</a>' : '<a href="#" class="action-suspend">Suspend</a>'}</div></td></tr>`;
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
      const statusAction = status.toLowerCase() === "suspended" ? '<a href="#" class="action-activate">Activate</a>' : '<a href="#" class="action-suspend">Suspend</a>';
      return `<tr data-kind="admin" data-account-id="${escapeHtml(account.accountId)}" data-status="${statusClass(status)}"><td><div class="name-cell"><span class="avatar avatar-teal">${escapeHtml(initials)}</span><span class="name-text">${escapeHtml(name)}</span></div></td><td><span class="pill ${roleClass}">${escapeHtml(role)}</span></td><td class="mono">${escapeHtml(account.email)}</td><td><span class="pill status-${statusClass(status)}">${escapeHtml(status)}</span></td><td><div class="account-actions"><a href="#" class="action-view">View</a><a href="#" class="action-edit">Edit</a>${statusAction}</div></td></tr>`;
    }).join("") : '<tr><td colspan="5">No admin accounts found.</td></tr>';
  }

  document.querySelectorAll("#customerBody, #adminBody").forEach((body) => body.addEventListener("click", async (event) => {
    const action = event.target.closest("a");
    if (!action) return;
    event.preventDefault();
    const row = action.closest("tr");
    const name = row.querySelector(".name-text")?.textContent.trim() || "account";
    if (action.classList.contains("action-suspend") || action.classList.contains("action-activate")) {
      const nextStatus = action.classList.contains("action-suspend") ? "Suspended" : "Active";
      if (nextStatus === "Suspended" && !confirm(`Suspend ${name}?`)) return;
      action.setAttribute("aria-disabled", "true");
      try {
        const kind = row.dataset.kind;
        const response = await fetch(`/api/admin/accounts/${kind}/${encodeURIComponent(row.dataset.accountId)}/status`, {
          method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to update account status");
        updateStatus(row, data.status || nextStatus);
      } catch (error) {
        alert(error.message);
      } finally {
        action.removeAttribute("aria-disabled");
      }
    } else if (action.classList.contains("action-view")) {
      alert(`${name}\n${row.querySelector(".mono")?.textContent || ""}`);
    } else if (action.classList.contains("action-edit")) {
      console.log("Edit account:", name);
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
      const suspended = status.toLowerCase() === "suspended";
      existing.className = suspended ? "action-activate" : "action-suspend";
      existing.textContent = suspended ? "Activate" : "Suspend";
    }
  }
});
