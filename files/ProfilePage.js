// load screen functions
function showLoader() {
    document
        .getElementById("loadingOverlay")
        .classList.add("active");
}

function hideLoader() {
    document
        .getElementById("loadingOverlay")
        .classList.remove("active");
}

document.addEventListener("DOMContentLoaded", () => {
  
    showLoader();
    // Calls loadProfile function
    Promise.all([
        loadProfile(),
        loadAddresses(),
        loadWishlist(), 
        loadVouchers()
    ]).finally(() => {
        hideLoader();
    });

  // Sidebar Tab Navigation
  const menuItems = document.querySelectorAll(".menu-item");
  const tabPanes = document.querySelectorAll(".tab-pane");

  const profileFields = [
      document.getElementById("userEmail"),
      document.getElementById("userBirthdate"),
      document.getElementById("userFirstName"),
      document.getElementById("userLastName"),
      document.getElementById("userPassword")
  ];

  const editBtn = document.getElementById("editProfileBtn");
  const saveBtn = document.getElementById("saveProfileBtn");
  const cancelBtn = document.getElementById("cancelProfileBtn");

  let originalValues = {};

  function hasChanges() {
    return profileFields.some(field =>
        field.value !== (originalValues[field.id] || "")
    );
  }

  function updateSaveButtonState() {
      saveBtn.disabled = !hasChanges();

      if (saveBtn.disabled) {
          saveBtn.style.opacity = "0.5";
          saveBtn.style.cursor = "not-allowed";
      } else {
          saveBtn.style.opacity = "1";
          saveBtn.style.cursor = "pointer";
      }
  }

  menuItems.forEach((button) => {
    button.addEventListener("click", () => {
      const targetTab = button.getAttribute("data-tab");

      menuItems.forEach((btn) => btn.classList.remove("active"));
      tabPanes.forEach((pane) => pane.classList.remove("active"));

      button.classList.add("active");
      const selectedPane = document.getElementById(targetTab);
      if (selectedPane) {
        selectedPane.classList.add("active");
      }
    });
  });

  // get items from db and insert in profile page
  async function loadProfile() {
      try {

          const response = await fetch("/api/profile");

          if (!response.ok) {
              return;
          }

          const data = await response.json();


          document.getElementById("userEmail").value = data.email || "";
          document.getElementById("userFirstName").value = data.firstName || "";
          document.getElementById("userLastName").value = data.lastName || "";
          document.getElementById("userBirthdate").value = data.birthdate || "";
          document.querySelector(".user-name").textContent = `${data.firstName || ""} ${data.lastName || ""}`.trim();
      } catch (error) {
      }
  }

  editBtn.addEventListener("click", () => {

      profileFields.forEach(field => {
          originalValues[field.id] = field.value;
          field.removeAttribute("readonly");

          field.addEventListener("input", updateSaveButtonState);
      });

      editBtn.style.display = "none";
      saveBtn.style.display = "inline-block";
      cancelBtn.style.display = "inline-block";

      updateSaveButtonState();
  });

  cancelBtn.addEventListener("click", () => {

    profileFields.forEach(field => {
        field.value = originalValues[field.id];
        field.setAttribute("readonly", true);
    });

    editBtn.style.display = "inline-block";
    saveBtn.style.display = "none";
    cancelBtn.style.display = "none";
  });

  const saveModal = document.getElementById("saveProfileModal");
  const confirmSaveBtn = document.getElementById("confirmSaveBtn");
  const cancelSaveBtn = document.getElementById("cancelSaveBtn");

  saveBtn.addEventListener("click", () => {

      if (!hasChanges()) {
        return;
      }

      saveModal.classList.add("active");
  });


  // Saves the user changes to profile
  confirmSaveBtn.addEventListener("click", async () => {

      if (confirmSaveBtn.disabled) {
          return;
      }

      confirmSaveBtn.disabled = true;
      confirmSaveBtn.textContent = "Saving...";

      const payload = {
          email: document.getElementById("userEmail").value,
          birthdate: document.getElementById("userBirthdate").value,
          firstName: document.getElementById("userFirstName").value,
          lastName: document.getElementById("userLastName").value,
          password: document.getElementById("userPassword").value
      };

      
      //PUTS new items inside db (replacing old)
      try {
          showLoader();

          const response = await fetch("/api/profile", {
              method: "PUT",
              headers: {
                  "Content-Type": "application/json"
              },
              body: JSON.stringify(payload)
          });

          const result = await response.json();

          hideLoader();

          if (!response.ok) {
              throw new Error(result.message || "Save failed");
          }

      } catch (err) {
          hideLoader();


          confirmSaveBtn.disabled = false;
          confirmSaveBtn.textContent = "Save";

          alert("Failed to save profile.");
          return;
      }


      profileFields.forEach(field => {
          field.setAttribute("readonly", true);
      });

      editBtn.style.display = "inline-block";
      saveBtn.style.display = "none";
      cancelBtn.style.display = "none";

      saveModal.classList.remove("active");

      alert("Profile updated successfully.");

      profileFields.forEach(field => {
          originalValues[field.id] = field.value;
      });

      confirmSaveBtn.disabled = false;
      confirmSaveBtn.textContent = "Save";

      saveBtn.disabled = true;
      saveBtn.style.opacity = "0.5";
      saveBtn.style.cursor = "not-allowed";
  });

  cancelSaveBtn.addEventListener("click", () => {

    saveModal.classList.remove("active");

  });

  //logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      localStorage.removeItem("cart");   
      window.location.href = "/login";
    });
  }

  // Modal Handlers
  const addressModal = document.getElementById("addressModal");
  const openAddressBtn = document.getElementById("openAddressModalBtn");
  const closeAddressBtn = document.getElementById("closeAddressModal");

  const editAddressModal = document.getElementById("editAddressModal");
  const editAddressForm = document.getElementById("editAddressForm");
  const closeEditAddressModalBtn = document.getElementById("closeEditAddressModal");
  const cancelEditAddressBtn = document.getElementById("cancelEditAddressBtn");
  const saveEditedAddressBtn = document.getElementById("saveEditedAddressBtn");

  const editStreetAddressInput = document.getElementById("editStreetAddress");
  const editCityInput = document.getElementById("editCity");
  const editZipCodeInput = document.getElementById("editZipCode");
  let originalEditAddressValues = {
    streetAddress: "",
    city: "",
    zipCode: ""
  };

  const deleteAddressModal = document.getElementById("deleteAddressModal");
  const closeDeleteAddressModalBtn = document.getElementById("closeDeleteAddressModal");
  const cancelDeleteAddressBtn = document.getElementById("cancelDeleteAddressBtn");
  const confirmDeleteAddressBtn = document.getElementById("confirmDeleteAddressBtn");
  const deleteAddressPreview = document.getElementById("deleteAddressPreview");

  let addressPendingDeletion = null;

  const cardModal = document.getElementById("cardModal");
  const openCardBtn = document.getElementById("openCardModalBtn");
  const closeCardBtn = document.getElementById("closeCardModal");

  if (closeAddressBtn) closeAddressBtn.addEventListener("click", () => addressModal.classList.remove("active"));

  if (openCardBtn) openCardBtn.addEventListener("click", () => cardModal.classList.add("active"));
  if (closeCardBtn) closeCardBtn.addEventListener("click", () => cardModal.classList.remove("active"));

  window.addEventListener("click", (e) => {
    if (e.target === addressModal) addressModal.classList.remove("active");
    if (e.target === cardModal) cardModal.classList.remove("active");
    if (e.target === saveModal) saveModal.classList.remove("active");
    if (e.target === editAddressModal) {closeEditAddressModal();}
    if (e.target === deleteAddressModal) {closeDeleteAddressModal();}
  });

    // Dynamic Address Form Submission
    const addressForm = document.getElementById("addressForm");
    const addressListContainer = document.getElementById("addressListContainer");
    const saveAddressBtn = document.getElementById("saveAddressBtn");
    const streetAddressInput = document.getElementById("streetAddress");
    const cityInput = document.getElementById("city");
    const zipCodeInput = document.getElementById("zipCode");

    function updateAddressSaveButton() {

        const streetAddress = streetAddressInput.value.trim();

        const city = cityInput.value.trim();

        const zipCode = zipCodeInput.value.trim();

        const hasValues =
            streetAddress !== "" &&
            city !== "" &&
            zipCode !== "";

        saveAddressBtn.disabled = !hasValues;

        if (saveAddressBtn.disabled) {
            saveAddressBtn.style.opacity = "0.5";
            saveAddressBtn.style.cursor = "not-allowed";
        } else {
            saveAddressBtn.style.opacity = "1";
            saveAddressBtn.style.cursor = "pointer";
        }
    }

    if (openAddressBtn) openAddressBtn.addEventListener("click", () => {addressForm.reset(); updateAddressSaveButton(); addressModal.classList.add("active")});

    streetAddressInput.addEventListener(
        "input",
        updateAddressSaveButton
    );

    cityInput.addEventListener(
        "input",
        updateAddressSaveButton
    );

    zipCodeInput.addEventListener(
        "input",
        updateAddressSaveButton
    );

    // Elements now exist, so these are safe to call.
    updateAddressSaveButton();

if (addressForm) {
    addressForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (saveAddressBtn.disabled) {
            return;
        }

        const payload = {
            streetAddress:
                streetAddressInput.value.trim(),

            city:
                cityInput.value.trim(),

            zipCode:
                zipCodeInput.value.trim()
        };

        if (
            !payload.streetAddress ||
            !payload.city ||
            !payload.zipCode
        ) {
            updateAddressSaveButton();
            return;
        }

        saveAddressBtn.disabled = true;
        saveAddressBtn.textContent = "Saving...";

        try {
            const response = await fetch("/api/addresses", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error ||
                    "Unable to save address"
                );
            }

            addressForm.reset();
            addressModal.classList.remove("active");

            // Reload actual records from Turso.
            await loadAddresses();

        } catch (error) {
            hideLoader();

            alert(error.message || "Failed to save address.");

        } finally {
            hideLoader();
            saveAddressBtn.textContent = "Save Address";
            updateAddressSaveButton();
        }
    });
}
    //show addresses of logged in user
    async function loadAddresses() {
        try {
            const response =
                await fetch("/api/addresses");

            const result =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error ||
                    "Unable to load addresses"
                );
            }

            addressListContainer.innerHTML = "";

            result.forEach(address => {
                const card =
                    createAddressCard(address);

                addressListContainer.appendChild(card);
            });

        } catch (error) {
            hideLoader();
        }
    }

    // loads User's Vouchers
    async function loadVouchers() {
        try {
            const response = await fetch("/vouchers/me");
            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error ||
                    "Unable to load vouchers"
                );
            }
            renderVouchers(result);
        } catch (error) {
        }
    }

    function renderVouchers(vouchers) {
        const container =
            document.getElementById(
                "vouchersListContainer"
            );

        if (!container) {
            return;
        }

        container.innerHTML = "";

        if (!vouchers.length) {
            container.innerHTML = `
                <div class="voucher-card">
                    <p>No vouchers available.</p>
                </div>
            `;
            return;
        }

        vouchers.forEach(voucher => {
            const card = document.createElement("div");
            card.className = "voucher-card";
            card.innerHTML = `
                <div class="voucher-header">
                    <strong>
                        ${voucher.Voucher_name}
                    </strong>

                    <span class="voucher-status">
                        Unused
                    </span>
                </div>

                <div class="voucher-body">
                    ${voucher.Voucher_desc}
                </div>
            `;
            container.appendChild(card);
        });

    }
    
    //loads wishlist of logged in user
    async function loadWishlist() {

        try {

            const response =
                await fetch("/api/fetchWishlist");

            const wishlist =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    wishlist.error ||
                    "Unable to load wishlist"
                );
            }

            const container =
                document.getElementById(
                    "wishlistContainer"
                );

            container.innerHTML = "";

            if (!wishlist.length) {

                container.innerHTML = `
                    <div class="radius-10-box large-box">
                        <p class="empty-text">
                            No wishlist items found.
                        </p>
                    </div>
                `;

                return;
            }

            wishlist.forEach(item => {

                const card =
                    document.createElement("div");

                card.className =
                    "wishlist-item";

                card.innerHTML = `
                    <div class="wishlist-left">
                        <img
                            class="wishlist-image"
                            src="${item.product_image}"
                            alt="${item.product_name}"
                        />
                        <div class="wishlist-info">
                            <h4>${item.product_name}</h4>
                            <p>₱${Number(item.product_price).toFixed(2)}</p>
                        </div>
                    </div>

                    <div class="wishlist-actions">
                        <button
                            type="button"
                            class="wishlist-view-btn"
                            data-product-id="${item.product_id}"
                        >
                            Go To
                        </button>

                        <button
                            type="button"
                            class="wishlist-delete-btn"
                            data-product-id="${item.product_id}"
                        >
                            Delete
                        </button>
                    </div>
                `;

                card.querySelector(".wishlist-view-btn")
                    .addEventListener("click", () => {
                        goToWishlistProduct(item.product_id);
                    });

                card.querySelector(".wishlist-delete-btn")
                    .addEventListener("click", () => {
                        removeWishlistItem(item.product_id);
                    });

                container.appendChild(card);

            });

        } catch (error) {


        }

    }

    async function removeWishlistItem(productId) {
        try {

            const response = await fetch(
                    `/api/removeWishlist/${productId}`,
                    { method: "DELETE" }
                );

            if (!response.ok) { 
                throw new Error(
                    "Delete failed"
                );
            }
            loadWishlist();

        } catch (error) {


        }

    }

    function goToWishlistProduct(productId) {
        window.location.href = `/product?productId=${productId}`;

    }

    function hasEditedAddressChanges() {
        const currentStreetAddress =
            editStreetAddressInput.value.trim();

        const currentCity =
            editCityInput.value.trim();

        const currentZipCode =
            editZipCodeInput.value.trim();

        const hasCompleteAddress =
            currentStreetAddress !== "" &&
            currentCity !== "" &&
            currentZipCode !== "";

        const hasChanges =
            currentStreetAddress !==
                originalEditAddressValues.streetAddress ||
            currentCity !==
                originalEditAddressValues.city ||
            currentZipCode !==
                originalEditAddressValues.zipCode;

        return hasCompleteAddress && hasChanges;
    }

    function updateEditedAddressSaveButton() {
        saveEditedAddressBtn.disabled =
            !hasEditedAddressChanges();
    }

    function openEditAddressModal(address) {
        const streetAddress = address.Street_address || "";
        const city = address.City || "";
        const zipCode = String(address.Zip_code || "");

        document.getElementById("editAddressId").value = address.Address_id;
        editStreetAddressInput.value = streetAddress;
        editCityInput.value = city;
        editZipCodeInput.value = zipCode;

        originalEditAddressValues = {
            streetAddress: streetAddress.trim(),
            city: city.trim(),
            zipCode: zipCode.trim()
        };

        updateEditedAddressSaveButton();
        editAddressModal.classList.add("active");
    }

    editStreetAddressInput.addEventListener("input",updateEditedAddressSaveButton);
    editCityInput.addEventListener("input",updateEditedAddressSaveButton);
    editZipCodeInput.addEventListener("input",updateEditedAddressSaveButton);

    function closeEditAddressModal() {
        editAddressModal.classList.remove("active");
        editAddressForm.reset();

        originalEditAddressValues = {
            streetAddress: "",
            city: "",
            zipCode: ""
        };

        saveEditedAddressBtn.disabled = true;
        saveEditedAddressBtn.textContent = "Save";
    }

    closeEditAddressModalBtn.addEventListener("click",closeEditAddressModal);
    cancelEditAddressBtn.addEventListener("click",closeEditAddressModal);

    function createAddressCard(address) {
        const card = document.createElement("div");
        card.className = "radius-10-box readonly-box address-card";
        card.dataset.addressId = address.Address_id;
        const addressContent = document.createElement("div");
        addressContent.className = "address-card-content";
        const street = document.createElement("strong");
        street.textContent = address.Street_address;
        const location = document.createElement("span");
        location.className = "address-location";

        location.textContent = 
            `${address.City}, ${address.Zip_code}`;

        addressContent.appendChild(street);
        addressContent.appendChild(location);

        const actionContainer = document.createElement("div");

        actionContainer.className = "address-actions";

        const editButton = document.createElement("button");

        editButton.type = "button";
        editButton.className = "address-edit-btn";
        editButton.textContent = "Edit";

        editButton.addEventListener("click", () => {
            openEditAddressModal(address);
        });

        const deleteButton = document.createElement("button");

        deleteButton.type = "button";
        deleteButton.className = "address-delete-btn";

        deleteButton.textContent = "Delete";

        deleteButton.addEventListener("click", () => {
            openDeleteAddressModal(address);
        });

        actionContainer.appendChild(editButton);
        actionContainer.appendChild(deleteButton);

        card.appendChild(addressContent);
        card.appendChild(actionContainer);

        return card;
    }

    // Submit Handler for edit address form
    editAddressForm.addEventListener(
        "submit", async (e) => {

            e.preventDefault();
            if (saveEditedAddressBtn.disabled || !hasEditedAddressChanges()) {
                return;
            }
            const addressId = document.getElementById("editAddressId").value;

            const payload = {
                streetAddress:
                    editStreetAddressInput.value.trim(),

                city:
                    editCityInput.value.trim(),

                zipCode:
                    editZipCodeInput.value.trim(),
            };
            saveEditedAddressBtn.disabled = true;
            saveEditedAddressBtn.textContent =
                "Saving...";
            try {
                const response = await fetch(
                    `/api/addresses/${addressId}`,
                    {
                        method: "PUT",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify(payload)
                    }
                );

                const result =
                    await response.json();
                if (!response.ok) {
                    throw new Error(
                        result.error ||
                        "Unable to update address"
                    );
                }
                closeEditAddressModal();
                // Reload addresses from the database.
                await loadAddresses();
            } catch (error) {
                hideLoader();
                alert(
                    error.message ||
                    "Failed to update address."
                );
            } finally {
                hideLoader();
                saveEditedAddressBtn.textContent = "Save";

                if (editAddressModal.classList.contains("active")) {
                    updateEditedAddressSaveButton();
                }
            }
        }
    );

    function openDeleteAddressModal(address) {
        addressPendingDeletion = address;

        deleteAddressPreview.textContent =
            `${address.Street_address}, ` +
            `${address.City}, ` +
            `${address.Zip_code}`;

        deleteAddressModal.classList.add("active");
    }

    function closeDeleteAddressModal() {
        deleteAddressModal.classList.remove("active");

        deleteAddressPreview.textContent = "";

        addressPendingDeletion = null;

        confirmDeleteAddressBtn.disabled = false;
        confirmDeleteAddressBtn.textContent = "Delete";
    }

    closeDeleteAddressModalBtn.addEventListener("click",closeDeleteAddressModal);
    cancelDeleteAddressBtn.addEventListener("click",closeDeleteAddressModal);

    confirmDeleteAddressBtn.addEventListener(
        "click",
        async () => {
            if (
                !addressPendingDeletion ||
                confirmDeleteAddressBtn.disabled
            ) {
                return;
            }

            const addressId = addressPendingDeletion.Address_id;
            confirmDeleteAddressBtn.disabled = true;
            confirmDeleteAddressBtn.textContent = "Deleting...";

            try {
                const response = await fetch(
                    `/api/addresses/${addressId}`,
                    {
                        method: "DELETE"
                    }
                );

                const contentType = response.headers.get("content-type") || "";

                if (!contentType.includes("application/json")) {
                    const responseText = await response.text();

                    throw new Error("The server returned an invalid response");
                }

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(
                        result.error ||
                        "Unable to delete address"
                    );
                }

                closeDeleteAddressModal();

                // Reload directly from Turso.
                await loadAddresses();

            } catch (error) {
                hideLoader();

                alert(
                    error.message ||
                    "Failed to delete address."
                );

                confirmDeleteAddressBtn.disabled = false;
                confirmDeleteAddressBtn.textContent =
                    "Delete";
            }
        }
    );

    document.addEventListener("click", function(event) {
        if (event.target.id === "viewOrdersBtn") {
            window.location.href = "/user/order";
        }
    });

    // Dynamic Card Form Submission
    const cardForm = document.getElementById("cardForm");
    const paymentListContainer = document.getElementById("paymentListContainer");

    if (cardForm) {
        cardForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const cardHolder = document.getElementById("cardHolder").value;
        const cardNumber = document.getElementById("cardNumber").value;
        const expiryDate = document.getElementById("expiryDate").value;

        const lastFour = cardNumber.slice(-4) || "0000";

        const card = document.createElement("div");
        card.className = "radius-10-box readonly-box";
        card.innerHTML = `
            <strong>${cardHolder} | **** **** **** ${lastFour}</strong><br>
            <span style="color:#666;">Expires: ${expiryDate}</span>
        `;

        paymentListContainer.appendChild(card);
        cardForm.reset();
        cardModal.classList.remove("active");
        });
    }
});
