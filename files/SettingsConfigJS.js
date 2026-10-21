document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("saveChangesBtn");

  document.querySelectorAll(".toggle input").forEach((input) => {
    input.addEventListener("change", () => {
      const row = input.closest(".st-option-row");
      if (row) {
        row.classList.toggle("is-disabled", !input.checked);
      }
    });
  });

  document.querySelectorAll(".st-add-option").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
    });
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
    });
  }
});
