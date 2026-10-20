const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMessage = document.getElementById("error-message");
const successMessage = document.getElementById("success-message");
const loginButton = document.getElementById("loginButton");

const togglePassword = document.getElementById("togglePassword");

togglePassword.addEventListener("click", function () {

  if (passwordInput.type === "password") {

    passwordInput.type = "text";

    togglePassword.innerHTML = '<i class="bi bi-eye-slash"></i>';

    togglePassword.setAttribute("aria-label", "Hide password");

  } else {

    passwordInput.type = "password";

    togglePassword.innerHTML = '<i class="bi bi-eye"></i>';

    togglePassword.setAttribute("aria-label", "Show password");

  }

});

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = "block";

  setTimeout(() => {
    errorMessage.style.display = "none";
    loginButton.disabled = false;
    loginButton.textContent = "SIGN IN";
    loginButton.style.backdropFilter = "blur(0px)";
  }, 2000);
}

loginForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  // Get values
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // Hide previous messages
  errorMessage.style.display = "none";
  successMessage.style.display = "none";

  // Check if email is empty
  if (email === "") {
    showError("Please enter your email address.");
    return;
  }

  // Validate email
  if (!validateEmail(email)) {
    showError("That isn't a valid email address.");
    return;
  }

  // Check if password is empty
  if (password === "") {
    showError("Please enter your password.");
    return;
  }

  // Validate password length
  if (password.length < 6) {
    showError("Password must be at least 6 characters.");
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "LOADING...";
  loginButton.style.backdropFilter = "blur(25px)";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      showError(data.error || "Invalid email or password");
      return;
    }
    if (data.role !== "admin") {
      showError("Invalid email or password");
      return;
    }
    window.location.href = "/admin/dashboard";
  } catch (error) {
    showError("Unable to sign in right now. Please try again.");
  }
});
