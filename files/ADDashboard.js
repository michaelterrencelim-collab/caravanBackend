document.addEventListener("DOMContentLoaded", () => {
  const navLinks = document.querySelectorAll(".nav-link");
  const bellBtn = document.getElementById("bellBtn");
  const bellDot = document.getElementById("bellDot");
  const signOutBtn = document.getElementById("signOutBtn");
  const ordersBody = document.getElementById("ordersBody");
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
      console.log(`${link.dataset.page} hasn't been built yet.`);
    }
  }));

  if (bellBtn && bellDot) bellBtn.addEventListener("click", () => bellDot.classList.remove("show"));
  document.querySelectorAll(".see-more").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    location.href = "/admin/ordersReports";
  }));
  if (signOutBtn) {
    signOutBtn.setAttribute("aria-haspopup", "dialog");
    signOutBtn.addEventListener("click", () => signOutDialog.showModal());
    cancelSignOut.addEventListener("click", () => signOutDialog.close());
    confirmSignOut.addEventListener("click", () => {
      confirmSignOut.disabled = true;
      confirmSignOut.textContent = "Signing out…";
      window.location.assign("/login");
    });
    signOutDialog.addEventListener("click", (event) => {
      if (event.target === signOutDialog) signOutDialog.close();
    });
    signOutDialog.addEventListener("close", () => signOutBtn.focus());
  }

  if (ordersBody) loadRecentOrders();

  async function loadRecentOrders() {
    ordersBody.innerHTML = '<tr><td colspan="4">Loading recent orders…</td></tr>';
    try {
      const response = await fetch("/api/admin/dashboard", { credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load recent orders");
      const orders = data.recentOrders || [];
      if (!orders.length) {
        ordersBody.innerHTML = '<tr><td colspan="4">No recent orders found.</td></tr>';
        return;
      }
      ordersBody.innerHTML = orders.map((order) => {
        const status = String(order.Order_status || "Unknown");
        const statusClass = status.toLowerCase().replace(/[^a-z0-9-]/g, "-");
        return `<tr><td class="mono strong">#${escapeHtml(order.Order_id)}</td><td class="mono">#${escapeHtml(order.Customer_id)}</td><td class="mono">#${escapeHtml(order.Product_id ?? "—")}</td><td><span class="status status-${statusClass}">${escapeHtml(status)}</span></td></tr>`;
      }).join("");
    } catch (error) {
      ordersBody.innerHTML = `<tr><td colspan="4">${escapeHtml(error.message)}. Please refresh to try again.</td></tr>`;
    }
  }
});
