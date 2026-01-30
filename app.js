// Noteable application logic
// Keep this file loaded with <script src="./app.js" defer></script>

const STORAGE_KEY = "notebook.v1";

const $ = (s) => document.querySelector(s);
const tabsEl = $("#tabs");
const noteArea = $("#noteArea");
const addTabBtn = $("#addTabBtn");
const addLabelBtn = $("#addLabelBtn");
const addTextareaBtn = $("#addTextareaBtn");
const clearTabBtn = $("#clearTabBtn");
const addTemplateBtn = $("#addTemplateBtn");
const exportBtn = $("#exportBtn");
const importBtn = $("#importBtn");
const importFile = $("#importFile");
const searchInput = document.createElement("input");

const THEMES_KEY = "noteable.themes";
const ACTIVE_THEME_KEY = "noteable.activeTheme";
const LIVE_COLORS_KEY = "noteable.liveColors";
const DEFAULT_COLORS = {
  "--bg": "#0a0a0a",
  "--app": "#141414",
  "--field": "#1e1e1e",
  "--muted": "#969696",
  "--text": "#dcdcdc",
  "--accent": "#5498ff",
  "--accent-2": "#5498ff",
  "--border": "#323232",
};
const DEFAULT_THEMES = {
  "Default Dark": {
    "--bg": "#0a0a0a",
    "--app": "#141414",
    "--field": "#1e1e1e",
    "--muted": "#969696",
    "--text": "#dcdcdc",
    "--accent": "#5498ff",
    "--accent-2": "#5498ff",
    "--border": "#323232",
  },
  "Default Light": {
    "--bg": "#0a0a0a",
    "--app": "#ffffff",
    "--field": "#e5e7eb",
    "--muted": "#475569",
    "--text": "#0f172a",
    "--accent": "#5498ff",
    "--accent-2": "#5498ff",
    "--border": "#cbd5e1",
  },
};
function isDefaultTheme(name) {
  return name in DEFAULT_THEMES;
}
function getDefaultThemeNames() {
  return Object.keys(DEFAULT_THEMES);
}
function ensureThemesInitialized() {
  if (!localStorage.getItem(THEMES_KEY)) {
    localStorage.setItem(THEMES_KEY, JSON.stringify([]));
  }
}
function loadLiveColors() {
  const raw = localStorage.getItem(LIVE_COLORS_KEY);
  if (!raw) return false;

  try {
    const colors = JSON.parse(raw);
    for (const key in colors) {
      document.documentElement.style.setProperty(key, colors[key]);
    }
    return true;
  } catch {
    return false;
  }
}

ensureThemesInitialized();

const liveRestored = loadLiveColors();
if (!liveRestored) {
  const active = localStorage.getItem(ACTIVE_THEME_KEY) || "Default Dark";
  applyThemeByName(active, { clearLive: false });
}

searchInput.type = "text";
searchInput.placeholder = "Search fields in this tab...";
searchInput.style.marginBottom = "8px";
searchInput.style.width = "100%";
searchInput.addEventListener("input", renderNoteArea);
noteArea.parentNode.insertBefore(searchInput, noteArea);

const menuBtn = document.getElementById("menuBtn");
const menuDropdown = document.getElementById("menuDropdown");

menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  menuDropdown.classList.toggle("hidden");
});

document.addEventListener("click", () => {
  menuDropdown.classList.add("hidden");
});

const DEFAULT_SETTINGS = {
  clearTabDeletesImages: false,
  experimental: false,
};

let state = {
  tabs: [],
  activeTabId: null,
  settings: { ...DEFAULT_SETTINGS },
};

const uid = (prefix = "id") =>
  prefix + "_" + Math.random().toString(36).slice(2, 9);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const loaded = JSON.parse(raw);

    state = {
      ...loaded,
      settings: {
        ...DEFAULT_SETTINGS,
        ...(loaded.settings || {}),
      },
    };
  } catch (e) {
    console.error("Failed load", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed save", e);
  }
}

function ensureDefault() {
  if (!state.tabs || state.tabs.length === 0) {
    const t = {
      id: uid("tab"),
      name: "Tab 1",
      fields: [{ id: uid("f"), type: "label", label: "Title", value: "" }],
    };
    state.tabs = [t];
    state.activeTabId = t.id;
    saveState();
  }
}
function ensureSettings() {
  if (!state.settings) {
    state.settings = { ...DEFAULT_SETTINGS };
    saveState();
    return;
  }

  // Backward compatibility for older saves
  for (const key in DEFAULT_SETTINGS) {
    if (!(key in state.settings)) {
      state.settings[key] = DEFAULT_SETTINGS[key];
    }
  }
}

// --- TAB RENDERING WITH DRAG ---
function renderTabs() {
  tabsEl.innerHTML = "";
  state.tabs.forEach((t) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (t.id === state.activeTabId ? " active" : "");
    btn.type = "button";
    btn.title = t.name;
    btn.textContent = t.name;

    // Click to switch
    btn.addEventListener("click", () => {
      state.activeTabId = t.id;
      saveState();
      render();
    });

    // Rename on contextmenu
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const newName = prompt("Rename tab", t.name);
      if (newName === null) return;
      const trimmed = newName.trim();
      if (trimmed.length === 0) return alert("Name cannot be empty");
      t.name = trimmed;
      saveState();
      render();
    });

    // Delete on dblclick
    btn.addEventListener("dblclick", () => {
      if (!confirm('Delete tab "' + t.name + '"?')) return;
      state.tabs = state.tabs.filter((x) => x.id !== t.id);
      if (state.tabs.length === 0) {
        state.activeTabId = null;
        ensureDefault();
      }
      if (state.activeTabId === t.id) state.activeTabId = state.tabs[0].id;
      saveState();
      render();
    });

    // Drag start
    btn.draggable = true;
    btn.addEventListener("dragstart", (e) => {
      btn.classList.add("dragging");
      e.dataTransfer.setData("text/plain", t.id);
    });
    btn.addEventListener("dragend", () => btn.classList.remove("dragging"));

    tabsEl.appendChild(btn);
  });

  // Tab drag over
  tabsEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = tabsEl.querySelector(".tab.dragging");
    const afterEl = getDragAfterElement(tabsEl, e.clientX, false);
    if (!afterEl) tabsEl.appendChild(dragging);
    else tabsEl.insertBefore(dragging, afterEl);
    updateTabOrder();
  });
}

document.addEventListener("paste", (e) => {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) return;

  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault(); // stop default paste

      const file = item.getAsFile();
      const reader = new FileReader();

      reader.onload = () => {
        tab.fields.push({
          id: uid("f"),
          type: "image",
          label: "Image",
          value: reader.result,
        });

        saveState();
        renderNoteArea();
      };

      reader.readAsDataURL(file);
      return; // only handle first image
    }
  }
});

// --- Automatically resize textareas when switching between tabs
function autoResize(el) {
  el.style.height = "auto"; // Reset first
  el.style.height = el.scrollHeight + 2 + "px"; // Adjust to fit content
}

// --- FIELD RENDERING WITH SEARCH AND DRAG HANDLE ---
function renderNoteArea() {
  noteArea.innerHTML = "";
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) {
    noteArea.textContent = "No tab selected";
    return;
  }

  const term = searchInput.value.toLowerCase();

  tab.fields
    .filter((f) => {
      const labelMatch = f.label.toLowerCase().includes(term);
      const valueMatch =
        f.type !== "image" && f.value.toLowerCase().includes(term);
      return labelMatch || valueMatch;
    })

    .forEach((field) => {
      const container = document.createElement("div");
      container.className = "field";
      container.dataset.id = field.id;

      // --- Label row ---
      const labelRow = document.createElement("div");
      labelRow.className = "label-row";

      const label = document.createElement("h4");
      label.className = "field-label draggable-label";
      label.textContent =
        field.label || (field.type === "textarea" ? "Note" : "Text");
      label.draggable = true;

      // Drag start
      label.addEventListener("dragstart", (e) => {
        container.classList.add("dragging");
      });

      // Drag end
      label.addEventListener("dragend", (e) => {
        container.classList.remove("dragging");
        updateFieldOrder(); // Update state after drop
      });

      labelRow.appendChild(label);

      // --- Edit/Delete buttons ---
      const labelActions = document.createElement("div");
      labelActions.className = "label-actions";

      // Edit button (inline SVG)
      const renameBtn = document.createElement("button");
      renameBtn.className = "icon-btn";
      renameBtn.title = "Rename field";
      renameBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 17.25V21h3.75l11-11.02-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/>
      </svg>`;
      renameBtn.addEventListener("click", () => {
        const name = prompt("Rename field label", field.label || "");
        if (name !== null) {
          field.label = name.trim();
          saveState();
          renderNoteArea();
        }
      });

      // Delete button (inline SVG)
      const delBtn = document.createElement("button");
      delBtn.className = "icon-btn";
      delBtn.title = "Delete field";
      delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
      </svg>`;
      delBtn.addEventListener("click", () => {
        if (!confirm("Delete this field?")) return;
        tab.fields = tab.fields.filter((f) => f.id !== field.id);
        saveState();
        renderNoteArea();
      });

      labelActions.appendChild(renameBtn);
      labelActions.appendChild(delBtn);
      labelRow.appendChild(labelActions);

      // --- Input row ---
      const inputRow = document.createElement("div");
      inputRow.className = "input-row";
      let inputEl;

      if (field.type === "label") {
        inputEl = document.createElement("input");
        inputEl.type = "text";
        inputEl.value = field.value || "";
        inputEl.addEventListener("input", (e) => {
          field.value = e.target.value;
          saveState();
        });
        inputRow.appendChild(inputEl);
      } else if (field.type === "textarea") {
        inputEl = document.createElement("textarea");
        inputEl.value = field.value || "";
        inputEl.addEventListener("input", (e) => {
          field.value = e.target.value;
          autoResize(e.target);
          saveState();
        });
        autoResize(inputEl);
        inputRow.appendChild(inputEl);
      } else if (field.type === "image") {
        const imgWrapper = document.createElement("div");
        imgWrapper.className = "image-wrapper";

        const imgBorder = document.createElement("div");
        imgBorder.className = "image-border";

        const img = document.createElement("img");
        img.className = "image-embed";
        img.src = field.value;
        img.draggable = false;
        img.alt = field.label || "Image";

        let wrapperWidth = field.width || 0;
        let wrapperHeight = field.height || 0;

        let isHydrating = true;

        img.onload = () => {
          if (!wrapperWidth) wrapperWidth = img.naturalWidth;
          if (!wrapperHeight) wrapperHeight = img.naturalHeight;

          imgWrapper.style.width = wrapperWidth + "px";
          imgWrapper.style.height = wrapperHeight + "px";
          imgWrapper.style.maxWidth = "none";

          if (!field.width || !field.height) {
            field.width = wrapperWidth;
            field.height = wrapperHeight;
            saveState();
          }

          requestAnimationFrame(() => {
            isHydrating = false;
          });
        };

        imgBorder.appendChild(img);
        imgWrapper.appendChild(imgBorder);
        inputRow.appendChild(imgWrapper);

        // Per-wrapper flags
        let isCorrecting = false;

        const ro = new ResizeObserver(([entry]) => {
          if (isHydrating || isCorrecting) return;

          const { width, height } = entry.contentRect;
          if (!width || !height) return;

          isCorrecting = true;

          // Persist size
          field.width = Math.round(imgWrapper.getBoundingClientRect().width);
          field.height = Math.round(imgWrapper.getBoundingClientRect().height);
          saveState();

          requestAnimationFrame(() => {
            isCorrecting = false;
          });
        });

        ro.observe(imgWrapper);
      } else if (field.type === "template") {
        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.width = "100%";
        container.style.gap = "4px";

        const textarea = document.createElement("textarea");
        textarea.placeholder = "Use $(FieldName) to input values...";
        textarea.value = field.value || "";
        textarea.style.width = "100%";

        textarea.addEventListener("input", (e) => {
          field.value = e.target.value;
          autoResize(e.target);
          saveState();
        });
        autoResize(textarea);

        const runBtn = document.createElement("button");
        runBtn.className = "copy-btn";
        runBtn.textContent = "Run";

        runBtn.addEventListener("click", () => {
          const output = resolveTemplate(field.value, getAllFields());
          navigator.clipboard
            .writeText(output)
            .then(() => flashNotice("Template copied!"));
        });

        const templateHelper = document.createElement("div");
        templateHelper.className = "template-help";
        templateHelper.innerHTML = `
          Use <code>$(FieldName)</code> 
          or with parameters like <code>$(Tab.FieldName|csv)</code><br>
        `;

        // append children in order
        container.appendChild(textarea);
        container.appendChild(templateHelper);
        inputRow.appendChild(container);
        inputRow.appendChild(runBtn);
      }

      const copyBtn = document.createElement("button");
      copyBtn.className = "copy-btn";
      copyBtn.type = "button";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", () => {
        navigator.clipboard
          .writeText(field.value || "")
          .then(() => flashNotice("Copied!"));
      });
      if (field.type !== "image" && field.type !== "template") {
        inputRow.appendChild(copyBtn);
      }

      container.appendChild(labelRow);
      container.appendChild(inputRow);
      noteArea.appendChild(container);
    });

  if (tab.fields.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "This tab is empty.";
    noteArea.appendChild(p);
  }

  // --- Drag-and-drop for fields ---
  noteArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = noteArea.querySelector(".field.dragging");
    if (!dragging) return;
    const afterEl = getDragAfterElement(noteArea, e.clientY, true);
    if (!afterEl) noteArea.appendChild(dragging);
    else noteArea.insertBefore(dragging, afterEl);
  });
  if (tab.fields.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "This tab is empty.";
    noteArea.appendChild(p);
  }

  requestAnimationFrame(() => {
    noteArea.querySelectorAll("textarea").forEach(autoResize);
  });
}

// --- HELPER FOR DRAG POSITION ---
function getDragAfterElement(container, pos, vertical = true) {
  const draggableElements = [
    ...container.querySelectorAll(
      vertical ? ".field:not(.dragging)" : "button.tab:not(.dragging)",
    ),
  ];
  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = vertical
        ? pos - (box.top + box.height / 2)
        : pos - (box.left + box.width / 2);
      if (offset < 0 && offset > closest.offset)
        return { offset, element: child };
      else return closest;
    },
    { offset: Number.NEGATIVE_INFINITY },
  ).element;
}

// --- UPDATE FIELD ORDER AFTER DRAG ---
function updateFieldOrder() {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) return;

  const newFields = [];

  noteArea.querySelectorAll(".field").forEach((container) => {
    const id = container.dataset.id;
    const field = tab.fields.find((f) => f.id === id);
    if (field) newFields.push(field);
  });

  tab.fields = newFields;
  saveState();
}

// --- UPDATE TAB ORDER AFTER DRAG ---
function updateTabOrder() {
  const newTabs = [];
  tabsEl.querySelectorAll("button.tab").forEach((btn) => {
    const t = state.tabs.find(
      (x) => x.id === btn.title || x.name === btn.textContent,
    );
    if (t) newTabs.push(t);
  });
  state.tabs = newTabs;
  saveState();
}

// --- Copy notification ---
let noticeTimeout = 0;
function flashNotice(msg) {
  clearTimeout(noticeTimeout);
  let el = document.getElementById("__notice");
  if (!el) {
    el = document.createElement("div");
    el.id = "__notice";
    el.style.position = "fixed";
    el.style.bottom = "18px";
    el.style.left = "50%";
    el.style.transform = "translateX(-50%)";
    el.style.background = "rgba(8,12,16,.9)";
    el.style.color = "#d1fae5";
    el.style.padding = "10px 14px";
    el.style.borderRadius = "12px";
    el.style.boxShadow = "0 6px 18px rgba(2,6,23,.6)";
    el.style.zIndex = "9999";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  noticeTimeout = setTimeout(() => {
    el.style.opacity = "0";
  }, 1500);
}

// --- BUTTONS ---
addTabBtn.addEventListener("click", () => {
  const name = prompt("Name for new tab", "New tab");
  if (name === null) return;
  const tab = {
    id: uid("tab"),
    name: name.trim() || "New tab",
    fields: [{ id: uid("f"), type: "label", label: "Title", value: "" }],
  };
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  saveState();
  render();
});
addLabelBtn.addEventListener("click", () => {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) return;
  const lbl = prompt("Label for new text field", "Text");
  tab.fields.push({
    id: uid("f"),
    type: "label",
    label: lbl === null ? "Text" : lbl.trim() || "Text",
    value: "",
  });
  saveState();
  renderNoteArea();
});
addTextareaBtn.addEventListener("click", () => {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) return;
  const lbl = prompt("Label for new note field", "Note");
  tab.fields.push({
    id: uid("f"),
    type: "textarea",
    label: lbl === null ? "Note" : lbl.trim() || "Note",
    value: "",
  });
  saveState();
  renderNoteArea();
});
clearTabBtn.addEventListener("click", () => {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) return;

  if (!confirm('Clear all fields in tab "' + tab.name + '"?')) return;

  tab.fields.forEach((f) => {
    if (f.type !== "image") f.value = "";
  });

  if (state.settings.clearTabDeletesImages) {
    tab.fields = tab.fields.filter((f) => f.type !== "image");
  }
  saveState();
  renderNoteArea();
});
addTemplateBtn.addEventListener("click", () => {
  const tab = state.tabs.find((t) => t.id === state.activeTabId);
  if (!tab) return;

  tab.fields.push({
    id: uid("f"),
    type: "template",
    label: "Template",
    value: "",
  });

  saveState();
  renderNoteArea();
});

exportBtn.addEventListener("click", () => {
  try {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notebook-backup-${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flashNotice("Exported to file");
  } catch (e) {
    alert("Could not export: " + e.message);
  }
});
importBtn.addEventListener("click", () => {
  importFile.click();
});
importFile.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) {
    handleImportFile(f);
    importFile.value = "";
  }
});

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!imported || !Array.isArray(imported.tabs))
        throw new Error("Invalid format");
      const replace = confirm(
        "Replace existing notes with file contents? (OK = Replace, Cancel = Merge)",
      );
      if (replace) {
        state.tabs = imported.tabs.map((t) => ({
          id: uid("tab"),
          name: t.name || "Imported tab",
          fields: Array.isArray(t.fields) ? t.fields.map(importField) : [],
        }));
        state.activeTabId = state.tabs.length ? state.tabs[0].id : null;
        saveState();
        render();
        flashNotice("Import completed: Replaced existing");
      } else {
        imported.tabs.forEach((t) => {
          const tab = {
            id: uid("tab"),
            name: t.name || "Imported tab",
            fields: Array.isArray(t.fields) ? t.fields.map(importField) : [],
          };
          state.tabs.push(tab);
        });
        if (!state.activeTabId && state.tabs.length)
          state.activeTabId = state.tabs[0].id;
        saveState();
        render();
        flashNotice("Import completed: Merged");
      }
    } catch (err) {
      alert("Import error: " + err.message);
    }
  };
  reader.onerror = () => {
    alert("Could not read file");
  };
  reader.readAsText(file);
}

function importField(f) {
  if (f.type === "image") {
    return {
      id: uid("f"),
      type: "image",
      label: f.label || "Image",
      value: f.value || "",
      width: typeof f.width === "number" ? f.width : undefined,
      height: typeof f.height === "number" ? f.height : undefined,
    };
  }

  if (f.type === "image" && typeof f.value !== "string") {
    console.warn("Skipping invalid image field", f);
    return null;
  }

  if (f.type === "textarea") {
    return {
      id: uid("f"),
      type: "textarea",
      label: f.label || "Text",
      value: f.value || "",
    };
  }

  return {
    id: uid("f"),
    type: "label",
    label: f.label || "Text",
    value: f.value || "",
  };
}

function getAllFields() {
  return state.tabs.flatMap((t) => t.fields);
}

// --- TEMPLATE RESOLVERS ---
function resolveTemplate(template, fields) {
  return template.replace(/\$\((.*?)\)/g, (_, expr) => {
    return resolvePlaceholder(expr, fields);
  });
}
function resolvePlaceholder(expr, fields) {
  let tabName = null;
  let keyAndParam = expr;

  // Tab-qualified reference: Tab.Field|param
  if (expr.includes(".")) {
    const parts = expr.split(".");
    tabName = parts.shift();
    keyAndParam = parts.join(".");
  }

  const [key, param] = keyAndParam.split("|");

  const field = fields.find((f) => {
    if (tabName) {
      const parentTab = state.tabs.find((t) => t.fields.includes(f));
      if (!parentTab || parentTab.name !== tabName) return false;
    }
    return f.label === key || f.id === key;
  });

  if (!field || typeof field.value !== "string") return "";

  const lines = field.value.split(/\r?\n/);

  if (!param) return field.value;

  if (/^\d+$/.test(param)) {
    return lines[parseInt(param, 10) - 1] ?? "";
  }

  switch (param.toLowerCase()) {
    case "csv":
      return lines
        .map((l) => l.trim())
        .filter(Boolean)
        .join(",");
    case "lines":
      return field.value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .join("\n");
    default:
      return field.value;
  }
}

// --- SETTINGS DIALOG ---
const settingsDialog = document.getElementById("settingsDialog");

const experimentalToggle = document.getElementById("experimentalToggle");
const clearImageToggle = document.getElementById("clearImageToggle");

experimentalToggle.checked = state.settings.experimental;
clearImageToggle.checked = state.settings.clearTabDeletesImages;

experimentalToggle.addEventListener("change", () => {
  state.settings.experimental = experimentalToggle.checked;
  saveState();
  syncExperimentalUI();
});

clearImageToggle.addEventListener("change", () => {
  state.settings.clearTabDeletesImages = clearImageToggle.checked;
  saveState();
});

function syncSettingsUI() {
  experimentalToggle.checked = !!state.settings.experimental;
  clearImageToggle.checked = !!state.settings.clearTabDeletesImages;
  syncExperimentalUI();
}

function syncExperimentalUI() {
  if (state.settings.experimental) {
    addTemplateBtn.classList.remove("hidden");
  } else {
    addTemplateBtn.classList.add("hidden");
  }
}

document.getElementById("settingsBtn").addEventListener("click", () => {
  settingsDialog.showModal();
  openSettings();
});

function openSettings() {
  const styles = getComputedStyle(document.documentElement);

  settingsDialog.querySelectorAll(".color-row").forEach((row) => {
    const colorInput = row.querySelector('input[type="color"]');
    const textInput = row.querySelector(".color-text");
    const cssVar = colorInput.dataset.cssVar;

    const value =
      styles.getPropertyValue(cssVar).trim() || DEFAULT_COLORS[cssVar];

    colorInput.value = value;
    textInput.value = value;

    setupColorPicker(colorInput, textInput, cssVar);
  });
}

// --- ABOUT DIALOG ---
const aboutDialog = document.getElementById("aboutDialog");
const version =
  document.querySelector('meta[name="app-version"]')?.content || "unknown";

document.getElementById("aboutVersion").textContent = `Version ${version}`;

document.getElementById("aboutBtn").addEventListener("click", () => {
  aboutDialog.showModal();
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (e) => {
    const rect = dialog.getBoundingClientRect();
    const clickedOutside =
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom;

    if (clickedOutside) {
      dialog.close();
    }
  });
});

// --- COLOR THEME MANAGER ---
settingsDialog.addEventListener("input", (e) => {
  const input = e.target;
  const cssVar = input.dataset.cssVar;
  if (!cssVar) return;

  document.documentElement.style.setProperty(cssVar, input.value);

  saveLiveColors();
});

function saveLiveColors() {
  const colors = getCurrentColors();
  localStorage.setItem(LIVE_COLORS_KEY, JSON.stringify(colors));
}

document.getElementById("resetColorsBtn").addEventListener("click", () => {
  applyThemeByName("Default Dark");
  localStorage.removeItem(LIVE_COLORS_KEY);
  openSettings();
});

function setupColorPicker(colorInput, textInput, cssVar) {
  // Color picker → text input + CSS var
  colorInput.addEventListener("input", () => {
    textInput.value = colorInput.value;
    document.documentElement.style.setProperty(cssVar, colorInput.value);
    saveLiveColors();
  });

  // Text input → color picker + CSS var
  textInput.addEventListener("input", () => {
    const val = textInput.value.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val)) {
      colorInput.value = val;
      document.documentElement.style.setProperty(cssVar, val);
      saveLiveColors();
    }
  });
}

// Themes
function loadThemes() {
  return JSON.parse(localStorage.getItem(THEMES_KEY) || "[]");
}

function saveThemes(themes) {
  localStorage.setItem(THEMES_KEY, JSON.stringify(themes));
}

function renderThemeSelect() {
  const select = document.getElementById("themeSelect");
  select.innerHTML = "";

  // Default themes
  Object.keys(DEFAULT_THEMES).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  // User themes
  loadThemes().forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.name;
    opt.textContent = t.name;
    select.appendChild(opt);
  });

  // Restore active theme
  const active = localStorage.getItem(ACTIVE_THEME_KEY) || "Default Dark";
  select.value = active;
}
renderThemeSelect();

function applyThemeByName(name, options = { clearLive: true }) {
  let colors;

  if (options.clearLive) {
    localStorage.removeItem(LIVE_COLORS_KEY); // only remove if explicitly requested
  }

  localStorage.setItem(ACTIVE_THEME_KEY, name);

  if (isDefaultTheme(name)) {
    colors = DEFAULT_THEMES[name];
  } else {
    const theme = loadThemes().find((t) => t.name === name);
    if (!theme) return;
    colors = theme.colors;
  }

  for (const key in DEFAULT_COLORS) {
    if (colors[key]) {
      document.documentElement.style.setProperty(key, colors[key]);
    }
  }
}

document.getElementById("themeSelect").addEventListener("change", (e) => {
  const name = e.target.value;
  applyThemeByName(name);
  openSettings(); // re-sync color inputs
});

// Add theme button handler
document.getElementById("addThemeBtn").addEventListener("click", () => {
  const name = prompt("Name for the new theme");
  if (!name) return;

  const styles = getComputedStyle(document.documentElement);
  const colors = {};
  for (const key in DEFAULT_COLORS) {
    colors[key] = styles.getPropertyValue(key).trim();
  }

  // Load existing themes
  const themes = JSON.parse(localStorage.getItem(THEMES_KEY) || "[]");

  // Add new theme
  themes.push({ name: name.trim(), colors });
  localStorage.setItem(THEMES_KEY, JSON.stringify(themes));

  // Re-render dropdown
  renderThemeSelect();

  flashNotice(`Theme "${name.trim()}" added`);
});

document.getElementById("exportThemeBtn").addEventListener("click", () => {
  const name = prompt("Theme name:");
  if (!name) return;

  const colors = {};
  for (const key in DEFAULT_COLORS) {
    colors[key] = getComputedStyle(document.documentElement)
      .getPropertyValue(key)
      .trim();
  }

  const data = {
    name,
    colors,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/\s+/g, "-")}-notabletheme.json`;
  a.click();
});

document.getElementById("importThemeBtn").addEventListener("click", () => {
  document.getElementById("importThemeFile").click();
});

document.getElementById("importThemeFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.name || !imported.colors) throw "Invalid theme file";

      const themes = loadThemes();

      // Prevent duplicate names
      if (themes.some((t) => t.name === imported.name)) {
        imported.name += " (imported)";
      }

      // Add imported theme
      themes.push(imported);
      saveThemes(themes);
      renderThemeSelect();

      // **Apply the imported theme**
      applyThemeByName(imported.name, { clearLive: true });

      // **Set as active theme in storage**
      localStorage.setItem(ACTIVE_THEME_KEY, imported.name);

      flashNotice(`Theme "${imported.name}" imported and applied`);
    } catch {
      alert("Invalid theme file");
    }
  };
  reader.readAsText(file);
});

document.getElementById("deleteThemeBtn").addEventListener("click", () => {
  const select = document.getElementById("themeSelect");
  const name = select.value;

  if (isDefaultTheme(name)) {
    alert("Default themes cannot be deleted");
    return;
  }

  if (!confirm(`Delete theme "${name}"?`)) return;

  const themes = loadThemes().filter((t) => t.name !== name);
  saveThemes(themes);

  localStorage.setItem(ACTIVE_THEME_KEY, "Default Dark");
  applyThemeByName("Default Dark");

  renderThemeSelect();
  openSettings();
});

function getCurrentColors() {
  const styles = getComputedStyle(document.documentElement);
  const colors = {};
  for (const key in DEFAULT_COLORS) {
    colors[key] = styles.getPropertyValue(key).trim();
  }
  return colors;
}

document.getElementById("applyThemeBtn").addEventListener("click", () => {
  const select = document.getElementById("themeSelect");
  const selectedName = select.value;

  // Block default themes
  if (isDefaultTheme(selectedName)) {
    alert("Default themes cannot be modified.");
    return;
  }

  const themes = loadThemes();
  const theme = themes.find((t) => t.name === selectedName);
  if (!theme) {
    alert("Theme not found.");
    return;
  }

  // Apply current CSS colors to theme
  theme.colors = getCurrentColors();
  saveThemes(themes);

  flashNotice(`Theme "${selectedName}" updated`);
});

document.getElementById("reapplyThemeBtn").addEventListener("click", () => {
  const select = document.getElementById("themeSelect");
  const selectedName = select.value;
  if (!selectedName) return;

  applyThemeByName(selectedName); // reapply the theme
  openSettings(); // sync color pickers
  flashNotice(`Theme "${selectedName}" reapplied`);
});

document.getElementById("themeSelect").addEventListener("contextmenu", (e) => {
  e.preventDefault();

  const oldName = e.target.value;
  if (isDefaultTheme(oldName)) return;

  const newName = prompt("Rename theme:", oldName);
  if (!newName || newName === oldName) return;

  const themes = loadThemes();
  const theme = themes.find((t) => t.name === oldName);
  if (!theme) return;

  theme.name = newName;
  saveThemes(themes);
  localStorage.setItem(ACTIVE_THEME_KEY, newName);

  renderThemeSelect();
});

// Show the "New update available!" pill
function showUpdatePill() {
  const controls = document.querySelector(".controls");

  // Remove existing pill if any
  let existing = controls.querySelector("#__update_pill");
  if (existing) existing.remove();

  // Create pill using the same class as your old pill
  const pill = document.createElement("span");
  pill.id = "__update_pill";
  pill.className = "pill"; // reuse styling
  pill.textContent = "New update available!";
  pill.style.cursor = "pointer";

  // When clicked, activate new SW and reload
  pill.addEventListener("click", () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SKIP_WAITING",
      });
      window.location.reload();
    }
  });

  // Insert pill as the **first element** in .controls
  controls.insertBefore(pill, controls.firstChild);
}

// --- RENDER NOTES AND TABS ---
function render() {
  ensureDefault();
  renderTabs();
  renderNoteArea();
}
loadState();
ensureSettings();
ensureDefault();
render();
syncSettingsUI();

window.addEventListener("beforeunload", saveState);

document.addEventListener("DOMContentLoaded", () => {
  const metaVersion = document
    .querySelector('meta[name="app-version"]')
    ?.getAttribute("content");

  const versionTarget = document.getElementById("app-version");
  if (versionTarget && metaVersion) {
    versionTarget.textContent = `Version ${metaVersion}`;
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js?ver=2")
    .then((reg) => {
      console.log("Service Worker registered:", reg);

      // Listen for updates
      reg.addEventListener("updatefound", () => {
        const newSW = reg.installing;
        newSW.addEventListener("statechange", () => {
          if (
            newSW.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            // New update available
            showUpdatePill();
          }
        });
      });
    })
    .catch((err) => console.error("SW registration failed:", err));
}
