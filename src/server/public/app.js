// Henson web UI — dependency-free SPA.
const app = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");

const STATE_LABELS = {
  backlog: "Backlog",
  ready: "Ready",
  "in-progress": "In progress",
  review: "Review",
  done: "Done",
};

// ---- tiny helpers --------------------------------------------------------
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
};

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
function fmtNum(n) {
  return new Intl.NumberFormat().format(n);
}

// ---- modal ---------------------------------------------------------------
function openModal(node) {
  const backdrop = el("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === backdrop) closeModal(); } }, node);
  modalRoot.append(backdrop);
}
function closeModal() { modalRoot.innerHTML = ""; }

// ---- router --------------------------------------------------------------
function route() {
  const hash = location.hash.replace(/^#/, "") || "/";
  if (hash.startsWith("/project/")) renderProject(hash.split("/")[2]);
  else renderHome();
}
window.addEventListener("hashchange", route);

// ---- HOME ----------------------------------------------------------------
async function renderHome() {
  app.innerHTML = "";
  const head = el("div", { class: "page-head" },
    el("h1", {}, "Projects"),
    el("div", { class: "spacer" }),
    el("button", { class: "btn btn-primary", onclick: showInitModal }, "+ New project"),
  );
  app.append(head);

  let data;
  try { data = await api("/api/projects"); }
  catch (e) { app.append(el("div", { class: "empty" }, `Failed to load: ${e.message}`)); return; }

  if (!data.projects.length) {
    app.append(el("div", { class: "empty" },
      el("p", {}, "No projects yet."),
      el("p", { class: "muted" }, "Initialise Henson in a git project to get a companion agent, a board, and shared docs."),
    ));
    return;
  }

  const grid = el("div", { class: "grid" });
  for (const p of data.projects) grid.append(projectCard(p));
  app.append(grid);
}

function projectCard(p) {
  const counts = el("div", { class: "counts" });
  for (const [state, label] of Object.entries(STATE_LABELS)) {
    counts.append(el("div", { class: "count" },
      el("b", { class: state === "done" ? "badge state-done" : "" }, String(p.counts?.[state] ?? 0)),
      el("span", {}, label),
    ));
  }
  const badges = el("div", { class: "badges" });
  if (p.yolo) badges.append(el("span", { class: "badge yolo" }, "⚡ yolo"));
  if (p.pendingDocSync) badges.append(el("span", { class: "badge sync" }, "docs changed — review tickets"));
  for (const pl of p.plugins || []) badges.append(el("span", { class: "badge" }, pl));
  if (!p.valid) badges.append(el("span", { class: "badge" }, "⚠ not initialised"));

  return el("div", { class: "card proj-card", onclick: () => (location.hash = `#/project/${p.id}`) },
    el("div", { class: "proj-top" },
      el("div", { class: "avatar" }, p.companion?.avatar ?? "❓"),
      el("div", {},
        el("div", { class: "proj-title" }, p.name),
        el("div", { class: "proj-companion" }, p.companion?.name ?? "(uninitialised)"),
      ),
    ),
    badges,
    counts,
    el("div", { class: "proj-path" }, p.path),
  );
}

function showInitModal() {
  const pathInput = el("input", { placeholder: "/absolute/path/to/your/project", autofocus: true });
  const nameInput = el("input", { placeholder: "(optional — defaults to folder name)" });
  const err = el("div", { class: "muted" });
  const submit = async () => {
    err.textContent = "";
    try {
      await api("/api/projects/init", { method: "POST", body: JSON.stringify({ path: pathInput.value.trim(), name: nameInput.value.trim() || undefined }) });
      closeModal();
      renderHome();
    } catch (e) { err.textContent = e.message; err.className = "muted"; err.style.color = "var(--red)"; }
  };
  openModal(el("div", { class: "modal" },
    el("h2", {}, "New Henson project"),
    el("p", { class: "muted" }, "Initialise Henson inside an existing folder. Creates a .henson/ board, docs (SPEC + ETIQUETTE) and a randomly-named companion."),
    el("label", {}, "Project path"), pathInput,
    el("label", {}, "Name"), nameInput,
    err,
    el("div", { class: "modal-actions" },
      el("button", { class: "btn-ghost", onclick: closeModal }, "Cancel"),
      el("button", { class: "btn-primary", onclick: submit }, "Create"),
    ),
  ));
}

// ---- PROJECT -------------------------------------------------------------
let current = { id: null, tab: "board" };

async function renderProject(id) {
  current.id = id;
  app.innerHTML = "";
  let data;
  try { data = await api(`/api/projects/${id}`); }
  catch (e) { app.append(el("div", { class: "empty" }, `Could not load project: ${e.message}`, el("div", {}, el("a", { href: "#/" }, "← back")))); return; }
  current.data = data;

  const c = data.config;
  const head = el("div", { class: "page-head" },
    el("a", { href: "#/", class: "btn btn-ghost btn-sm" }, "←"),
    el("div", { class: "avatar" }, c.companion.avatar),
    el("div", {},
      el("h1", {}, data.entry.name),
      el("div", { class: "proj-companion" }, `${c.companion.name} · recipe: ${c.companion.recipe || "solo"}${c.yolo ? " · ⚡ yolo" : ""}`),
    ),
    el("div", { class: "spacer" }),
    el("button", { class: "btn btn-danger btn-sm", onclick: () => removeProject(id, data.entry.name) }, "Unregister"),
  );
  app.append(head);

  if (data.pendingDocSync) {
    app.append(el("div", { class: "card", style: "border-color:var(--accent-2);margin-bottom:14px" },
      el("div", { class: "row" },
        el("span", {}, "📝 Docs changed since last review — the companion should re-read the spec and pull any new tickets."),
        el("div", { class: "spacer", style: "flex:1" }),
        el("button", { class: "btn-sm", onclick: async () => { await api(`/api/projects/${id}/sync-clear`, { method: "POST" }); renderProject(id); } }, "Mark reviewed"),
      ),
    ));
  }

  const tabs = el("div", { class: "tabs" });
  for (const [key, label] of [["board", "Board"], ["docs", "Docs"], ["memory", "Memory"], ["plugins", "Plugins & usage"], ["agent", "Companion"]]) {
    tabs.append(el("div", { class: "tab" + (current.tab === key ? " active" : ""), onclick: () => { current.tab = key; renderProject(id); } }, label));
  }
  app.append(tabs);

  const body = el("div", { id: "tab-body" });
  app.append(body);
  if (current.tab === "board") renderBoard(body, data);
  else if (current.tab === "docs") renderDocs(body, data);
  else if (current.tab === "memory") renderMemory(body, data);
  else if (current.tab === "plugins") renderPlugins(body, data);
  else if (current.tab === "agent") renderAgent(body, data);
}

async function removeProject(id, name) {
  if (!confirm(`Unregister "${name}"? This only removes it from Henson's registry — your files stay on disk.`)) return;
  await api(`/api/projects/${id}`, { method: "DELETE" });
  location.hash = "#/";
}

// ---- board ---------------------------------------------------------------
function renderBoard(body, data) {
  body.innerHTML = "";
  body.append(el("div", { class: "row", style: "margin-bottom:14px" },
    el("button", { class: "btn btn-primary", onclick: () => showTicketModal(data.entry.id) }, "+ Add ticket"),
    el("span", { class: "muted" }, "Drag a card between columns to change its state."),
  ));

  const board = el("div", { class: "board" });
  for (const state of data.states) {
    const tickets = data.board[state] || [];
    const col = el("div", { class: "column", "data-state": state },
      el("div", { class: "col-head" }, el("span", {}, STATE_LABELS[state]), el("span", { class: "col-count" }, String(tickets.length))),
    );
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("dragover"); });
    col.addEventListener("dragleave", () => col.classList.remove("dragover"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("dragover");
      const tid = e.dataTransfer.getData("text/plain");
      if (tid) {
        await api(`/api/projects/${data.entry.id}/tickets/${tid}`, { method: "PATCH", body: JSON.stringify({ state }) });
        renderProject(data.entry.id);
      }
    });
    for (const t of tickets) col.append(ticketCard(data.entry.id, t));
    board.append(col);
  }
  body.append(board);
}

function ticketCard(projectId, t) {
  const card = el("div", { class: `ticket p-${t.priority}`, draggable: "true", onclick: () => showTicketModal(projectId, t) },
    el("div", { class: "ticket-title" }, t.title),
    el("div", { class: "ticket-meta" },
      el("span", { class: "tag" }, t.priority),
      t.assignee ? el("span", { class: "tag" }, `@${t.assignee}`) : null,
      ...(t.labels || []).map((l) => el("span", { class: "tag" }, l)),
    ),
  );
  card.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", t.id));
  return card;
}

function showTicketModal(projectId, ticket) {
  const isEdit = Boolean(ticket);
  const title = el("input", { value: ticket?.title || "", placeholder: "Ticket title" });
  const body = el("textarea", { placeholder: "Description / acceptance criteria (markdown)" }, ticket?.body || "");
  const state = el("select", {}, ...Object.entries(STATE_LABELS).map(([v, l]) => el("option", { value: v, ...(ticket?.state === v || (!ticket && v === "backlog") ? { selected: true } : {}) }, l)));
  const priority = el("select", {}, ...["low", "medium", "high"].map((v) => el("option", { value: v, ...((ticket?.priority || "medium") === v ? { selected: true } : {}) }, v)));
  const labels = el("input", { value: (ticket?.labels || []).join(", "), placeholder: "comma, separated, labels" });
  const assignee = el("input", { value: ticket?.assignee || "", placeholder: "assignee" });
  const err = el("div", { style: "color:var(--red)" });

  const save = async () => {
    const payload = {
      title: title.value.trim(),
      body: body.value,
      state: state.value,
      priority: priority.value,
      assignee: assignee.value.trim() || undefined,
      labels: labels.value.split(",").map((s) => s.trim()).filter(Boolean),
    };
    if (!payload.title) { err.textContent = "Title is required"; return; }
    try {
      if (isEdit) await api(`/api/projects/${projectId}/tickets/${ticket.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api(`/api/projects/${projectId}/tickets`, { method: "POST", body: JSON.stringify(payload) });
      closeModal();
      renderProject(projectId);
    } catch (e) { err.textContent = e.message; }
  };

  openModal(el("div", { class: "modal" },
    el("h2", {}, isEdit ? "Edit ticket" : "New ticket"),
    el("label", {}, "Title"), title,
    el("label", {}, "Description"), body,
    el("div", { class: "row" },
      el("div", { style: "flex:1" }, el("label", {}, "State"), state),
      el("div", { style: "flex:1" }, el("label", {}, "Priority"), priority),
    ),
    el("label", {}, "Assignee"), assignee,
    el("label", {}, "Labels"), labels,
    err,
    el("div", { class: "modal-actions" },
      isEdit ? el("button", { class: "btn-danger", onclick: async () => { if (confirm("Delete this ticket?")) { await api(`/api/projects/${projectId}/tickets/${ticket.id}`, { method: "DELETE" }); closeModal(); renderProject(projectId); } } }, "Delete") : null,
      el("div", { style: "flex:1" }),
      el("button", { class: "btn-ghost", onclick: closeModal }, "Cancel"),
      el("button", { class: "btn-primary", onclick: save }, isEdit ? "Save" : "Create"),
    ),
  ));
}

// ---- docs ----------------------------------------------------------------
function renderDocs(body, data) {
  body.innerHTML = "";
  const layout = el("div", { class: "cols-2" });
  const list = el("div", { class: "doc-list card" });
  const editor = el("div", { class: "card" }, el("div", { class: "muted" }, "Select a doc to view and edit."));

  const loadDoc = async (name, itemNode) => {
    list.querySelectorAll(".doc-item").forEach((n) => n.classList.remove("active"));
    itemNode.classList.add("active");
    const { content } = await api(`/api/projects/${data.entry.id}/docs/${encodeURIComponent(name)}`);
    const ta = el("textarea", { style: "min-height:55vh" }, content);
    const status = el("span", { class: "muted" });
    editor.innerHTML = "";
    editor.append(
      el("div", { class: "row", style: "margin-bottom:10px" },
        el("b", {}, name), el("div", { style: "flex:1" }), status,
        el("button", { class: "btn-primary btn-sm", onclick: async () => {
          await api(`/api/projects/${data.entry.id}/docs/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ content: ta.value }) });
          status.textContent = "saved ✓"; status.style.color = "var(--green)";
          setTimeout(() => { status.textContent = ""; }, 2000);
        } }, "Save"),
      ),
      ta,
    );
  };

  if (!data.docs.length) list.append(el("div", { class: "muted" }, "No docs yet."));
  for (const d of data.docs) {
    const item = el("div", { class: "doc-item" },
      el("div", { class: "doc-name" }, d.name),
      el("div", { class: "doc-meta" }, `${fmtBytes(d.bytes)} · ${new Date(d.updated).toLocaleString()}`),
    );
    item.addEventListener("click", () => loadDoc(d.name, item));
    list.append(item);
  }
  list.append(el("button", { class: "btn-sm", style: "margin-top:10px;width:100%", onclick: () => showNewDocModal(data.entry.id) }, "+ New doc"));

  layout.append(list, editor);
  body.append(layout);
}

function showNewDocModal(projectId) {
  const name = el("input", { placeholder: "DESIGN.md" });
  const err = el("div", { style: "color:var(--red)" });
  openModal(el("div", { class: "modal" },
    el("h2", {}, "New doc"),
    el("label", {}, "File name"), name,
    err,
    el("div", { class: "modal-actions" },
      el("button", { class: "btn-ghost", onclick: closeModal }, "Cancel"),
      el("button", { class: "btn-primary", onclick: async () => {
        try {
          await api(`/api/projects/${projectId}/docs/${encodeURIComponent(name.value.trim())}`, { method: "PUT", body: JSON.stringify({ content: `# ${name.value.replace(/\.md$/, "")}\n\n` }) });
          closeModal(); renderProject(projectId);
        } catch (e) { err.textContent = e.message; }
      } }, "Create"),
    ),
  ));
}

// ---- memory --------------------------------------------------------------
function renderMemory(body, data) {
  body.innerHTML = "";
  const card = el("div", { class: "card" }, el("h2", {}, "Project memory"), el("p", { class: "muted" }, "Facts the companion has saved (one markdown file per fact, stored under .henson/memory)."));
  if (!data.memories.length) card.append(el("div", { class: "muted" }, "No memories saved yet."));
  for (const m of data.memories) {
    card.append(el("div", { class: "doc-item" },
      el("div", { class: "row" }, el("b", {}, m.name), m.type ? el("span", { class: "pill", style: "margin-left:8px" }, m.type) : null),
      el("div", { class: "doc-meta" }, m.description || ""),
    ));
  }
  body.append(card);
}

// ---- plugins & usage -----------------------------------------------------
async function renderPlugins(body, data) {
  body.innerHTML = "";
  const usageCard = el("div", { class: "card" }, el("div", { class: "muted" }, "Loading usage…"));
  body.append(usageCard);

  try {
    const u = await api(`/api/projects/${data.entry.id}/usage`);
    usageCard.innerHTML = "";
    if (!u.enabled) {
      usageCard.append(el("div", { class: "muted" }, "Usage monitor plugin is not enabled for this project."));
    } else {
      const pct = u.percentUsed ?? 0;
      const meter = el("div", { class: "meter" + (pct >= u.safetyMarginPercent ? " danger" : "") }, el("i", { style: `width:${Math.min(100, pct)}%` }));
      usageCard.append(
        el("div", { class: "row" }, el("h2", { style: "margin:0" }, "Claude usage"), el("div", { style: "flex:1" }), el("span", { class: u.safeToContinue ? "pill" : "pill", style: `border-color:${u.safeToContinue ? "var(--green)" : "var(--red)"};color:${u.safeToContinue ? "var(--green)" : "var(--red)"}` }, u.safeToContinue ? "safe to continue" : "pause work")),
        el("p", { class: "muted" }, `Rolling ${u.windowHours}h window · resets ~${new Date(u.resetAt).toLocaleTimeString()}`),
        meter,
        el("div", { class: "kv" },
          el("b", {}, "Used"), el("span", {}, `${fmtNum(u.used)} / ${fmtNum(u.limit)} tokens (${pct}%)`),
          el("b", {}, "Remaining"), el("span", {}, fmtNum(u.remaining)),
          el("b", {}, "Input / Output"), el("span", {}, `${fmtNum(u.breakdown.input)} / ${fmtNum(u.breakdown.output)}`),
          el("b", {}, "Cache (create/read)"), el("span", {}, `${fmtNum(u.breakdown.cacheCreation)} / ${fmtNum(u.breakdown.cacheRead)}`),
          el("b", {}, "Messages"), el("span", {}, fmtNum(u.breakdown.messages)),
        ),
        el("p", { style: "margin-top:12px" }, u.recommendation),
      );
    }
  } catch (e) {
    usageCard.innerHTML = "";
    usageCard.append(el("div", { class: "muted" }, `Usage unavailable: ${e.message}`));
  }

  const list = el("div", { class: "card", style: "margin-top:16px" }, el("h2", {}, "Plugins"));
  try {
    const { plugins } = await api(`/api/plugins?project=${data.entry.id}`);
    for (const p of plugins) {
      list.append(el("div", { class: "doc-item" },
        el("div", { class: "row" }, el("b", {}, p.name), el("span", { class: "pill", style: `margin-left:8px;${p.active ? "border-color:var(--green);color:var(--green)" : ""}` }, p.active ? "enabled" : "available")),
        el("div", { class: "doc-meta" }, p.description),
      ));
    }
  } catch { /* ignore */ }
  body.append(list);
}

// ---- companion -----------------------------------------------------------
async function renderAgent(body, data) {
  body.innerHTML = "";
  const c = data.config;
  const cmd = `henson mcp ${data.entry.path}`;
  const mcpJson = JSON.stringify({ mcpServers: { [`henson-${data.entry.name}`]: { command: "henson", args: ["mcp", data.entry.path] } } }, null, 2);

  body.append(
    el("div", { class: "card" },
      el("div", { class: "proj-top" }, el("div", { class: "avatar", style: "font-size:42px" }, c.companion.avatar),
        el("div", {}, el("h2", { style: "margin:0" }, c.companion.name), el("div", { class: "muted" }, `Companion for ${data.entry.name}`))),
      el("div", { class: "kv" },
        el("b", {}, "Default recipe"), el("span", {}, c.companion.recipe || "solo"),
        el("b", {}, "Yolo mode"), el("span", {}, c.yolo ? "⚡ on — may work autonomously within usage budget" : "off"),
        el("b", {}, "Plugins"), el("span", {}, c.plugins.join(", ") || "(none)"),
      ),
    ),
    el("div", { class: "card", style: "margin-top:16px" },
      el("h2", {}, "Connect an agent"),
      el("p", { class: "muted" }, "Give Claude Code (or any MCP client) access to this project's board, docs and memory:"),
      el("label", {}, "Run the MCP server"),
      el("textarea", { readonly: true, style: "min-height:auto;height:42px" }, cmd),
      el("label", {}, "…or add to your MCP client config"),
      el("textarea", { readonly: true, style: "min-height:140px" }, mcpJson),
    ),
    el("div", { class: "card", style: "margin-top:16px" },
      el("h2", {}, "Agent-team recipes"),
      recipesNode(),
    ),
  );
}

function recipesNode() {
  const wrap = el("div", {}, el("div", { class: "muted" }, "Loading…"));
  api("/api/recipes").then(({ recipes }) => {
    wrap.innerHTML = "";
    for (const r of recipes) {
      wrap.append(el("div", { class: "doc-item" },
        el("b", {}, `${r.name} `), el("span", { class: "pill" }, r.id),
        el("div", { class: "doc-meta" }, r.description),
        el("div", { class: "badges" }, ...r.roles.map((role) => el("span", { class: "badge", title: role.description }, role.role))),
      ));
    }
  });
  return wrap;
}

// ---- live updates --------------------------------------------------------
function connectEvents() {
  const conn = document.getElementById("conn");
  const es = new EventSource("/api/events");
  es.onopen = () => conn.classList.add("live");
  es.onerror = () => conn.classList.remove("live");
  es.onmessage = (e) => {
    try {
      const evt = JSON.parse(e.data);
      // Refresh the current project view if it's affected.
      if (current.id && evt.projectId === current.id) renderProject(current.id);
      else if (!location.hash.startsWith("#/project/")) renderHome();
    } catch { /* ignore keepalives */ }
  };
}

route();
connectEvents();
