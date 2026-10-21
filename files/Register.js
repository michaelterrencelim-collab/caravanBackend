const registerForm = document.getElementById("registerForm");

const firstNameInput = document.getElementById("firstName");
const lastNameInput = document.getElementById("lastName");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");

const privacyConsent = document.getElementById("privacyConsent");

const errorMessage = document.getElementById("error-message");
const successMessage = document.getElementById("success-message");

const registerButton = document.getElementById("registerButton");

const privacyLink = document.getElementById("privacyLink");
const privacyModal = document.getElementById("privacyModal");

const closeModal = document.getElementById("closeModal");
const acceptPrivacy = document.getElementById("acceptPrivacy");
const declinePrivacy = document.getElementById("declinePrivacy");

const togglePassword = document.getElementById("togglePassword");
const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");


// Show/Hide Password
togglePassword.addEventListener("click", function () {
    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        togglePassword.innerHTML =
            '<i class="bi bi-eye-slash"></i>';
        togglePassword.setAttribute(
            "aria-label",
            "Hide password"
        );
    } else {
        passwordInput.type = "password";
        togglePassword.innerHTML =
            '<i class="bi bi-eye"></i>';
        togglePassword.setAttribute(
            "aria-label",
            "Show password"
        );
    }
});
// Show/Hide Confirm Password
toggleConfirmPassword.addEventListener("click", function () {
    if (confirmPasswordInput.type === "password") {
        confirmPasswordInput.type = "text";
        toggleConfirmPassword.innerHTML =
            '<i class="bi bi-eye-slash"></i>';

        toggleConfirmPassword.setAttribute(
            "aria-label",
            "Hide confirm password"
        );
    } else {
        confirmPasswordInput.type = "password";

        toggleConfirmPassword.innerHTML =
            '<i class="bi bi-eye"></i>';

        toggleConfirmPassword.setAttribute(
            "aria-label",
            "Show confirm password"
        );
    }
});

function openPrivacyModal() {
  privacyModal.style.display = "flex";
  document.body.classList.add("modal-open");
}

function closePrivacyModalFunction() {
  privacyModal.style.display = "none";
  document.body.classList.remove("modal-open");
}

// ==============================
// EMAIL VALIDATION
// ==============================
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ==============================
// SHOW ERROR MESSAGE
// ==============================
function showError(message) {
  errorMessage.textContent = message;

  errorMessage.style.display = "block";

  // Automatically hide after 2 seconds
  setTimeout(() => {
    errorMessage.style.display = "none";
  }, 2000);
}

// ==============================
// SHOW SUCCESS MESSAGE
// ==============================
function showSuccess(message) {
  successMessage.textContent = message;

  successMessage.style.display = "block";

  setTimeout(() => {
    successMessage.style.display = "none";
    window.location.href = "/store";
  }, 2000);
}

// ==============================
// PRIVACY CHECKBOX
// ==============================
privacyConsent.addEventListener("change", function () {
  if (privacyConsent.checked) {
    registerButton.disabled = false;

    registerButton.classList.remove("register-btn-disabled");
  } else {
    registerButton.disabled = true;

    registerButton.classList.add("register-btn-disabled");
  }
});

// ==============================
// OPEN PRIVACY MODAL
// ==============================

privacyLink.addEventListener("click", function (e) {
  e.preventDefault();
  openPrivacyModal();
});

// ==============================
// CLOSE MODAL BUTTON
// ==============================

closeModal.addEventListener("click", function () {
  closePrivacyModalFunction();
});

// ==============================
// CLOSE BUTTON
// ==============================

declinePrivacy.addEventListener("click", function () {
  closePrivacyModalFunction();
});

// ==============================
// ACCEPT PRIVACY POLICY
// ==============================

acceptPrivacy.addEventListener("click", function () {
  privacyConsent.checked = true;

  registerButton.disabled = false;

  registerButton.classList.remove("register-btn-disabled");

  closePrivacyModalFunction();
});

// ==============================
// CLOSE MODAL WHEN CLICKING OUTSIDE
// ==============================

privacyModal.addEventListener("click", function (e) {
  if (e.target === privacyModal) {
    closePrivacyModalFunction();
  }
});

// ==============================
// REGISTER FORM VALIDATION
// ==============================
registerForm.addEventListener("submit", async function (e) {
  e.preventDefault();

  // Get input values
  const firstName = firstNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  const email = emailInput.value.trim();

  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  // Hide previous messages
  errorMessage.style.display = "none";
  successMessage.style.display = "none";

  // Validate First Name
  if (firstName === "") {
    showError("Please enter your first name.");

    return;
  }

  // Validate Last Name
  if (lastName === "") {
    showError("Please enter your last name.");

    return;
  }

  // Validate Email
  if (!validateEmail(email)) {
    showError("That isn't a valid email address.");

    return;
  }

  // Validate Password Length
  if (password.length < 6) {
    showError("Password must be at least 6 characters.");

    return;
  }

  // Validate Confirm Password
  if (password !== confirmPassword) {
    showError("Passwords do not match.");

    return;
  }

  // Check Privacy Consent
  if (!privacyConsent.checked) {
    showError("You must agree to the Data Privacy Policy to register.");

    return;
  }

  registerButton.disabled = true;
  registerButton.textContent = "LOADING...";
  registerButton.style.backdropFilter = "blur(2px)";

  const response = await fetch("/api/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ firstName, lastName, email, password }),
    
  });

  const data = await response.json();

  if (data.error) {
    showError(data.error);

    registerButton.disabled = false;
    registerButton.textContent = "REGISTER";
    registerButton.style.backdropFilter = "blur(0px)";
  }

  if (data.login) {
    showSuccess(data.login);
  }
});
