document.addEventListener("DOMContentLoaded", () => {
  const navLinks = document.querySelectorAll(".nav-link");
  const bellBtn = document.getElementById("bellBtn");
  const bellDot = document.getElementById("bellDot");
  const signOutBtn = document.getElementById("signOutBtn");
  const ordersBody = document.getElementById("ordersBody");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

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
  if (signOutBtn) signOutBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to sign out?")) console.log("Signed out");
  });

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
