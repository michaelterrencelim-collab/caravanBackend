document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("recoveryForm");
  const button = document.getElementById("recoveryButton");
  const message = document.getElementById("recoveryMessage");
  const loginLink = document.getElementById("loginLink");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.classList.remove("error");
    message.textContent = "Verifying credentials and clearing the session lock…";
    button.disabled = true;
    button.textContent = "Please wait…";

    try {
      const response = await fetch("/api/admin-session-recovery", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.getElementById("adminEmail").value,
          password: document.getElementById("adminPassword").value,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to recover the admin session.");
      message.textContent = result.message;
      form.hidden = true;
      loginLink.hidden = false;
    } catch (error) {
      message.classList.add("error");
      message.textContent = error.message;
      button.disabled = false;
      button.textContent = "Clear my session lock";
    }
  });
});
