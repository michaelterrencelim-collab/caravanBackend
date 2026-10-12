const express = require("express");
const app = express.Router();
const db = require("../../imports/database");
const { requireAuth } = require("../../imports/token");
app.customPath = "/api";

const adminOnly = requireAuth("admin");
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const ACTOR_NAME_SQL = `COALESCE(SUBSTR(ad.First_name, 1, 1) || '. ' || ad.Last_name, 'System')`;

function getPaging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));
  return { page, limit, offset: (page - 1) * limit };
}

function likeParam(text) {
  return `%${String(text).replace(/[\\%_]/g, "\\$&")}%`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function buildFilter(query) {
  const where = [];
  const args = [];

  if (query.search) {
    where.push(
      "((ad.First_name || ' ' || ad.Last_name) LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\')"
    );
    const like = likeParam(query.search);
    args.push(like, like);
  }

  const ranges = {
    today: "date(a.action_date) = date('now')",
    week: "datetime(a.action_date) >= datetime('now', '-7 days')",
    month: "datetime(a.action_date) >= datetime('now', '-30 days')",
  };
  if (ranges[query.range]) where.push(ranges[query.range]);

  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", args };
}

app.get("/fetchAuditLogs", adminOnly, async (req, res) => {
  try {
    const { page, limit, offset } = getPaging(req.query);
    const { whereSql, args } = buildFilter(req.query);

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
          ${ACTOR_NAME_SQL} AS actor_name,
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
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

app.get("/exportAuditLogs", adminOnly, async (req, res) => {
  try {
    const { whereSql, args } = buildFilter(req.query);
    const result = await db.execute({
      sql: `
        SELECT
          a.Audit_log_id,
          a.action_date,
          ${ACTOR_NAME_SQL} AS actor_name,
          a.description
        FROM Audit a
        LEFT JOIN Admin ad ON a.Admin_id = ad.Admin_id
        ${whereSql}
        ORDER BY a.action_date DESC, a.Audit_log_id DESC
      `,
      args,
    });

    const lines = [["Log ID", "Date", "Admin", "Action"].map(csvCell).join(",")];
    for (const r of result.rows) {
      lines.push([r.Audit_log_id, r.action_date, r.actor_name, r.description].map(csvCell).join(","));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-trail-${Date.now()}.csv"`);
    res.send("\ufeff" + lines.join("\n"));
  } catch (error) {
    console.error("Error exporting audit logs:", error);
    res.status(500).json({ error: "Failed to export audit logs" });
  }
});

module.exports = app;