document.addEventListener("DOMContentLoaded", () => {
  const shippingList = document.getElementById("shippingOptions");
  const voucherList = document.getElementById("voucherOptions");
  const message = document.getElementById("settingsMessage");
  const editor = document.getElementById("optionEditor");
  const confirmation = document.getElementById("optionConfirmation");
  const form = document.getElementById("optionForm");
  const fields = document.getElementById("optionFields");
  const formError = document.getElementById("optionFormError");
  const confirmationCopy = document.getElementById("optionConfirmationCopy");
  const confirmationError = document.getElementById("optionConfirmationError");
  const confirmButton = document.getElementById("confirmAddOption");
  const formSubmit = document.getElementById("optionFormSubmit");
  let pendingOption = null;
  let editingOption = null;
  let settingsOptions = { shipping: [], vouchers: [] };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);

  function setMessage(text = "", isError = false) {
    message.textContent = text;
    message.classList.toggle("is-error", isError);
    message.classList.toggle("is-visible", Boolean(text));
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Unable to save settings.");
    return data;
  }

  function renderRows(list, kind, options) {
    if (!options.length) {
      list.innerHTML = '<p class="st-empty">No options have been added yet.</p>';
      return;
    }

    list.innerHTML = options.map((option) => {
      const isShipping = kind === "shipping";
      const id = isShipping ? option.Shipping_id : option.Voucher_id;
      const name = isShipping ? option.Shipping_name : option.Voucher_name;
      const description = isShipping ? option.Shipping_text : option.Voucher_desc;
      const detail = isShipping
        ? `₱${Number(option.Cost || 0).toFixed(2)}`
        : `${Number(option.discount || 0)}% discount`;
      const active = Number(option.Status_id) === 1;
      const safeName = escapeHtml(name);

      return `<article class="st-option-row${active ? "" : " is-disabled"}">
        <div class="st-option-info">
          <p class="st-option-name">${safeName}</p>
          <p class="st-option-sub">${escapeHtml(description)}</p>
        </div>
        <div class="st-option-controls">
          <span class="st-option-price">${escapeHtml(detail)}</span>
          <button type="button" class="st-edit-option" data-edit-kind="${kind}" data-edit-id="${escapeHtml(id)}" aria-label="Edit ${safeName}">Edit</button>
          <span class="st-option-state">${active ? "Active" : "Inactive"}</span>
          <label class="toggle" title="Set ${safeName} ${active ? "inactive" : "active"}">
            <input type="checkbox" data-kind="${kind}" data-id="${escapeHtml(id)}" aria-label="${active ? "Deactivate" : "Activate"} ${safeName}" ${active ? "checked" : ""}>
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
          </label>
        </div>
      </article>`;
    }).join("");
  }

  async function loadSettings() {
    shippingList.innerHTML = '<p class="st-empty">Loading shipping options…</p>';
    voucherList.innerHTML = '<p class="st-empty">Loading vouchers…</p>';
    try {
      const data = await api("/api/admin/settings/options");
      settingsOptions = {
        shipping: data.shipping || [],
        vouchers: data.vouchers || [],
      };
      renderRows(shippingList, "shipping", settingsOptions.shipping);
      renderRows(voucherList, "voucher", settingsOptions.vouchers);
    } catch (error) {
      shippingList.innerHTML = '<p class="st-empty">Unable to load shipping options.</p>';
      voucherList.innerHTML = '<p class="st-empty">Unable to load vouchers.</p>';
      setMessage(error.message, true);
    }
  }

  function formValues() {
    const values = Object.fromEntries(new FormData(form));
    values.name = String(values.name || "").trim();
    values.description = String(values.description || "").trim();
    if (form.dataset.kind === "shipping") values.cost = Number(values.cost);
    else values.discount = Number(values.discount);
    return values;
  }

  function updateEditSaveState() {
    if (!editingOption) return;
    const changed = JSON.stringify(formValues()) !== JSON.stringify(editingOption.originalValues);
    formSubmit.disabled = !changed;
  }

  function openEditor(kind, option = null) {
    const isShipping = kind === "shipping";
    editingOption = option ? {
      kind,
      id: isShipping ? option.Shipping_id : option.Voucher_id,
      originalValues: isShipping
        ? { name: String(option.Shipping_name || "").trim(), description: String(option.Shipping_text || "").trim(), cost: Number(option.Cost || 0) }
        : { name: String(option.Voucher_name || "").trim(), description: String(option.Voucher_desc || "").trim(), discount: Number(option.discount || 0) },
    } : null;
    document.getElementById("optionEditorTitle").textContent = editingOption
      ? (isShipping ? "Edit shipping option" : "Edit voucher")
      : (isShipping ? "Add shipping option" : "Add voucher");
    formError.textContent = "";
    fields.innerHTML = isShipping
      ? `<label class="st-form-field"><span>Shipping name</span><input name="name" maxlength="255" required autocomplete="off" placeholder="Standard Delivery"></label>
         <label class="st-form-field"><span>Shipping text</span><textarea name="description" maxlength="1000" rows="3" required placeholder="3–5 business days"></textarea></label>
         <label class="st-form-field"><span>Cost (₱)</span><input name="cost" type="number" min="0" step="0.01" required inputmode="decimal" placeholder="50.00"></label>`
      : `<label class="st-form-field"><span>Voucher name</span><input name="name" maxlength="255" required autocomplete="off" placeholder="WELCOME10"></label>
         <label class="st-form-field"><span>Description</span><textarea name="description" maxlength="1000" rows="3" required placeholder="Get 10% off your order."></textarea></label>
         <label class="st-form-field"><span>Discount (%)</span><input name="discount" type="number" min="0.01" max="100" step="0.01" required inputmode="decimal" placeholder="10"></label>`;
    form.dataset.kind = kind;
    formSubmit.textContent = editingOption ? "Save changes" : "Continue";
    formSubmit.disabled = Boolean(editingOption);
    if (editingOption) {
      const source = editingOption.kind === "shipping"
        ? { name: option.Shipping_name, description: option.Shipping_text, cost: option.Cost }
        : { name: option.Voucher_name, description: option.Voucher_desc, discount: option.discount };
      for (const [name, value] of Object.entries(source)) {
        const field = fields.querySelector(`[name="${name}"]`);
        if (field) field.value = value ?? "";
      }
    }
    editor.showModal();
    fields.querySelector("input")?.focus();
  }

  function openEditFor(kind, id) {
    const collection = kind === "shipping" ? settingsOptions.shipping : settingsOptions.vouchers;
    const option = collection.find((item) => String(kind === "shipping" ? item.Shipping_id : item.Voucher_id) === String(id));
    if (option) openEditor(kind, option);
  }

  async function setStatus(input) {
    const kind = input.dataset.kind;
    const id = input.dataset.id;
    const nextActive = input.checked;
    const row = input.closest(".st-option-row");
    const state = row.querySelector(".st-option-state");
    input.disabled = true;
    try {
      await api(`/api/admin/settings/${kind}/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ active: nextActive }),
      });
      row.classList.toggle("is-disabled", !nextActive);
      state.textContent = nextActive ? "Active" : "Inactive";
      input.setAttribute("aria-label", `${nextActive ? "Deactivate" : "Activate"} ${row.querySelector(".st-option-name").textContent}`);
      setMessage(`${row.querySelector(".st-option-name").textContent} is now ${nextActive ? "active" : "inactive"}.`);
    } catch (error) {
      input.checked = !nextActive;
      setMessage(error.message, true);
    } finally {
      input.disabled = false;
    }
  }

  async function createOption() {
    if (!pendingOption) return;
    confirmButton.disabled = true;
    confirmationError.textContent = "";
    try {
      await api(`/api/admin/settings/${pendingOption.kind}`, {
        method: "POST",
        body: JSON.stringify(pendingOption.values),
      });
      const title = pendingOption.kind === "shipping" ? "Shipping option" : "Voucher";
      const name = pendingOption.values.name;
      confirmation.close();
      pendingOption = null;
      setMessage(`${title} “${name}” was added.`);
      await loadSettings();
    } catch (error) {
      confirmationError.textContent = error.message;
    } finally {
      confirmButton.disabled = false;
    }
  }

  async function saveEditedOption(values) {
    const { kind, id } = editingOption;
    formSubmit.disabled = true;
    try {
      await api(`/api/admin/settings/${kind}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      const itemType = kind === "shipping" ? "Shipping option" : "Voucher";
      const name = values.name;
      editor.close();
      editingOption = null;
      setMessage(`${itemType} “${name}” was updated.`);
      await loadSettings();
    } catch (error) {
      formError.textContent = error.message;
      formSubmit.disabled = false;
    }
  }

  document.querySelectorAll(".st-add-option").forEach((button) => {
    button.addEventListener("click", () => openEditor(button.dataset.action === "add-shipping" ? "shipping" : "voucher"));
  });

  document.querySelectorAll("[data-close-editor]").forEach((button) => button.addEventListener("click", () => editor.close()));
  document.querySelectorAll("[data-close-confirm]").forEach((button) => button.addEventListener("click", () => confirmation.close()));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    formError.textContent = "";
    const values = formValues();
    if (!values.name || !values.description) {
      formError.textContent = "Complete all fields before continuing.";
      return;
    }
    if (form.dataset.kind === "shipping") {
      if (!Number.isFinite(values.cost) || values.cost < 0) {
        formError.textContent = "Enter a valid shipping cost.";
        return;
      }
    } else {
      if (!Number.isFinite(values.discount) || values.discount <= 0 || values.discount > 100) {
        formError.textContent = "Discount must be greater than 0 and at most 100%.";
        return;
      }
    }

    if (editingOption) {
      if (JSON.stringify(values) !== JSON.stringify(editingOption.originalValues)) saveEditedOption(values);
      return;
    }

    pendingOption = { kind: form.dataset.kind, values };
    const typeName = pendingOption.kind === "shipping" ? "shipping option" : "voucher";
    confirmationCopy.textContent = `Add “${values.name}” as a new ${typeName}? It will be active as soon as it is created.`;
    confirmationError.textContent = "";
    editor.close();
    confirmation.showModal();
  });

  confirmButton.addEventListener("click", createOption);
  form.addEventListener("input", updateEditSaveState);
  [shippingList, voucherList].forEach((list) => list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-edit-kind][data-edit-id]");
    if (button) openEditFor(button.dataset.editKind, button.dataset.editId);
  }));
  shippingList.addEventListener("change", (event) => {
    if (event.target.matches('input[type="checkbox"][data-kind="shipping"]')) setStatus(event.target);
  });
  voucherList.addEventListener("change", (event) => {
    if (event.target.matches('input[type="checkbox"][data-kind="voucher"]')) setStatus(event.target);
  });

  loadSettings();
});
