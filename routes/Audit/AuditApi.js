const express = require("express");
const router = express.Router();
const db = require("../../imports/database");
const { requireAuth } = require("../../imports/token");
const { logAudit, getAdminId, AUDIT_TYPES } = require("./AuditImport");

// Mounted at /admin/api/audit  (GET /admin/api/audit, GET /admin/api/audit/export)
router.customPath = "/admin/api/audit";


// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// Shown as "Y. Sang" in the feed; falls back to "System" when Admin_id is NULL
const ACTOR_NAME_SQL = `COALESCE(SUBSTR(ad.First_name, 1, 1) || '. ' || ad.Last_name, 'System')`;

function getPaging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  return { page, limit, offset: (page - 1) * limit };
}

// Escape % and _ so user input is matched literally in LIKE
function likeParam(text) {
  return `%${String(text).replace(/[\\%_]/g, "\\$&")}%`;
}

// ---------------------------------------------------------------------------
// FILTERS
// ---------------------------------------------------------------------------
function buildAuditFilter(query) {
  const where = [];
  const args = [];

  if (query.type && AUDIT_TYPES.includes(query.type)) {
    where.push("a.action_type = ?");
    args.push(query.type);
  }
  if (query.search) {
    where.push(
      "((ad.First_name || ' ' || ad.Last_name) LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\')"
    );
    const like = likeParam(query.search);
    args.push(like, like);
  }

  // range: today | week | month | (omit for all time)
  const ranges = {
    today: "date(a.action_date) = date('now')",
    week: "datetime(a.action_date) >= datetime('now', '-7 days')",
    month: "datetime(a.action_date) >= datetime('now', '-30 days')",
  };
  if (ranges[query.range]) where.push(ranges[query.range]);

  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", args };
}

// ---------------------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------------------

// GET /admin/api/audit?type=&search=&range=&page=&limit=
router.get("/", requireAuth("admin"), async (req, res) => {
  try {
    const { page, limit, offset } = getPaging(req.query);
    const { whereSql, args } = buildAuditFilter(req.query);

    const countResult = await db.execute({
      sql: `
        SELECT COUNT(*) AS total
        FROM Audit a
        LEFT JOIN Admin ad ON a.Admin_id = ad.Admin_id
        ${whereSql}
      `,
      args,
    });
    const total = Number(countResult.rows[0].total);

    const result = await db.execute({
      sql: `
        SELECT
          a.Audit_log_id,
          a.Admin_id,
          ${ACTOR_NAME_SQL} AS actor_name,
          a.action_type,
          a.description,
          strftime('%Y-%m-%dT%H:%M:%SZ', a.action_date) AS action_date
        FROM Audit a
        LEFT JOIN Admin ad ON a.Admin_id = ad.Admin_id
        ${whereSql}
        ORDER BY a.action_date DESC, a.Audit_log_id DESC
        LIMIT ? OFFSET ?
      `,
      args: [...args, limit, offset],
    });

    res.json({
      logs: result.rows,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Error loading audit logs:", error);
    res.status(500).json({ error: "Unable to load audit trail" });
  }
});

router.get("/export", requireAuth("admin"), async (req, res) => {
  try {
    const { whereSql, args } = buildAuditFilter(req.query);
    const result = await db.execute({
      sql: `
        SELECT
          a.Audit_log_id,
          a.action_date,
          ${ACTOR_NAME_SQL} AS actor_name,
          a.action_type,
          a.description
        FROM Audit a
        LEFT JOIN Admin ad ON a.Admin_id = ad.Admin_id
        ${whereSql}
        ORDER BY a.action_date DESC, a.Audit_log_id DESC
      `,
      args,
    });

    const cols = ["Audit_log_id", "action_date", "actor_name", "action_type", "description"];
    const csvCell = (v) => {
      if (v === null || v === undefined) return "";
      return `"${String(v).replace(/"/g, '""')}"`;
    };
    const lines = [cols.join(",")];
    for (const row of result.rows) lines.push(cols.map((c) => csvCell(row[c])).join(","));

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-trail-${Date.now()}.csv"`);
    res.send(lines.join("\n"));
  } catch (error) {
    console.error("Error exporting audit logs:", error);
    res.status(500).json({ error: "Unable to export audit trail" });
  }
});

module.exports = router;
// module.exports.logAudit = logAudit;
// module.exports.getAdminId = getAdminId;