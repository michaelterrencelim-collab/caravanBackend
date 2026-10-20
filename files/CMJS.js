document.addEventListener("DOMContentLoaded", () => {
  const editorList = document.getElementById("contentEditorList");
  const count = document.getElementById("contentCount");
  const dialog = document.getElementById("contentConfirmDialog");
  const confirmSaveButton = document.getElementById("confirmContentSave");
  let pendingSave = null;
  let contentRows = [];

  loadContent();

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(data?.error || "Request failed");
    return data;
  }

  async function loadContent() {
    editorList.innerHTML = '<div class="content-state">Loading content…</div>';
    try {
      contentRows = await request("/api/admin/content") || [];
      contentRows.sort((a, b) => Number(a.content_type_id) - Number(b.content_type_id));
      renderContent();
    } catch (error) {
      count.textContent = "";
      editorList.innerHTML = `<div class="content-state content-state-error">${escapeHtml(error.message)}. Please refresh to try again.</div>`;
    }
  }

  function renderContent() {
    count.textContent = `${contentRows.length} section${contentRows.length === 1 ? "" : "s"}`;
    if (!contentRows.length) {
      editorList.innerHTML = '<div class="content-state">No website content was found.</div>';
      return;
    }

    editorList.innerHTML = contentRows.map((row) => `
      <article class="content-editor-card" data-id="${escapeHtml(row.content_id)}">
        <div class="content-editor-heading">
          <div>
            <h3>${escapeHtml(row.content_type_name || `Content ${row.content_type_id}`)}</h3>
            <span class="content-editor-id">Content #${escapeHtml(row.content_id)}</span>
          </div>
          <div class="content-editor-tools">
            <span class="content-last-edited">Last edited <time>${escapeHtml(formatDate(row.update_date))}</time></span>
            <button class="btn btn-secondary content-edit-button" type="button" data-action="edit">Edit</button>
            <button class="btn btn-secondary content-cancel-button" type="button" data-action="cancel" hidden>Cancel</button>
          </div>
        </div>
        <label class="sr-only" for="content-text-${escapeHtml(row.content_id)}">${escapeHtml(row.content_type_name || "Content")} text</label>
        <textarea class="content-editor-textarea" id="content-text-${escapeHtml(row.content_id)}" data-content="${escapeHtml(row.content_id)}" disabled>${escapeHtml(row.Main_text || "")}</textarea>
        <p class="content-save-status" role="status" aria-live="polite"></p>
      </article>
    `).join("");
  }

  editorList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const card = button.closest(".content-editor-card");
    const row = contentRows.find((item) => String(item.content_id) === card.dataset.id);
    const textarea = card.querySelector("textarea");
    const editButton = card.querySelector('[data-action="edit"]');
    const cancelButton = card.querySelector('[data-action="cancel"]');
    const status = card.querySelector(".content-save-status");

    if (button.dataset.action === "edit") {
      if (textarea.disabled) {
        textarea.dataset.original = textarea.value;
        textarea.disabled = false;
        textarea.focus();
        editButton.textContent = "Save";
        editButton.classList.add("is-save");
        editButton.disabled = true;
        cancelButton.hidden = false;
        status.textContent = "Editing unsaved changes";
      } else {
        pendingSave = { card, row, textarea, editButton, cancelButton, status };
        document.getElementById("contentConfirmMessage").textContent = `Save changes to ${row.content_type_name}? This will update the website and add an audit entry.`;
        dialog.showModal();
      }
    }

    if (button.dataset.action === "cancel") {
      textarea.value = textarea.dataset.original ?? textarea.value;
      textarea.disabled = true;
      editButton.textContent = "Edit";
      editButton.classList.remove("is-save");
      cancelButton.hidden = true;
      status.textContent = "Changes discarded";
    }
  });

  editorList.addEventListener("input", (event) => {
    const textarea = event.target.closest(".content-editor-textarea");
    if (!textarea || textarea.disabled) return;
    const card = textarea.closest(".content-editor-card");
    const saveButton = card.querySelector('[data-action="edit"]');
    saveButton.disabled = textarea.value === textarea.dataset.original;
    card.querySelector(".content-save-status").textContent = saveButton.disabled
      ? "No changes to save"
      : "Unsaved changes";
  });

  dialog.addEventListener("close", async () => {
    if (dialog.returnValue !== "save" || !pendingSave) {
      pendingSave = null;
      return;
    }
    const target = pendingSave;
    const updatedText = target.textarea.value;
    confirmSaveButton.disabled = true;
    target.editButton.disabled = true;
    target.cancelButton.disabled = true;
    target.status.textContent = "Saving…";
    try {
      const updated = await request(`/api/admin/content/${encodeURIComponent(target.row.content_id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mainText: updatedText }),
      });
      target.row.Main_text = updated.Main_text;
      target.row.update_date = updated.update_date;
      target.textarea.value = updated.Main_text ?? updatedText;
      target.textarea.disabled = true;
      target.editButton.textContent = "Edit";
      target.editButton.classList.remove("is-save");
      target.cancelButton.hidden = true;
      target.status.textContent = "Saved and added to the audit trail";
      target.card.querySelector(".content-last-edited time").textContent = formatDate(updated.update_date);
    } catch (error) {
      target.status.textContent = `Could not save: ${error.message}`;
    } finally {
      target.editButton.disabled = false;
      target.cancelButton.disabled = false;
      confirmSaveButton.disabled = false;
      pendingSave = null;
    }
  });

  function formatDate(value) {
    if (!value) return "Not yet recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
});
