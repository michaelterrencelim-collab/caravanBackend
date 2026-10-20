document.addEventListener("DOMContentLoaded", async () => {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const message = document.getElementById("invitationMessage");
  const expiry = document.getElementById("invitationExpiry");
  const actions = document.getElementById("invitationActions");
  const buttons = [...actions.querySelectorAll("button[data-decision]")];

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    message.textContent = "This invitation link is invalid.";
    return;
  }

  try {
    const response = await fetch(`/api/admin-invitations/${encodeURIComponent(token)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "This invitation is no longer available");
    message.textContent = `You have been invited to join the Caravan admin team, ${data.customerName}. Accepting will create an admin account using your existing Caravan credentials.`;
    expiry.textContent = `Invitation expires ${new Date(data.expiresAt).toLocaleString()}.`;
    expiry.hidden = false;
    actions.hidden = false;
  } catch (error) {
    message.textContent = error.message;
    return;
  }

  buttons.forEach((button) => button.addEventListener("click", async () => {
    buttons.forEach((item) => { item.disabled = true; });
    const decision = button.dataset.decision;
    message.textContent = decision === "accept" ? "Accepting invitation…" : "Declining invitation…";
    try {
      const response = await fetch(`/api/admin-invitations/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to respond to invitation");
      message.textContent = data.message;
      actions.hidden = true;
      expiry.hidden = true;
    } catch (error) {
      message.textContent = error.message;
      buttons.forEach((item) => { item.disabled = false; });
    }
  }));
});
