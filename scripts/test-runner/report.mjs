// Aggregated report: writes test-report/summary.json and a self-contained
// test-report/index.html, then opens it on macOS.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { REPORT_DIR, fmtDuration } from "./util.mjs";

const STATUS = {
    passed: { label: "PASSED", color: "#1a7f37", bg: "#dafbe1" },
    failed: { label: "FAILED", color: "#cf222e", bg: "#ffebe9" },
    error: { label: "ERROR", color: "#cf222e", bg: "#ffebe9" },
    skipped: { label: "SKIPPED", color: "#9a6700", bg: "#fff8c5" },
    "not-present": { label: "NOT PRESENT", color: "#57606a", bg: "#eaeef2" },
};

function esc(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function writeReport(results, meta) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    fs.writeFileSync(
        path.join(REPORT_DIR, "summary.json"),
        JSON.stringify({ meta, results }, null, 2),
    );

    const counts = (st) => results.filter((r) => r.status === st).length;
    const overall =
        counts("failed") + counts("error") > 0
            ? "failed"
            : counts("passed") > 0
              ? "passed"
              : "skipped";

    const rows = results
        .map((r) => {
            const st = STATUS[r.status] || STATUS.error;
            const cells = r.counts
                ? `${r.counts.passed}/${r.counts.total}` +
                  (r.counts.failed ? ` · ${r.counts.failed} failed` : "") +
                  (r.counts.skipped ? ` · ${r.counts.skipped} skipped` : "")
                : "—";
            const links = [];
            if (r.logFile)
                links.push(
                    `<a href="logs/${esc(r.id)}.log">log</a>`,
                );
            if (r.reportLink)
                links.push(
                    `<a href="../${esc(r.reportLink)}/index.html">report</a>`,
                );
            return `<tr>
        <td><span class="badge" style="color:${st.color};background:${st.bg}">${st.label}</span></td>
        <td class="name">${esc(r.name)}${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}</td>
        <td class="tier">${esc(r.tier)}</td>
        <td class="counts">${cells}</td>
        <td class="dur">${r.durationMs != null ? fmtDuration(r.durationMs) : "—"}</td>
        <td class="links">${links.join(" · ") || "—"}</td>
      </tr>`;
        })
        .join("\n");

    const ost = STATUS[overall];
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Modelibr — Local Test Report</title>
<style>
  :root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  body { margin: 0; background: #f6f8fa; color: #1f2328; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #57606a; font-size: 13px; margin-bottom: 24px; }
  .hero { display:flex; align-items:center; gap:16px; padding:18px 20px; border-radius:10px;
          background:${ost.bg}; color:${ost.color}; font-weight:700; font-size:18px; margin-bottom:24px; }
  .hero .pills { margin-left:auto; display:flex; gap:8px; font-size:13px; font-weight:600; }
  .pill { background:rgba(255,255,255,.6); border-radius:20px; padding:3px 12px; color:#1f2328; }
  table { width:100%; border-collapse: collapse; background:#fff; border:1px solid #d0d7de; border-radius:10px; overflow:hidden; }
  th, td { text-align:left; padding:11px 14px; font-size:13px; border-bottom:1px solid #eaeef2; }
  th { background:#f6f8fa; color:#57606a; font-weight:600; text-transform:uppercase; font-size:11px; letter-spacing:.04em; }
  tr:last-child td { border-bottom:none; }
  .badge { font-size:11px; font-weight:700; padding:3px 9px; border-radius:20px; white-space:nowrap; }
  .name { font-weight:600; }
  .note { font-weight:400; color:#9a6700; font-size:11px; margin-top:3px; }
  .tier { color:#57606a; }
  .dur, .counts { color:#57606a; white-space:nowrap; }
  .links a { color:#0969da; text-decoration:none; }
  .links a:hover { text-decoration:underline; }
  footer { color:#8c959f; font-size:12px; margin-top:20px; }
</style></head>
<body><div class="wrap">
  <h1>Modelibr — Local Test Report</h1>
  <div class="sub">${esc(meta.host)} · ${esc(meta.platform)} · node ${esc(meta.node)} · branch ${esc(meta.branch)} · ${esc(meta.finishedAt)}</div>
  <div class="hero">
    ${ost.label}
    <div class="pills">
      <span class="pill">${counts("passed")} passed</span>
      <span class="pill">${counts("failed") + counts("error")} failed</span>
      <span class="pill">${counts("skipped")} skipped</span>
      <span class="pill">${counts("not-present")} n/a</span>
      <span class="pill">${fmtDuration(meta.durationMs)} total</span>
    </div>
  </div>
  <table>
    <thead><tr><th>Status</th><th>Suite</th><th>Tier</th><th>Tests</th><th>Time</th><th>Artifacts</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <footer>Generated by scripts/test-runner · re-run with <code>npm run test:all</code></footer>
</div></body></html>`;

    const htmlPath = path.join(REPORT_DIR, "index.html");
    fs.writeFileSync(htmlPath, html);
    return htmlPath;
}

export function openReport(htmlPath) {
    try {
        if (process.platform === "darwin") {
            execSync(`open "${htmlPath}"`, { stdio: "ignore" });
        } else if (process.platform === "linux") {
            execSync(`xdg-open "${htmlPath}"`, { stdio: "ignore" });
        }
    } catch {
        // Non-fatal: the path is printed by the caller anyway.
    }
}
