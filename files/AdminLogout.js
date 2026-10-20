document.addEventListener("DOMContentLoaded", async () => {
  const message = document.getElementById("logoutMessage");
  const loginLink = document.getElementById("loginLink");

  try {
    const response = await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok && response.status !== 401) {
      throw new Error(result.error || "The server could not complete sign out.");
    }

    message.textContent = response.ok
      ? "You are signed out. Your admin session has been released."
      : "This browser has no active admin login cookie. If login is still blocked, the session lock may need to be cleared from the database.";
  } catch (error) {
    message.textContent = error.message || "Unable to reach the sign-out endpoint. Check your connection and reload this page.";
  } finally {
    loginLink.hidden = false;
  }
});
