document.addEventListener("DOMContentLoaded", () => {
  const heartbeatAdminSession = async () => {
    try {
      const response = await fetch("/api/admin/session/heartbeat", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.status === 401 || response.status === 403) {
        window.location.replace("/login");
      }
    } catch (error) {
    }
  };
  heartbeatAdminSession();
  window.setInterval(heartbeatAdminSession, 60 * 1000);

  const navLinks = document.querySelectorAll(".nav-link");
  const bellBtn = document.getElementById("bellBtn");
  const bellDot = document.getElementById("bellDot");
  const signOutBtn = document.getElementById("signOutBtn");
  const ordersBody = document.getElementById("ordersBody");
  const concernsList = document.getElementById("concernsList");
  const pageSubtitle = document.getElementById("pageSubtitle");
  const seeAllConcernsBtn = document.getElementById("seeAllConcernsBtn");
  const allConcernsDialog = document.getElementById("allConcernsDialog");
  const allConcernsList = document.getElementById("allConcernsList");
  const closeConcernsDialog = document.getElementById("closeConcernsDialog");
  const previousConcernsPage = document.getElementById("previousConcernsPage");
  const nextConcernsPage = document.getElementById("nextConcernsPage");
  const concernsPageIndicator = document.getElementById("concernsPageIndicator");
  const CONCERNS_PAGE_SIZE = 10;
  let allConcerns = [];
  let concernsPage = 1;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  const signOutDialog = document.createElement("dialog");
  signOutDialog.className = "signout-dialog";
  signOutDialog.setAttribute("aria-labelledby", "signOutDialogTitle");
  signOutDialog.setAttribute("aria-describedby", "signOutDialogMessage");
  signOutDialog.innerHTML = `
    <div class="signout-dialog__content">
      <span class="signout-dialog__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M16 16l4-4-4-4m4 4H9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>
      <h2 id="signOutDialogTitle">Sign out?</h2>
      <p id="signOutDialogMessage">Are you sure you want to sign out of your account?</p>
      <div class="signout-dialog__actions">
        <button class="signout-dialog__cancel" type="button" data-signout-cancel>Cancel</button>
        <button class="signout-dialog__confirm" type="button" data-signout-confirm>Sign Out</button>
      </div>
    </div>`;
  document.body.append(signOutDialog);
  const cancelSignOut = signOutDialog.querySelector("[data-signout-cancel]");
  const confirmSignOut = signOutDialog.querySelector("[data-signout-confirm]");

  if (bellDot) bellDot.classList.add("show");
  const currentPage = location.pathname.split("/").pop() || "dashboard";
  navLinks.forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === `/admin/${currentPage}`));
  navLinks.forEach((link) => link.addEventListener("click", (event) => {
    if (link.getAttribute("href") === "#") {
      event.preventDefault();
    }
  }));

  if (bellBtn && bellDot) bellBtn.addEventListener("click", () => bellDot.classList.remove("show"));
  if (seeAllConcernsBtn && allConcernsDialog) {
    seeAllConcernsBtn.addEventListener("click", () => {
      concernsPage = 1;
      renderAllConcerns();
      allConcernsDialog.showModal();
    });
    closeConcernsDialog.addEventListener("click", () => allConcernsDialog.close());
    allConcernsDialog.addEventListener("click", (event) => {
      if (event.target === allConcernsDialog) allConcernsDialog.close();
    });
    allConcernsDialog.addEventListener("close", () => seeAllConcernsBtn.focus());
    previousConcernsPage.addEventListener("click", () => {
      if (concernsPage > 1) {
        concernsPage -= 1;
        renderAllConcerns();
      }
    });
    nextConcernsPage.addEventListener("click", () => {
      if (concernsPage < Math.ceil(allConcerns.length / CONCERNS_PAGE_SIZE)) {
        concernsPage += 1;
        renderAllConcerns();
      }
    });
  }
  if (signOutBtn) {
    signOutBtn.setAttribute("aria-haspopup", "dialog");
    signOutBtn.addEventListener("click", () => signOutDialog.showModal());
    cancelSignOut.addEventListener("click", () => signOutDialog.close());
    confirmSignOut.addEventListener("click", async () => {
      confirmSignOut.disabled = true;
      confirmSignOut.textContent = "Signing out…";
      try {
        await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
      } catch (error) {
      }
      window.location.assign("/login");
    });
    signOutDialog.addEventListener("click", (event) => {
      if (event.target === signOutDialog) signOutDialog.close();
    });
    signOutDialog.addEventListener("close", () => signOutBtn.focus());
  }

  if (ordersBody || concernsList) loadDashboard();

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  async function loadDashboard() {
    if (ordersBody) ordersBody.innerHTML = '<tr><td colspan="5">Loading recent orders…</td></tr>';
    if (concernsList) concernsList.innerHTML = '<p class="dashboard-state">Loading current concerns…</p>';
    try {
      const response = await fetch(`/api/admin/dashboard?today=${encodeURIComponent(localDateString())}`, { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load dashboard");
      if (pageSubtitle) pageSubtitle.textContent = `Welcome back, ${data.adminName || "Admin"}`;
      renderConcerns(data.concerns || []);
      renderOrders(data.recentOrders || []);
    } catch (error) {
      if (concernsList) concernsList.innerHTML = `<p class="dashboard-state">${escapeHtml(error.message)}. Please refresh to try again.</p>`;
      if (ordersBody) ordersBody.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}. Please refresh to try again.</td></tr>`;
    }
  }

  function renderConcerns(concerns) {
    if (!concernsList) return;
    allConcerns = concerns;
    const totalPages = Math.max(1, Math.ceil(allConcerns.length / CONCERNS_PAGE_SIZE));
    concernsPage = Math.min(concernsPage, totalPages);
    const visible = concerns.slice(0, 5);
    if (!visible.length) {
      concernsList.innerHTML = '<p class="dashboard-state">Congrats, no current concerns</p>';
      if (allConcernsDialog.open) renderAllConcerns();
      return;
    }
    concernsList.innerHTML = visible.map((product, index) => {
      return `${index ? '<div class="divider"></div>' : ''}${concernRowHtml(product)}`;
    }).join("");
    if (allConcernsDialog.open) renderAllConcerns();
  }

  function concernRowHtml(product) {
    const amount = Number(product.Prod_amount);
    const message = amount <= 0
      ? `${product.Prod_name} is out of stock`
      : `${product.Prod_name} is running low (${amount} left)`;
    const url = `/admin/stocksInventory?productId=${encodeURIComponent(product.product_id)}`;
    return `<div class="concern-row"><div class="concern-left"><svg class="concern-icon warn" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 22 20H2L12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9v5m0 3h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><p>${escapeHtml(message)}</p></div><a class="see-more" href="${url}">See more →</a></div>`;
  }

  function renderAllConcerns() {
    if (!allConcernsList) return;
    const totalPages = Math.max(1, Math.ceil(allConcerns.length / CONCERNS_PAGE_SIZE));
    const start = (concernsPage - 1) * CONCERNS_PAGE_SIZE;
    const pageItems = allConcerns.slice(start, start + CONCERNS_PAGE_SIZE);
    allConcernsList.innerHTML = pageItems.length
      ? pageItems.map((product, index) => `${index ? '<div class="divider"></div>' : ''}${concernRowHtml(product)}`).join("")
      : '<p class="dashboard-state">Congrats, no current concerns</p>';
    concernsPageIndicator.textContent = `Page ${concernsPage} of ${totalPages} · ${allConcerns.length} concerns`;
    previousConcernsPage.disabled = concernsPage <= 1;
    nextConcernsPage.disabled = concernsPage >= totalPages;
  }

  function renderOrders(orders) {
    if (!ordersBody) return;
    if (!orders.length) {
      ordersBody.innerHTML = '<tr><td colspan="5">No orders today.</td></tr>';
      return;
    }
    ordersBody.innerHTML = orders.map((order) => {
      const status = String(order.Order_status || "Unknown");
      const statusClass = status.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const products = String(order.Product_ids || "").split(",").filter(Boolean).map((id) => `#${escapeHtml(id)}`).join(", ") || "—";
      const orderUrl = `/admin/ordersReports?orderId=${encodeURIComponent(order.Order_id)}`;
      return `<tr><td class="mono strong">#${escapeHtml(order.Order_id)}</td><td class="mono">#${escapeHtml(order.Customer_id)}</td><td class="mono">${products}</td><td><span class="status status-${statusClass}">${escapeHtml(status)}</span></td><td class="order-open-cell"><a class="order-open-link" href="${orderUrl}" aria-label="Open order ${escapeHtml(order.Order_id)}">→</a></td></tr>`;
    }).join("");
  }

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) loadDashboard();
  });
});
