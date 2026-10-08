// AuditJS.js
// Audit Trail page. Reads real logs from GET /admin/api/audit
// (auditApi.js) and keeps the existing markup/classes from Audit.html.

document.addEventListener("DOMContentLoaded", () => {
  const API = "/admin/api";
  const PAGE_SIZE = 10;

  // The "Sort by" button cycles through these time ranges
  const RANGES = [
    { key: "week", label: "this week" },
    { key: "today", label: "today" },
    { key: "month", label: "this month" },
    { key: "all", label: "all time" },
  ];

  const tabs = document.querySelectorAll("#actionTabs .tab");
  const logList = document.getElementById("logList");
  const searchInput = document.getElementById("logSearch");
  const exportBtn = document.getElementById("exportBtn");
  const sortBtn = document.getElementById("sortBtn");
  const pageIndicator = document.getElementById("pageIndicator");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");

  const state = { type: "all", search: "", rangeIndex: 0, page: 1, totalPages: 1 };
  let requestCounter = 0; // ignore out-of-date responses while typing/clicking fast

  // ---------- Icons (same SVGs as the original static rows) ----------
  const ICONS = {
    deleted: {
      cls: "log-icon-delete",
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>',
    },
    updated: {
      cls: "log-icon-update",
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',
    },
    created: {
      cls: "log-icon-create",
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    },
    "sign-in": {
      cls: "log-icon-signin",
      svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg>',
    },
  };

  // ---------- Helpers ----------
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Escape first (so nothing can inject HTML), then bold the "quoted" names
  function formatDescription(text) {
    return esc(text).replace(/&quot;(.+?)&quot;/g, "<strong>&quot;$1&quot;</strong>");
  }

  // "Today: 2:41PM", "Yesterday: 9:05AM", "Oct 5: 4:10PM"
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
    if (state.type !== "all") params.set("type", state.type);
    if (state.search) params.set("search", state.search);
    const range = RANGES[state.rangeIndex].key;
    if (range !== "all") params.set("range", range);
    return params;
  }

  async function api(path) {
    const res = await fetch(`${API}${path}`, { credentials: "same-origin" });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      /* non-JSON response */
    }
    if (!res.ok) {
      const error = new Error((data && data.error) || `Request failed (${res.status})`);
      error.status = res.status;
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
      .map((log) => {
        const icon = ICONS[log.action_type] || ICONS.updated;
        return `
          <li class="log-row" data-type="${esc(log.action_type)}">
            <span class="log-icon ${icon.cls}" aria-hidden="true">${icon.svg}</span>
            <p class="log-text"><strong>${esc(log.actor_name)}</strong> ${formatDescription(log.description)}</p>
            <span class="log-time">${esc(formatTime(log.action_date))}</span>
          </li>`;
      })
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
      const data = await api(`/audit?${buildQuery({ page: state.page, limit: PAGE_SIZE })}`);
      if (requestId !== requestCounter) return; // a newer request replaced this one

      state.totalPages = data.totalPages;

      // e.g. the last page no longer exists after filtering
      if (state.page > data.totalPages) {
        state.page = data.totalPages;
        return loadLogs();
      }

      renderLogs(data.logs);
      updatePager();
    } catch (error) {
      if (requestId !== requestCounter) return;
      console.error("Failed to load audit trail:", error);
      showMessage(
        error.status === 401 || error.status === 403
          ? "You are not authorized to view the audit trail."
          : "Failed to load the audit trail. Please try again."
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
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      state.type = tab.dataset.filter;
      reloadFromFirstPage();
    });
  });

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
      // Exports everything that matches the current tab, search and range
      window.location.href = `${API}/audit/export?${buildQuery()}`;
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

  // ---------- Start ----------
  updateSortLabel();
  loadLogs();
});