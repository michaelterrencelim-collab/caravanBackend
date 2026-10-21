require("dotenv").config();

const readline = require("readline");
const db = require("../imports/database");

function ask(prompt) {
  return new Promise((resolve) => {
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    terminal.question(prompt, (answer) => {
      terminal.close();
      resolve(answer.trim());
    });
  });
}

function askSecret(prompt) {
  const input = process.stdin;
  const output = process.stdout;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Run this command in an interactive terminal so the password is not echoed.");
  }

  output.write(prompt);
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error) => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      const key = chunk.toString("utf8");
      if (key === "\u0003") return finish(new Error("Cancelled."));
      if (key === "\r" || key === "\n") return finish();
      if (key === "\u007f" || key === "\b") {
        value = Array.from(value).slice(0, -1).join("");
        return;
      }
      if (!key.startsWith("\u001b")) value += key;
    };
    input.on("data", onData);
  });
}

async function main() {
  if (!process.env.TURSO_LINK) throw new Error("TURSO_LINK is missing from the local .env file.");
  const databaseHost = new URL(process.env.TURSO_LINK).host;
  process.stdout.write(`Database host from local .env: ${databaseHost}\n`);
  process.stdout.write("Confirm this is the database used by the site before continuing.\n");
  const confirmedHost = await ask("Type the database host exactly to continue: ");
  if (confirmedHost !== databaseHost) throw new Error("Database host confirmation did not match; no password was changed.");

  const email = await ask("Admin email to recover: ");
  if (!email) throw new Error("Admin email is required.");

  const accountResult = await db.execute({
    sql: `SELECT Admin_id, Admin_email, Account_status
          FROM Admin
          WHERE LOWER(TRIM(Admin_email)) = LOWER(?)`,
    args: [email],
  });
  if (accountResult.rows.length !== 1) {
    throw new Error("Expected exactly one matching admin account; no password was changed.");
  }

  const account = accountResult.rows[0];
  const status = String(account.Account_status || "").trim().toLowerCase();
  if (!["enabled", "active"].includes(status)) {
    throw new Error(`This account status is ${account.Account_status || "unset"}. Password reset stopped; no status was changed.`);
  }

  process.stdout.write(`Target: ${account.Admin_email} (admin #${account.Admin_id}, ${account.Account_status})\n`);
  const confirmation = await ask('Type RESET to replace this account password with a plaintext value: ');
  if (confirmation !== "RESET") throw new Error("Confirmation did not match; no password was changed.");

  const password = await askSecret("New admin password (input hidden): ");
  if (password.length < 6 || password.length > 255) {
    throw new Error("Password must be between 6 and 255 characters.");
  }

  const updated = await db.execute({
    sql: "UPDATE Admin SET Admin_password = ? WHERE Admin_id = ?",
    args: [password, account.Admin_id],
  });
  if (Number(updated.rowsAffected || 0) !== 1) {
    throw new Error("Database did not update exactly one admin account.");
  }

  process.stdout.write(`Password reset for ${account.Admin_email}. Sign in with the new password you entered.\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await db.close(); } catch (_) { /* close if the client is still available */ }
  });
