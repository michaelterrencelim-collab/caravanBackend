document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab");
  const contentBody = document.getElementById("contentBody");
  const addContentBtn = document.getElementById("addContentBtn");
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  let contentRows = [];
  let activeFilter = "all";

  tabs.forEach((tab) => tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    activeFilter = tab.dataset.filter;
    applyFilter();
  }));

  loadContent();

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    if (response.status === 204) return null;
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function loadContent() {
    contentBody.innerHTML = '<tr><td colspan="6">Loading content…</td></tr>';
    try {
      contentRows = await request("/api/admin/content") || [];
      renderContent();
    } catch (error) {
      contentBody.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}. Please refresh to try again.</td></tr>`;
    }
  }

  function typeLabel(row) {
    return row.content_type_name || `Type ${row.content_type_id}`;
  }
  function typeFilter(row) {
    const value = typeLabel(row).toLowerCase();
    if (value.includes("banner")) return "banner";
    if (value.includes("promotion")) return "promotion";
    if (value.includes("faq")) return "faq";
    if (value.includes("page")) return "page";
    return value.replace(/[^a-z0-9-]/g, "-");
  }
  function renderContent() {
    if (!contentRows.length) {
      contentBody.innerHTML = '<tr><td colspan="6">No content found.</td></tr>';
      return;
    }
    contentBody.innerHTML = contentRows.map((row) => {
      const status = String(row.content_status || "Draft");
      const published = status.toLowerCase() === "published";
      const typeId = Number(row.content_type_id);
      const edited = row.Last_edited ? new Date(row.Last_edited).toLocaleDateString() : "—";
      return `<tr data-id="${escapeHtml(row.content_id)}" data-type="${escapeHtml(typeFilter(row))}" data-content-type-id="${escapeHtml(typeId)}">
        <td><span class="cm-preview" aria-hidden="true"></span></td>
        <td>${escapeHtml(row.title)}</td><td>${escapeHtml(typeLabel(row))}</td><td class="mono">${escapeHtml(edited)}</td>
        <td><span class="status-pill status-${published ? "published" : "unpublished"}">${escapeHtml(status)}</span></td>
        <td><div class="cm-actions"><div class="cm-actions-col"><a href="#" data-action="view">View</a><a href="#" data-action="edit">Edit</a></div><div class="cm-actions-col"><a href="#" data-action="${published ? "unpublish" : "publish"}">${published ? "Unpublish" : "Publish"}</a><a href="#" data-action="delete">Delete</a></div></div></td>
      </tr>`;
    }).join("");
    applyFilter();
  }
  function applyFilter() {
    contentBody.querySelectorAll("tr[data-id]").forEach((row) => {
      row.style.display = activeFilter === "all" || row.dataset.type === activeFilter ? "" : "none";
    });
  }

  contentBody.addEventListener("click", async (event) => {
    const link = event.target.closest("[data-action]");
    if (!link) return;
    event.preventDefault();
    const row = link.closest("tr");
    const record = contentRows.find((item) => String(item.content_id) === row.dataset.id);
    if (!record) return;
    const action = link.dataset.action;
    try {
      if (action === "view") {
        alert(`${record.title}\n${typeLabel(record)} · ${record.content_status || "Draft"}`);
      } else if (action === "edit") {
        const title = prompt("Content title:", record.title);
        if (title === null) return;
        if (!title.trim()) { alert("A title is required."); return; }
        const typeId = prompt("Content type ID:", String(record.content_type_id));
        if (typeId === null) return;
        if (!Number.isInteger(Number(typeId)) || Number(typeId) < 1) { alert("Enter a valid content type ID."); return; }
        const updated = await request(`/api/admin/content/${encodeURIComponent(record.content_id)}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), contentTypeId: Number(typeId), status: record.content_status || "Draft" }),
        });
        Object.assign(record, { title: updated.title, content_type_id: Number(typeId), content_status: updated.status });
        await loadContent();
      } else if (action === "publish" || action === "unpublish") {
        const status = action === "publish" ? "Published" : "Unpublished";
        const updated = await request(`/api/admin/content/${encodeURIComponent(record.content_id)}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: record.title, contentTypeId: Number(record.content_type_id), status }),
        });
        record.content_status = updated.status;
        await loadContent();
      } else if (action === "delete") {
        if (!confirm(`Delete “${record.title}”? This cannot be undone.`)) return;
        await request(`/api/admin/content/${encodeURIComponent(record.content_id)}`, { method: "DELETE" });
        contentRows = contentRows.filter((item) => String(item.content_id) !== String(record.content_id));
        renderContent();
      }
    } catch (error) {
      alert(error.message);
    }
  });

  if (addContentBtn) addContentBtn.addEventListener("click", async () => {
    const title = prompt("Content title:");
    if (title === null) return;
    if (!title.trim()) { alert("A title is required."); return; }
    const knownTypes = [...new Map(contentRows.map((row) => [Number(row.content_type_id), typeLabel(row)])).entries()];
    const typeHelp = knownTypes.length ? `Available types: ${knownTypes.map(([id, label]) => `${label} (${id})`).join(", ")}` : "Enter a content type ID.";
    const typeId = prompt(`${typeHelp}\nContent type ID:`, knownTypes.length === 1 ? String(knownTypes[0][0]) : "");
    if (typeId === null) return;
    if (!Number.isInteger(Number(typeId)) || Number(typeId) < 1) { alert("Enter a valid content type ID."); return; }
    try {
      await request("/api/admin/content", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), contentTypeId: Number(typeId), status: "Draft" }),
      });
      await loadContent();
    } catch (error) {
      alert(error.message);
    }
  });
});
