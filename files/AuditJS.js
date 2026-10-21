document.addEventListener("DOMContentLoaded", () => {
  const API = "/api";
  const PAGE_SIZE = 10;
  const RANGES = [
    { key: "today", label: "today" },
    { key: "week", label: "this week" },
    { key: "month", label: "this month" },
    { key: "all", label: "all time" },
  ];

  const logList = document.getElementById("logList");
  const searchInput = document.getElementById("logSearch");
  const exportBtn = document.getElementById("exportBtn");
  const sortBtn = document.getElementById("sortBtn");
  const pageIndicator = document.getElementById("pageIndicator");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const tabs = document.getElementById("actionTabs");
  if (tabs) tabs.style.display = "none";
  if (sortBtn) sortBtn.style.marginLeft = "auto";

  const state = { search: "", rangeIndex: 0, page: 1, totalPages: 1 };
  let requestCounter = 0; 

  const ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h9l3 3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke-linejoin="round"/><path d="M9 11h6M9 15h6" stroke-linecap="round"/></svg>';

  // ---------- Helpers ----------
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function formatDescription(text) {
    return esc(text).replace(/&quot;(.+?)&quot;/g, "<strong>&quot;$1&quot;</strong>");
  }
  function formatTime(isoString) {
    const date = new Date(isoString);
    if (isNaN(date)) return "";

    const clock = date
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      .replace(/\s/g, "");

    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);

    if (dayDiff === 0) return `Today: ${clock}`;
    if (dayDiff === 1) return `Yesterday: ${clock}`;
    const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${day}: ${clock}`;
  }

  function buildQuery(extra = {}) {
    const params = new URLSearchParams(extra);
    if (state.search) params.set("search", state.search);
    const range = RANGES[state.rangeIndex].key;
    if (range !== "all") params.set("range", range);
    return params;
  }

  // fetch -> check response -> JSON (same checks productpage.js does)
  async function api(path) {
    const res = await fetch(`${API}${path}`, { credentials: "same-origin" });
    const isJson = (res.headers.get("content-type") || "").includes("application/json");

    let data = null;
    if (isJson) {
      try {
        data = await res.json();
      } catch (_) {
        /* ignore */
      }
    }

    if (!res.ok) {
      const error = new Error((data && data.error) || `Request failed (${res.status})`);
      error.status = res.status;
      throw error;
    }
    if (res.redirected || !isJson) {
      const error = new Error("The server sent back a page instead of data. Are you signed in as an admin?");
      error.status = 401;
      throw error;
    }
    return data;
  }

  // ---------- Rendering ----------
  function showMessage(text) {
    logList.innerHTML = `<li class="log-row"><p class="log-text">${esc(text)}</p></li>`;
  }

  function renderLogs(logs) {
    if (!logs.length) {
      showMessage("No logs found.");
      return;
    }

    logList.innerHTML = logs
      .map(
        (log) => `
          <li class="log-row">
            <span class="log-icon log-icon-signin" aria-hidden="true">${ICON}</span>
            <p class="log-text"><strong>${esc(log.actor_name)}</strong> ${formatDescription(log.description)}</p>
            <span class="log-time">${esc(formatTime(log.action_date))}</span>
          </li>`
      )
      .join("");
  }

  function updatePager() {
    pageIndicator.textContent = `${state.page} out of ${state.totalPages} pages`;
    prevPageBtn.disabled = state.page <= 1;
    nextPageBtn.disabled = state.page >= state.totalPages;
    prevPageBtn.style.opacity = prevPageBtn.disabled ? "0.35" : "";
    nextPageBtn.style.opacity = nextPageBtn.disabled ? "0.35" : "";
  }

  function updateSortLabel() {
    const textNode = [...sortBtn.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    const label = `Sort by: ${RANGES[state.rangeIndex].label}`;
    if (textNode) textNode.textContent = ` ${label} `;
    else sortBtn.prepend(document.createTextNode(` ${label} `));
  }

  // ---------- Loading ----------
  async function loadLogs() {
    const requestId = ++requestCounter;
    showMessage("Loading logs...");

    try {
      const data = await api(`/fetchAuditLogs?${buildQuery({ page: state.page, limit: PAGE_SIZE })}`);
      if (requestId !== requestCounter) return; // a newer request replaced this one

      state.totalPages = data.totalPages;
      if (state.page > data.totalPages) {
        state.page = data.totalPages;
        return loadLogs();
      }

      renderLogs(data.logs);
      updatePager();
    } catch (error) {
      if (requestId !== requestCounter) return;
      showMessage(
        error.status === 401 || error.status === 403
          ? `You are not signed in as an admin (${error.status}).`
          : `Failed to load the audit trail: ${error.message}`
      );
      state.totalPages = 1;
      updatePager();
    }
  }

  function reloadFromFirstPage() {
    state.page = 1;
    loadLogs();
  }

  // ---------- Events ----------
  let searchTimer;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = searchInput.value.trim();
        reloadFromFirstPage();
      }, 300);
    });
  }

  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      state.rangeIndex = (state.rangeIndex + 1) % RANGES.length;
      updateSortLabel();
      reloadFromFirstPage();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      window.location.href = `${API}/exportAuditLogs?${buildQuery()}`;
    });
  }

  prevPageBtn.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      loadLogs();
    }
  });

  nextPageBtn.addEventListener("click", () => {
    if (state.page < state.totalPages) {
      state.page += 1;
      loadLogs();
    }
  });

  updateSortLabel();
  loadLogs();
});
