"use strict";

// Test Studio UI — organized, filterable lists with honest CI-lane info.
// Routes:
//   #/                      home: areas + suites (lists)
//   #/e2e                   all scenarios — filter by area / runs-on, sortable
//   #/e2e/<folder>          same list pre-filtered to one area
//   #/scenario/<file>/<i>   scenario detail + run builder
//   #/backend               all .NET tests — filter by project / type
//   #/frontend  #/asset-processor   unit cases — filter by file
//   #/suite/<id>            suite detail
//   #/unit/<suiteId>/<source>/<name>  single unit test + filtered run
// Typing 2+ chars in the top search overlays a global search page.

const state = { catalog: null, history: null, summary: null, interactive: false, q: "" };

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Strip all CSI escape sequences (colors AND cursor/erase codes like \x1b[2K).
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

function fmtSec(s) {
    if (s == null) return "—";
    if (s < 90) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function fmtMs(ms) {
    if (ms == null) return "—";
    return fmtSec(Math.round(ms / 1000));
}

// "09-sounds" -> "Sounds"
function human(name) {
    if (!name || name === ".") return "General";
    return name
        .replace(/^\d+[-_.]?/, "")
        .split(/[-_]/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ") || name;
}

const suiteById = (id) => state.catalog.suites.find((s) => s.id === id);
const githubAvg = (suite) => {
    const b = (suite?.ci || []).find((x) => x.github);
    return b ? b.github.avgSec : null;
};
const localAvg = (suiteId) => {
    const live = state.history?.bySuite?.[suiteId];
    return (live || suiteById(suiteId)?.local)?.avg ?? null;
};

// ── CI lanes ─────────────────────────────────────────────────────────────────
// Where a scenario actually executes, derived from its (feature + scenario)
// tags and how the runners slice the projects:
//   PR job (test:ci --fast-only) = setup + untagged "chromium" scenarios
//   nightly workflow             = @slow only
//   @serial                      = local full runs only — never on GitHub
//   @performance                 = opt-in only
const LANES = {
    pr:      { label: "every PR",   cls: "green",
               desc: "Runs in the <b>E2E Tests</b> job on every GitHub PR, and locally in the fast tier." },
    nightly: { label: "nightly",    cls: "accent",
               desc: "Tagged <b>@slow</b> — runs in the nightly GitHub workflow (3:00 UTC) and locally in <b>e2e-full</b>." },
    local:   { label: "local only", cls: "amber",
               desc: "Tagged <b>@serial</b> — runs only in local full runs (<b>e2e-full</b> / <b>test:all</b>). It is NOT part of any GitHub job." },
    manual:  { label: "manual",     cls: "gray",
               desc: "Tagged <b>@performance</b> — opt-in only (<b>test:performance</b>); not in CI and excluded from normal local runs." },
    setup:   { label: "setup",      cls: "gray",
               desc: "Seed scenario — runs first in every E2E flow (CI and local) to create shared test data." },
};
const LANE_ORDER = ["pr", "nightly", "local", "manual", "setup"];

function laneOf(feature, sc) {
    const names = new Set([
        ...(feature.featureTags || []).map((t) => t.name),
        ...sc.tags.map((t) => t.split(":")[0]),
    ]);
    if (names.has("setup")) return "setup";
    if (names.has("performance")) return "manual";
    if (names.has("slow")) return "nightly";
    if (names.has("serial")) return "local";
    return "pr";
}
function laneBadge(lane) {
    const l = LANES[lane];
    return `<span class="badge ${l.cls}" title="${esc(l.desc.replace(/<[^>]+>/g, ""))}">${l.label}</span>`;
}
function laneCounts() {
    const c = { pr: 0, nightly: 0, local: 0, manual: 0, setup: 0 };
    for (const f of state.catalog.e2e.features)
        for (const sc of f.scenarios) c[laneOf(f, sc)]++;
    return c;
}
// Which local suite a grep-run should go through.
const laneSuite = (lane) => (lane === "pr" || lane === "setup" ? "e2e-fast" : "e2e-full");

// ---------- bootstrap ----------
async function init() {
    try {
        const h = await fetch("/api/health").then((r) => (r.ok ? r.json() : null));
        state.interactive = !!h;
    } catch {
        state.interactive = false;
    }
    const src = state.interactive ? "/api/catalog" : "./catalog.json";
    state.catalog = await fetch(src).then((r) => r.json());
    if (state.interactive) {
        try { state.history = await fetch("/api/history").then((r) => r.json()); } catch {}
        try { state.summary = await fetch("/api/summary").then((r) => r.json()); } catch {}
    }
    renderTopbar();
    wireGlobalEvents();
    render();
}

function renderTopbar() {
    const c = state.catalog;
    const t = c.totals;
    $("#subtitle").textContent =
        `${t.backendCases + t.jestCases + t.vitestCases} unit tests · ${t.e2eScenarios} scenarios · ` +
        `branch ${c.branch} · updated ${new Date(c.generatedAt).toLocaleTimeString()}`;
    const badge = $("#mode-badge");
    badge.textContent = state.interactive ? "interactive" : "read-only";
    badge.className = "badge " + (state.interactive ? "green" : "gray");
    const gh = $("#refresh-gh");
    if (!state.interactive) gh.classList.add("hidden");
    gh.onclick = async () => {
        gh.disabled = true; gh.textContent = "↻ fetching…";
        try {
            await fetch("/api/github/refresh", { method: "POST" });
            state.catalog = await fetch("/api/catalog").then((r) => r.json());
            render();
        } finally { gh.disabled = false; gh.textContent = "↻ GitHub data"; }
    };
}

// ---------- routing ----------
function setCrumbs(items) {
    const el = $("#crumbs");
    if (!items.length) return el.classList.add("hidden");
    el.classList.remove("hidden");
    el.innerHTML = items
        .map(([href, label]) => (href ? `<a href="${href}">${esc(label)}</a>` : `<span>${esc(label)}</span>`))
        .join(`<span class="sep">›</span>`);
}

function render() {
    const q = state.q.trim();
    if (q.length >= 2) {
        setCrumbs([["#/", "Home"], [null, `Search “${q}”`]]);
        $("#page").innerHTML = searchPage(q);
        return;
    }
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent).filter(Boolean);
    const [p0, p1, p2, p3] = parts;
    if (!p0) return homePage();
    if (p0 === "e2e") return e2ePage(p1 || null);
    if (p0 === "scenario") return scenarioPage(p1, parseInt(p2, 10));
    if (p0 === "backend") return backendPage();
    if (p0 === "frontend") return jsAreaPage("frontend");
    if (p0 === "asset-processor") return jsAreaPage("asset-processor");
    if (p0 === "suite") return suitePage(p1);
    if (p0 === "unit") return unitPage(p1, p2, p3);
    homePage();
}

// ── shared list machinery ────────────────────────────────────────────────────
// Pages render a .toolbar (filter input, selects with data-filter, optional
// #lf-sort) and a #lrows container. Filtering toggles row visibility (no
// re-render, so the input keeps focus); sorting re-renders only the rows.
function wireList(renderRows) {
    const sortSel = $("#lf-sort");
    const apply = () => {
        const q = ($("#lf-text")?.value || "").toLowerCase();
        const crit = [...document.querySelectorAll(".toolbar select[data-filter]")].map((s) => [s.dataset.filter, s.value]);
        let shown = 0, total = 0;
        for (const row of document.querySelectorAll("#lrows .lrow")) {
            total++;
            let ok = !q || row.dataset.s.includes(q);
            for (const [k, v] of crit) if (ok && v !== "all") ok = row.dataset[k] === v;
            row.classList.toggle("hidden", !ok);
            if (ok) shown++;
        }
        const c = $("#lf-count");
        if (c) c.textContent = shown === total ? `${total} shown` : `${shown} of ${total} shown`;
    };
    $("#lf-text")?.addEventListener("input", apply);
    document.querySelectorAll(".toolbar select[data-filter]").forEach((s) => s.addEventListener("change", apply));
    sortSel?.addEventListener("change", () => { renderRows(sortSel.value); apply(); });
    renderRows(sortSel ? sortSel.value : null);
    apply();
}

const tfield = (label, inner) => `<div class="tfield"><label>${esc(label)}</label>${inner}</div>`;
const selectHtml = (id, opts, dataFilter) =>
    `<select id="${id}"${dataFilter ? ` data-filter="${dataFilter}"` : ""}>${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`;

// ---------- home ----------
function homePage() {
    setCrumbs([]);
    const t = state.catalog.totals;
    const lc = laneCounts();
    const e2eGh = githubAvg(suiteById("e2e-fast"));
    const areaRow = (nav, icon, title, count, sub, badges, actions) => `
      <div class="lrow tall clickable" data-nav="${nav}">
        <div class="scol">
          <span class="sname">${icon} <b>${esc(title)}</b> <span class="dim">· ${count}</span></span>
          <span class="dim">${sub}</span>
        </div>
        <span class="stags">${badges}</span>
        ${actions || ""}
      </div>`;

    const tiers = state.catalog.tierOrder;
    const ordered = [...state.catalog.suites].sort((a, b) => tiers.indexOf(a.tier) - tiers.indexOf(b.tier));

    $("#page").innerHTML = `
      ${state.interactive ? `
      <div class="card runall">
        <div class="scol">
          <span class="sname"><b>Run everything</b></span>
          <span class="dim">All ${t.suites} suites through the local runner — Docker suites bring their stack up and tear it down (leftovers from interrupted runs are cleaned first); unavailable suites are skipped honestly. Full report + per-suite logs at the end.</span>
        </div>
        ${runBtn("everything", "Run everything")}
      </div>` : ""}
      ${latestResultsHtml()}
      <h2>Test areas</h2>
      <div class="card lrows" id="areas">
        ${areaRow("#/e2e", "🎭", "E2E scenarios", t.e2eScenarios,
            `<b>${lc.pr}</b> on every PR · <b>${lc.nightly}</b> nightly · <b class="warn">${lc.local} local-only</b> · ${lc.manual} manual · ${lc.setup} setup`,
            e2eGh != null ? `<span class="badge green" title="The PR E2E job runs the ${lc.pr + lc.setup} fast-tier scenarios — not all ${t.e2eScenarios}">PR job ≈ ${fmtSec(e2eGh)} (runs ${lc.pr + lc.setup} of ${t.e2eScenarios})</span>` : "",
            `${runBtn("e2e-fast", "Fast tier")} ${runBtn("e2e-full", "All E2E")}`)}
        ${areaRow("#/backend", "⚙️", "Backend", t.backendCases,
            `${state.catalog.unit.dotnet.projects.length} .NET projects · all run on every PR${localAvg("backend") != null ? ` · ${fmtMs(localAvg("backend"))} here` : ""}`,
            githubAvg(suiteById("backend")) != null ? `<span class="badge green">every PR · ${fmtSec(githubAvg(suiteById("backend")))}</span>` : "",
            runBtn("backend", "Run"))}
        ${areaRow("#/frontend", "🎨", "Frontend", t.jestCases,
            `${state.catalog.unit.jest.fileCount} Jest files · all run on every PR${localAvg("frontend") != null ? ` · ${fmtMs(localAvg("frontend"))} here` : ""}`,
            githubAvg(suiteById("frontend")) != null ? `<span class="badge green">every PR · ${fmtSec(githubAvg(suiteById("frontend")))}</span>` : "",
            runBtn("frontend", "Run"))}
        ${areaRow("#/asset-processor", "🖼️", "Asset processor", t.vitestCases,
            `${state.catalog.unit.vitest.fileCount} Vitest files · all run on every PR${localAvg("asset-processor") != null ? ` · ${fmtMs(localAvg("asset-processor"))} here` : ""}`,
            githubAvg(suiteById("asset-processor")) != null ? `<span class="badge green">every PR · ${fmtSec(githubAvg(suiteById("asset-processor")))}</span>` : "",
            runBtn("asset-processor", "Run"))}
      </div>

      <h2>Suites <span class="dim normal">— the runnable units (local runner + CI)</span></h2>
      <div class="card lrows">
        ${ordered.map((s) => `
          <div class="lrow tall clickable" data-nav="#/suite/${esc(s.id)}">
            <div class="scol">
              <span class="sname">${esc(s.name)}</span>
              <span class="dim">${statLine(s.id)}</span>
            </div>
            <span class="stags">
              ${suiteCiBadges(s)}
              ${tierBadge(s.tier)}
              ${s.requiresDocker ? '<span class="badge gray">docker</span>' : ""}
              ${s.present ? "" : '<span class="badge gray">not on branch</span>'}
            </span>
          </div>`).join("")}
      </div>
      ${nativeInstallersHtml()}`;
}

const STATUS_BADGE = {
    passed: "green", failed: "red", error: "red",
    skipped: "amber", "not-present": "gray", stopped: "gray",
};

// Last local runner run — turns the home page into "is everything green?".
function latestResultsHtml() {
    const s = state.summary?.meta ? state.summary : state.catalog.latestRun;
    if (!s?.meta) return "";
    const failed = s.results.filter((r) => r.status === "failed" || r.status === "error").length;
    const notRun = s.results.filter((r) => r.status === "skipped" || r.status === "not-present").length;
    const passed = s.results.filter((r) => r.status === "passed").length;
    return `
      <h2>Latest local run <span class="dim normal">— ${esc(s.meta.finishedAt)} · branch ${esc(s.meta.branch)} · ${fmtMs(s.meta.durationMs)}${failed ? ` · <b class="warn">${failed} failing</b>` : " · all green"}${notRun ? ` · ${notRun} not run` : ""}</span></h2>
      <div class="card lrows">
        ${s.results.map((r) => `
          <div class="lrow clickable" data-nav="#/suite/${esc(r.id)}">
            <span class="sname">${esc(r.id)}</span>
            ${r.counts ? `<span class="dim">${r.counts.passed}/${r.counts.total}</span>` : ""}
            ${r.durationMs != null ? `<span class="dim">${fmtMs(r.durationMs)}</span>` : ""}
            <span class="stags"><span class="badge ${STATUS_BADGE[r.status] || "gray"}">${esc(r.status)}</span></span>
          </div>`).join("")}
      </div>`;
}

// Native installer pipeline status — GitHub data, branch-independent (the
// workflow lives on feat/tray-host; the runs are visible from anywhere).
function nativeInstallersHtml() {
    const jobs = state.catalog.native || [];
    if (!jobs.length) return "";
    const at = jobs[0].recent?.[0]?.at;
    return `
      <h2>Native installers <span class="dim normal">— GitHub pipeline (feat/tray-host)${at ? ` · last run ${new Date(at).toLocaleDateString()}` : ""}</span></h2>
      <div class="card lrows">
        ${jobs.map((j) => {
            const last = j.recent?.[0];
            const cls = last?.conclusion === "success" ? "green" : last?.conclusion === "failure" ? "red" : "gray";
            return `
          <div class="lrow">
            <span class="sname">${esc(j.job)}</span>
            <span class="dim">avg ${fmtSec(j.avgSec)} · last ${fmtSec(last?.sec)}</span>
            <span class="stags">
              ${sparkline(j.recent?.map((r) => r.sec).reverse(), j.recent?.map((r) => r.conclusion).reverse())}
              <span class="badge ${cls}">${esc(last?.conclusion || "?")}</span>
            </span>
          </div>`;
        }).join("")}
      </div>
      <div class="dim" style="margin-top:6px;font-size:12px">Runs on release / manual dispatch — builds installers for Windows, macOS and Linux, then installs, smoke-tests, runs the full E2E suite against the installed app, and verifies uninstall. The local <b>desktop</b> suite activates automatically once feat/tray-host merges.</div>`;
}

function statLine(suiteId) {
    const gh = githubAvg(suiteById(suiteId));
    const loc = localAvg(suiteId);
    const bits = [];
    if (loc != null) bits.push(`${fmtMs(loc)} here`);
    if (gh != null) bits.push(`${fmtSec(gh)} on GitHub`);
    return bits.length ? bits.join(" · ") : "no timing yet";
}

function suiteCiBadges(s) {
    const wfs = new Set((s.ci || []).filter((b) => b.workflow).map((b) => b.workflow));
    const out = [];
    if (wfs.has("ci-and-deploy.yml") || wfs.has("code-quality.yml")) out.push('<span class="badge green">PR CI</span>');
    if (wfs.has("nightly-e2e.yml")) out.push('<span class="badge accent">nightly</span>');
    if (wfs.has("native-release.yml")) out.push('<span class="badge accent">release</span>');
    if (!out.length) out.push('<span class="badge gray">not in CI</span>');
    return out.join(" ");
}

function runBtn(suiteId, label, grep) {
    if (!state.interactive) return "";
    const g = grep ? ` data-grep="${esc(grep)}"` : "";
    return `<button class="btn primary" data-run="${esc(suiteId)}"${g}>▶ ${esc(label)}</button>`;
}

// ---------- E2E list ----------
function e2ePage(presetFolder) {
    setCrumbs([["#/", "Home"], [null, "E2E scenarios"]]);
    const feats = state.catalog.e2e.features;
    const rows = [];
    for (const f of feats)
        for (let i = 0; i < f.scenarios.length; i++) {
            const sc = f.scenarios[i];
            rows.push({ f, sc, i, lane: laneOf(f, sc), area: f.folder });
        }
    const folders = [...new Set(feats.map((f) => f.folder))].sort();
    const lc = laneCounts();

    $("#page").innerHTML = `
      <div class="toolbar">
        ${tfield("Filter", `<input id="lf-text" type="search" placeholder="scenario, feature, tag…">`)}
        ${tfield("Area", selectHtml("lf-area", [["all", "All areas"], ...folders.map((x) => [x, human(x)])], "area"))}
        ${tfield("Runs on", selectHtml("lf-lane", [["all", "Everywhere"],
            ["pr", `Every PR (${lc.pr})`], ["nightly", `Nightly (${lc.nightly})`],
            ["local", `Local only (${lc.local})`], ["manual", `Manual (${lc.manual})`], ["setup", `Setup (${lc.setup})`]], "lane"))}
        ${tfield("Sort", selectHtml("lf-sort", [["area", "Area"], ["name", "Name A–Z"], ["lane", "Where it runs"]]))}
        <span class="count" id="lf-count"></span>
      </div>
      <div class="card lrows" id="lrows"></div>`;

    const rowHtml = (r) => `
      <div class="lrow clickable" data-nav="#/scenario/${encodeURIComponent(r.f.file)}/${r.i}"
           data-s="${esc((r.sc.name + " " + r.f.title + " " + human(r.area) + " " + r.sc.tags.map((t) => "@" + t).join(" ")).toLowerCase())}"
           data-area="${esc(r.area)}" data-lane="${r.lane}">
        <div class="scol">
          <span class="sname">${esc(r.sc.name)}</span>
          <span class="dim">${esc(human(r.area))} · ${esc(r.f.title)}</span>
        </div>
        <span class="stags">${laneBadge(r.lane)}${r.sc.tags.filter((t) => !/^(depends-on|timeout|slow|serial|setup|performance)/.test(t)).slice(0, 2).map(tagHtml).join("")}</span>
        ${runBtn(laneSuite(r.lane), "run", r.sc.name)}
      </div>`;

    wireList((sortKey) => {
        const sorted = [...rows];
        if (sortKey === "name") sorted.sort((a, b) => a.sc.name.localeCompare(b.sc.name));
        else if (sortKey === "lane") sorted.sort((a, b) => LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane) || a.sc.name.localeCompare(b.sc.name));
        $("#lrows").innerHTML = sorted.map(rowHtml).join("");
    });

    if (presetFolder) {
        const sel = $("#lf-area");
        sel.value = presetFolder;
        sel.dispatchEvent(new Event("change"));
    }
}

// ---------- scenario detail ----------
function scenarioPage(file, idx) {
    const f = state.catalog.e2e.features.find((x) => x.file === file);
    const sc = f?.scenarios[idx];
    if (!sc) return homePage();
    const lane = laneOf(f, sc);
    const suite = suiteById(laneSuite(lane));
    const bindings = lane === "pr" || lane === "setup"
        ? suiteById("e2e-fast")?.ci || []
        : lane === "nightly"
          ? (suiteById("e2e-full")?.ci || []).filter((b) => b.workflow === "nightly-e2e.yml")
          : [];
    setCrumbs([["#/", "Home"], ["#/e2e", "E2E scenarios"], [`#/e2e/${encodeURIComponent(f.folder)}`, human(f.folder)], [null, sc.name]]);
    $("#page").innerHTML = `
      <h1>${esc(sc.name)}</h1>
      <div>${laneBadge(lane)} ${sc.tags.map(tagHtml).join("")}${sc.isOutline ? '<span class="badge gray">outline</span>' : ""}</div>
      <h2>Where it runs</h2>
      <div class="card">${LANES[lane].desc}</div>
      ${bindings.length ? `<h2>GitHub job</h2>${ciBindingsHtml(bindings)}` : ""}
      <h2>Feature</h2><div class="card">${esc(f.title)}<div class="meta dim mono" style="margin-top:6px">${esc(f.file)}:${sc.line}</div></div>
      ${sc.comment ? `<h2>Note in source</h2><div class="comment">${esc(sc.comment)}</div>` : ""}
      ${sc.dependsOn?.length ? `<h2>Depends on</h2><div class="card">${sc.dependsOn.map((x) => `<span class="badge gray">${esc(x)}</span>`).join(" ")}</div>` : ""}
      ${state.interactive ? `<h2>Run just this scenario</h2>${builderHtml(suite, { grep: sc.name })}` : ""}
    `;
    if (state.interactive) wireBuilder(suite, { grep: sc.name });
}

// ---------- backend list ----------
function backendPage() {
    setCrumbs([["#/", "Home"], [null, "Backend"]]);
    const dn = state.catalog.unit.dotnet;
    const rows = [];
    for (const p of dn.projects) {
        const pname = p.project.split("/").pop().replace(".csproj", "");
        for (const cl of p.classes || [])
            for (const m of cl.methods)
                rows.push({ pname, cl, m });
    }
    const projects = [...new Set(rows.map((r) => r.pname))];
    const errNote = dn.projects.filter((p) => p.error).map((p) => `<div class="comment" style="margin-bottom:12px">⚠ ${esc(p.project.split("/").pop())}: ${esc(p.error)}</div>`).join("");

    $("#page").innerHTML = `
      ${errNote}
      <div class="toolbar">
        ${tfield("Filter", `<input id="lf-text" type="search" placeholder="test or class name…">`)}
        ${tfield("Project", selectHtml("lf-proj", [["all", "All projects"], ...projects.map((x) => [x, x])], "proj"))}
        ${tfield("Type", selectHtml("lf-type", [["all", "All"], ["unit", "Unit"], ["integration", "Integration (needs Postgres)"]], "type"))}
        ${tfield("Sort", selectHtml("lf-sort", [["class", "Class"], ["name", "Name A–Z"]]))}
        <span class="count" id="lf-count"></span>
      </div>
      <div class="card lrows" id="lrows"></div>`;

    const rowHtml = (r) => {
        const sid = r.cl.integration ? "backend-integration" : "backend";
        return `
      <div class="lrow clickable" data-nav="#/unit/${sid}/${encodeURIComponent(r.cl.name)}/${encodeURIComponent(r.m.name)}"
           data-s="${esc((r.m.name + " " + r.cl.name).toLowerCase())}"
           data-proj="${esc(r.pname)}" data-type="${r.cl.integration ? "integration" : "unit"}">
        <div class="scol">
          <span class="sname">${esc(r.m.name)}${r.m.cases > 1 ? ` <span class="dim">(${r.m.cases} cases)</span>` : ""}</span>
          <span class="dim">${esc(r.cl.name.split(".").pop())} · ${esc(r.pname)}</span>
        </div>
        <span class="stags">${r.cl.integration ? '<span class="badge amber">integration</span>' : '<span class="badge green">every PR</span>'}</span>
      </div>`;
    };

    wireList((sortKey) => {
        const sorted = [...rows];
        if (sortKey === "name") sorted.sort((a, b) => a.m.name.localeCompare(b.m.name));
        $("#lrows").innerHTML = sorted.map(rowHtml).join("");
    });
}

// ---------- jest / vitest lists ----------
function jsAreaPage(suiteId) {
    const area = suiteId === "frontend" ? state.catalog.unit.jest : state.catalog.unit.vitest;
    const label = suiteId === "frontend" ? "Frontend" : "Asset processor";
    setCrumbs([["#/", "Home"], [null, label]]);
    const rows = [];
    for (const f of area.files) for (const name of f.cases) rows.push({ f, name });
    const files = area.files.map((f) => f.file);

    $("#page").innerHTML = `
      <div class="toolbar">
        ${tfield("Filter", `<input id="lf-text" type="search" placeholder="test name…">`)}
        ${tfield("File", selectHtml("lf-file", [["all", "All files"], ...files.map((x) => [x, x.split("/").pop()])], "file"))}
        ${tfield("Sort", selectHtml("lf-sort", [["file", "File"], ["name", "Name A–Z"]]))}
        <span class="count" id="lf-count"></span>
      </div>
      <div class="card lrows" id="lrows"></div>`;

    const rowHtml = (r) => `
      <div class="lrow clickable" data-nav="#/unit/${suiteId}/${encodeURIComponent(r.f.file)}/${encodeURIComponent(r.name)}"
           data-s="${esc((r.name + " " + r.f.file).toLowerCase())}" data-file="${esc(r.f.file)}">
        <div class="scol">
          <span class="sname">${esc(r.name)}</span>
          <span class="dim">${esc(r.f.file)}</span>
        </div>
        <span class="stags"><span class="badge green">every PR</span></span>
      </div>`;

    wireList((sortKey) => {
        const sorted = [...rows];
        if (sortKey === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
        $("#lrows").innerHTML = sorted.map(rowHtml).join("");
    });
}

// ---------- unit / suite detail ----------
function unitPage(suiteId, source, name) {
    const suite = suiteById(suiteId);
    if (!suite || !name) return homePage();
    const areaCrumb = suiteId.startsWith("backend") ? ["#/backend", "Backend"]
        : suiteId === "frontend" ? ["#/frontend", "Frontend"] : ["#/asset-processor", "Asset processor"];
    setCrumbs([["#/", "Home"], areaCrumb, [null, name]]);
    $("#page").innerHTML = `
      <h1>${esc(name)}</h1>
      <h2>Source</h2><div class="card"><span class="mono">${esc(source)}</span></div>
      <h2>Bound to CI actions</h2>${ciBindingsHtml(suite.ci || [])}
      ${state.interactive ? `<h2>Run (filtered to this test)</h2>${builderHtml(suite, { nameFilter: name })}` : ""}
    `;
    if (state.interactive) wireBuilder(suite, { nameFilter: name });
}

function suitePage(id) {
    const s = suiteById(id);
    if (!s) return homePage();
    setCrumbs([["#/", "Home"], [null, s.name]]);
    $("#page").innerHTML = `
      <h1>${esc(s.name)}</h1>
      <div>${suiteCiBadges(s)} ${tierBadge(s.tier)} ${s.requiresDocker ? '<span class="badge gray">docker</span>' : ""} ${s.present ? '<span class="badge green">present</span>' : '<span class="badge gray">not on this branch</span>'}</div>
      ${s.note ? `<div class="comment" style="margin-top:12px">${esc(s.note)}</div>` : ""}
      <h2>Command</h2><div class="card"><span class="mono">${esc(s.command)}</span><div class="meta dim" style="margin-top:6px">cwd: ${esc(s.cwd)}</div></div>
      <h2>Bound to CI actions</h2>${ciBindingsHtml(s.ci)}
      <h2>Timing on this machine</h2>${localTimingHtml(s.id)}
      ${state.interactive ? `<h2>Run</h2>${builderHtml(s, {})}` : ""}
    `;
    if (state.interactive) wireBuilder(s, {});
}

// ---------- search ----------
function searchPage(q) {
    const ql = q.toLowerCase();
    const hit = (s) => s && s.toLowerCase().includes(ql);
    const rows = [];

    for (const f of state.catalog.e2e.features) {
        for (let i = 0; i < f.scenarios.length; i++) {
            const sc = f.scenarios[i];
            if (hit(sc.name) || sc.tags.some((t) => hit("@" + t)) || hit(f.title)) {
                rows.push({ group: "E2E scenarios", title: sc.name, sub: `${human(f.folder)} · ${f.title}`, lane: laneOf(f, sc), nav: `#/scenario/${encodeURIComponent(f.file)}/${i}` });
            }
        }
    }
    for (const p of state.catalog.unit.dotnet.projects) {
        for (const cl of p.classes || []) for (const m of cl.methods) {
            if (hit(m.name) || hit(cl.name)) {
                const sid = cl.integration ? "backend-integration" : "backend";
                rows.push({ group: "Backend tests", title: m.name, sub: cl.name, nav: `#/unit/${sid}/${encodeURIComponent(cl.name)}/${encodeURIComponent(m.name)}` });
            }
        }
    }
    for (const [areaId, area] of [["frontend", state.catalog.unit.jest], ["asset-processor", state.catalog.unit.vitest]]) {
        for (const f of area.files) for (const name of f.cases) {
            if (hit(name) || hit(f.file)) {
                rows.push({ group: areaId === "frontend" ? "Frontend tests" : "Asset-processor tests", title: name, sub: f.file, nav: `#/unit/${areaId}/${encodeURIComponent(f.file)}/${encodeURIComponent(name)}` });
            }
        }
    }
    for (const s of state.catalog.suites) {
        if (hit(s.name) || hit(s.id)) rows.push({ group: "Suites", title: s.name, sub: s.tier, nav: `#/suite/${s.id}` });
    }

    const groups = {};
    for (const r of rows) (groups[r.group] ||= []).push(r);
    const sections = Object.entries(groups).map(([g, items]) => `
      <h2>${esc(g)} <span class="count">${items.length}</span></h2>
      <div class="lrows card">
        ${items.slice(0, 30).map((r) => `
          <div class="lrow clickable tall" data-nav="${r.nav}">
            <div class="scol"><span class="sname">${esc(r.title)}</span><span class="dim">${esc(r.sub)}</span></div>
            ${r.lane ? `<span class="stags">${laneBadge(r.lane)}</span>` : ""}
          </div>`).join("")}
        ${items.length > 30 ? `<div class="lrow dim">…and ${items.length - 30} more — refine the search</div>` : ""}
      </div>`).join("");

    return sections || `<div class="empty">No tests match “${esc(q)}”.</div>`;
}

// ---------- shared blocks ----------
function tagHtml(t) {
    const base = t.split(":")[0];
    const cls = ["slow", "serial", "setup", "performance"].includes(base) ? base : "";
    return `<span class="tag ${cls}">@${esc(t)}</span>`;
}
function tierBadge(t) { return `<span class="badge accent">${esc(t)}</span>`; }

function triggersHtml(tr) {
    if (!tr) return "—";
    const out = [];
    if (tr.push) out.push("push" + (tr.push.paths ? " (path-filtered)" : ""));
    if (tr.pull_request) out.push("PR" + (tr.pull_request.paths ? " (path-filtered)" : ""));
    if (tr.schedule) out.push("cron " + tr.schedule.join(", "));
    if (tr.workflow_dispatch) out.push("manual");
    if (tr.workflow_run) out.push("after workflow");
    if (tr.release) out.push("on release");
    return out.map((x) => `<span class="badge accent">${esc(x)}</span>`).join(" ");
}

function ciBindingsHtml(bindings) {
    if (!bindings || !bindings.length) return `<div class="card">No CI binding.</div>`;
    return `<div class="card">${bindings.map((b) => {
        if (!b.workflow) return `<div class="ci-binding"><span class="badge gray">not in CI</span><span>${esc(b.note || "")}</span></div>`;
        const gh = b.github;
        const spark = gh && gh.recent ? sparkline(gh.recent.map((r) => r.sec).reverse(), gh.recent.map((r) => r.conclusion).reverse()) : "";
        return `<div class="ci-binding">
            <b>${esc(b.workflowName || b.workflow)}</b>
            <span class="mono">${esc(b.jobName || "")}</span>
            ${triggersHtml(b.triggers)}
            ${gh ? `<span class="count">GitHub avg ${fmtSec(gh.avgSec)} · last ${fmtSec(gh.last)}</span> ${spark}` : `<span class="count">no GitHub timing</span>`}
            ${b.note ? `<span class="badge amber">${esc(b.note)}</span>` : ""}
        </div>`;
    }).join("")}</div>`;
}

function localTimingHtml(suiteId) {
    const live = state.history?.bySuite?.[suiteId];
    const h = live || suiteById(suiteId)?.local;
    if (!h) return `<div class="card">No local runs yet. Run it below to start building history.</div>`;
    const spark = h.recent ? sparkline(h.recent.map((ms) => Math.round(ms / 1000))) : "";
    return `<div class="card timing">
        <div class="metric"><b>${fmtMs(h.last)}</b><span>last</span></div>
        <div class="metric"><b>${fmtMs(h.avg)}</b><span>avg</span></div>
        <div class="metric"><b>${fmtMs(h.min)}</b><span>min</span></div>
        <div class="metric"><b>${fmtMs(h.max)}</b><span>max</span></div>
        <div class="metric"><b>${h.runs}</b><span>runs</span></div>
        ${spark}
    </div>`;
}

// ---------- run builder ----------
function builderHtml(suite, presets) {
    if (!suite) return `<div class="card">No runnable suite.</div>`;
    const isPw = suite.kind === "playwright";
    const isJsUnit = suite.kind === "jest" || suite.kind === "vitest";
    const fields = [];
    if (presets.grep != null)
        fields.push(field("Grep (tag or scenario)", `<input id="b-grep" value="${esc(presets.grep)}" size="28">`));
    if (presets.nameFilter != null)
        fields.push(field("Name filter", `<input id="b-name" value="${esc(presets.nameFilter)}" size="28">`));
    if (isPw) {
        fields.push(field("Video", sel("b-video", ["retain-on-failure", "on", "off"])));
        fields.push(field("Trace", sel("b-trace", ["on-first-retry", "on", "off", "retain-on-failure"])));
        fields.push(field("Workers", `<input id="b-workers" type="number" min="1" max="8" value="3" style="width:60px">`));
        fields.push(field("Retries", `<input id="b-retries" type="number" min="0" max="5" value="0" style="width:60px">`));
        fields.push(field("Headed", `<input id="b-headed" type="checkbox">`));
    }
    if (isJsUnit) fields.push(field("Coverage", `<input id="b-coverage" type="checkbox">`));

    return `<div class="card">
        <div class="builder">${fields.join("")}
            <button id="b-run" class="btn primary">Run ▶</button>
        </div>
        ${suite.requiresDocker ? `<div class="meta dim" style="margin-top:8px">Needs Docker; the run brings the stack up and tears it down.</div>` : ""}
        <div id="b-preview" class="cmd-preview"></div>
    </div>`;
}

function field(label, inner) { return `<div class="field"><label>${esc(label)}</label>${inner}</div>`; }
function sel(id, opts) { return `<select id="${id}">${opts.map((o) => `<option value="${o}">${o}</option>`).join("")}</select>`; }

function readBuilder(suite) {
    const v = (id) => { const e = document.getElementById(id); return e ? (e.type === "checkbox" ? e.checked : e.value) : undefined; };
    const params = {};
    if (suite.kind === "playwright") {
        params.video = v("b-video"); params.trace = v("b-trace");
        params.workers = v("b-workers"); params.retries = v("b-retries"); params.headed = v("b-headed");
    }
    if (suite.kind === "jest" || suite.kind === "vitest") params.coverage = v("b-coverage");
    if (v("b-name") !== undefined) params.nameFilter = v("b-name");
    const spec = { suiteId: suite.id, params };
    if (v("b-grep") !== undefined && v("b-grep") !== "") spec.grep = v("b-grep");
    return spec;
}

function previewText(spec, suite) {
    const parts = [`suite: ${suite.id}`];
    if (spec.grep) parts.push(`grep: "${spec.grep}"`);
    for (const [k, val] of Object.entries(spec.params || {}))
        if (val !== undefined && val !== false && val !== "") parts.push(`${k}=${val}`);
    return parts.join("  ·  ");
}

function wireBuilder(suite, presets) {
    if (!suite) return;
    const update = () => { const sp = readBuilder(suite); $("#b-preview").textContent = previewText(sp, suite); };
    document.querySelectorAll(".builder input, .builder select").forEach((e) => e.addEventListener("input", update));
    update();
    $("#b-run").onclick = () => runSpec(readBuilder(suite), suite);
}

// ---------- run + SSE console ----------
let es = null;
async function runSpec(spec, suite) {
    const con = $("#console");
    con.classList.remove("hidden");
    $("#console-out").textContent = "";
    $("#console-report").classList.add("hidden");
    setConsole(`Running ${suite.name}…`, "running", "amber");

    let resp;
    try {
        resp = await fetch("/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(spec) });
    } catch (e) { return setConsole("Failed to reach server", "error", "red"); }
    const body = await resp.json();
    if (!resp.ok) { appendOut(`✗ ${body.error}\n`); return setConsole(body.error, "blocked", "red"); }
    appendOut(`$ ${body.command}\n\n`);
    $("#console-stop").classList.remove("hidden");

    if (es) es.close();
    let runDone = false;
    es = new EventSource("/api/run/stream");
    es.addEventListener("output", (ev) => appendOut(stripAnsi(JSON.parse(ev.data).chunk)));
    es.addEventListener("end", (ev) => {
        runDone = true;
        $("#console-stop").classList.add("hidden");
        const r = JSON.parse(ev.data);
        const ok = r.status === "passed";
        const stopped = r.status === "stopped";
        const counts = r.counts ? ` (${r.counts.passed}/${r.counts.total})` : "";
        setConsole(
            `${stopped ? "Stopped" : ok ? "Passed" : "Failed"}${counts} · ${fmtMs(r.durationMs)}`,
            r.status,
            stopped ? "gray" : ok ? "green" : "red",
        );
        if (r.reportLink) { const a = $("#console-report"); a.href = "/report/" + r.reportLink.replace(/^\/+/, "") + "/index.html"; a.classList.remove("hidden"); }
        es.close();
        refreshLocalHistory();
    });
    // EventSource auto-reconnects on a dropped stream; if the run hasn't ended,
    // surface the disconnect and stop the reconnect loop (it would hit a 404).
    es.onerror = () => {
        if (runDone) return;
        es.close();
        $("#console-stop").classList.add("hidden");
        setConsole("Connection to run lost", "disconnected", "amber");
    };
}

function setConsole(title, status, color) {
    $("#console-title").textContent = title;
    const b = $("#console-status"); b.textContent = status; b.className = "badge " + (color || "gray");
}
function appendOut(text) { const o = $("#console-out"); o.textContent += text; o.scrollTop = o.scrollHeight; }

async function refreshLocalHistory() {
    try {
        state.history = await fetch("/api/history").then((r) => r.json());
        state.summary = await fetch("/api/summary").then((r) => r.json());
        render();
    } catch {}
}

// ---------- sparkline ----------
function sparkline(values, conclusions) {
    // Zip value+conclusion and filter the PAIR, so a null duration (cancelled /
    // in-progress run) can't shift the conclusion dots onto the wrong points.
    const pairs = (values || [])
        .map((v, i) => ({ v, c: conclusions ? conclusions[i] : null }))
        .filter((p) => p.v != null);
    if (pairs.length < 2) return "";
    const vals = pairs.map((p) => p.v);
    const w = 120, h = 28, max = Math.max(...vals), min = Math.min(...vals), span = max - min || 1;
    const xy = (v, i) => [(i / (vals.length - 1)) * (w - 4) + 2, h - 2 - ((v - min) / span) * (h - 6)];
    const pts = vals.map((v, i) => xy(v, i).join(",")).join(" ");
    const dots = pairs.map((p, i) => {
        const [x, y] = xy(p.v, i);
        const col = p.c === "success" ? "#1a7f37" : p.c === "failure" ? "#cf222e" : "#9a6700";
        return p.c ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${col}"/>` : "";
    }).join("");
    return `<svg class="spark" width="${w}" height="${h}"><polyline points="${pts}" fill="none" stroke="#6639ba" stroke-width="1.5"/>${dots}</svg>`;
}

// ---------- global events ----------
function wireGlobalEvents() {
    let t;
    $("#search").addEventListener("input", (e) => {
        clearTimeout(t);
        t = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 120);
    });
    $("#console-close").onclick = () => { if (es) es.close(); $("#console").classList.add("hidden"); };
    $("#console-stop").onclick = () => fetch("/api/run/stop", { method: "POST" }).catch(() => {});
    window.addEventListener("hashchange", render);

    // Delegated clicks: run buttons and row navigation.
    $("#page").addEventListener("click", (e) => {
        const run = e.target.closest("[data-run]");
        if (run) {
            e.preventDefault();
            e.stopPropagation();
            const id = run.dataset.run;
            // "everything" is a virtual suite (the mega-runner), not in the catalog.
            const suite = suiteById(id) ||
                (id === "everything" ? { id, name: "Everything — all suites" } : null);
            const spec = { suiteId: id, params: {} };
            if (run.dataset.grep) spec.grep = run.dataset.grep;
            if (suite) runSpec(spec, suite);
            return;
        }
        const nav = e.target.closest("[data-nav]");
        if (nav) {
            state.q = "";
            $("#search").value = "";
            location.hash = nav.dataset.nav;
        }
    });
}

init();
