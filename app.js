let boards = JSON.parse(localStorage.getItem("jeopardyBoards") || "{}");
let currentBoard = null;
let currentQuestion = null;
let editingMedia = [];
let teams = [];
let mediaDB;

const boardSelect = document.getElementById("boardSelect");
const mainMenu = document.getElementById("mainMenu");
const editor = document.getElementById("editor");
const playMode = document.getElementById("playMode");
const questionModal = document.getElementById("questionModal");
const scoreboard = document.getElementById("scoreboard");

function saveLocal() {
  localStorage.setItem("jeopardyBoards", JSON.stringify(boards));
}

function refreshDropdown() {
  boardSelect.innerHTML = "";
  for (let name in boards) {
    let opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    boardSelect.appendChild(opt);
  }
}
refreshDropdown();

// ------------- MEDIA DATABASE -------------
async function initMediaDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("QuizMediaDB", 1);

    request.onupgradeneeded = function (event) {
      mediaDB = event.target.result;
      if (!mediaDB.objectStoreNames.contains("media")) {
        mediaDB.createObjectStore("media", { keyPath: "id" });
      }
    };

    request.onsuccess = function (event) {
      mediaDB = event.target.result;
      resolve();
    };

    request.onerror = function () {
      reject("IndexedDB failed to open.");
    };
  });
}
initMediaDB();

function saveMediaBlob(id, blob) {
  return new Promise((resolve, reject) => {
    const tx = mediaDB.transaction("media", "readwrite");
    const store = tx.objectStore("media");

    store.put({ id, blob });

    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

function getMediaBlob(id) {
  return new Promise((resolve, reject) => {
    const tx = mediaDB.transaction("media", "readonly");
    const store = tx.objectStore("media");

    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result ? request.result.blob : null);
    };

    request.onerror = reject;
  });
}

function deleteMediaBlob(id) {
  const tx = mediaDB.transaction("media", "readwrite");
  tx.objectStore("media").delete(id);
}

// ------------- INITIALIZE -------------
async function initApp() {
  boards = JSON.parse(localStorage.getItem("jeopardyBoards") || "{}");
  await initMediaDB();
  refreshDropdown();

  document.getElementById("newBoardBtn").onclick = createBoard;
  document.getElementById("editBoardBtn").onclick = editBoard;
  document.getElementById("playBoardBtn").onclick = playBoard;
  document.getElementById("deleteBoardBtn").onclick = deleteBoard;
  document.getElementById("exportBoardBtn").onclick = exportBoard;
  document.getElementById("importFile").onchange = importBoard;
  document.getElementById("generateGridBtn").onclick = generateGrid;
  document.getElementById("saveBoardBtn").onclick = saveBoard;
  document.getElementById("addTeamBtn").onclick = addTeam;
  document.getElementById("finalBtn").onclick = openFinalQuestion;

  document.querySelectorAll(".backBtn").forEach((btn) => {
    btn.onclick = backToMenu;
  });
}
initApp();

const aboutBtn = document.getElementById("aboutInfo");
const infoModal = document.getElementById("infoModal");

aboutBtn.addEventListener("click", () => {
  infoModal.classList.add("active");
});

infoModal.addEventListener("click", (e) => {
  if (e.target === infoModal) {
    infoModal.classList.remove("active");
  }
});

document.getElementById("closeInfo").addEventListener("click", () => {
  infoModal.classList.remove("active");
});

// ------------- BOARD MANAGEMENT -------------
function createBoard() {
  let name = prompt("Board name?");
  if (!name) return;
  boards[name] = {
    categories: [],
    final: null,
    visibleCategories: 5,
    visibleRows: 5,
  };

  saveLocal();
  refreshDropdown();
}

function deleteBoard() {
  let name = boardSelect.value;
  if (confirm("Delete board?")) {
    delete boards[name];
    saveLocal();
    refreshDropdown();
  }
}

function editBoard() {
  let name = boardSelect.value;
  if (!name) return;
  currentBoard = boards[name];

  document.getElementById("catCount").value =
    currentBoard.visibleCategories || 5;
  document.getElementById("rowCount").value = currentBoard.visibleRows || 5;

  mainMenu.classList.add("hidden");
  editor.classList.remove("hidden");
  generateGrid();
}

function playBoard() {
  let name = boardSelect.value;
  currentBoard = boards[name];
  mainMenu.classList.add("hidden");
  playMode.classList.remove("hidden");
  buildBoard();
}

function backToMenu() {
  editor.classList.add("hidden");
  playMode.classList.add("hidden");
  mainMenu.classList.remove("hidden");
}

// ------------- EDITOR -------------
function generateGrid() {
  let requestedCats = parseInt(document.getElementById("catCount").value);
  let requestedRows = parseInt(document.getElementById("rowCount").value);

  if (!currentBoard.visibleCategories)
    currentBoard.visibleCategories = requestedCats;
  if (!currentBoard.visibleRows) currentBoard.visibleRows = requestedRows;

  currentBoard.visibleCategories = requestedCats;
  currentBoard.visibleRows = requestedRows;

  while (currentBoard.categories.length < requestedCats) {
    currentBoard.categories.push({
      title: "Category " + (currentBoard.categories.length + 1),
      questions: [],
    });
  }

  currentBoard.categories.forEach((cat) => {
    while (cat.questions.length < requestedRows) {
      cat.questions.push({
        value: (cat.questions.length + 1) * 100,
        type: "text",
        question: "",
        answer: "",
        media: [],
      });
    }
  });

  renderEditorGrid();
}

function renderEditorGrid() {
  const grid = document.getElementById("editorGrid");
  grid.innerHTML = "";

  const columnsRow = document.createElement("div");
  columnsRow.className = "editorGridColumns";
  for (let c = 0; c < currentBoard.visibleCategories; c++) {
    let category = currentBoard.categories[c];

    let div = document.createElement("div");
    div.className = "editorColumn";

    let title = document.createElement("h3");
    title.contentEditable = true;
    title.textContent = category.title;
    title.oninput = () => (category.title = title.textContent);

    div.appendChild(title);

    for (let r = 0; r < currentBoard.visibleRows; r++) {
      let q = category.questions[r];

      const btn = document.createElement("button");
      btn.className = "editorTile";
      btn.onclick = () => editQuestion(c, r);

      const valueSpan = document.createElement("span");
      valueSpan.className = "editorTileValue";
      valueSpan.textContent = "$" + q.value;

      const icon = document.createElement("i");
      icon.className = getQuestionIconClass(q.type) + " editorTileIcon";

      btn.appendChild(icon);
      btn.appendChild(valueSpan);

      q._editorButton = btn;

      q._editorButton = btn;

      div.appendChild(btn);
    }

    columnsRow.appendChild(div);
  }
  grid.appendChild(columnsRow);

  const finalRow = document.createElement("div");
  finalRow.className = "finalRow";
  const editFinalBtn = document.createElement("button");
  editFinalBtn.textContent = "Final Jeopardy";
  editFinalBtn.className = "editFinalBtn";
  editFinalBtn.onclick = () => editFinal();

  finalRow.appendChild(editFinalBtn);
  grid.appendChild(finalRow);
}

function getQuestionIconClass(type) {
  switch (type) {
    case "video":
      return "fa-solid fa-video";
    case "audio":
      return "fa-solid fa-volume-high";
    case "text":
    default:
      return "fa-solid fa-font";
  }
}

let editingCoords = null;

async function editQuestion(c, r) {
  try {
    editingCoords = { c, r };
    const q = currentBoard.categories[c].questions[r];

    document.getElementById("editValue").value = q.value;
    document.getElementById("editHintCost").value = q.hintCost || 0;
    document.getElementById("editType").value = q.type;
    document.getElementById("editQuestionText").value = q.question;
    document.getElementById("editAnswerText").value = q.answer;

    editingMedia = [];

    if (q.media && Array.isArray(q.media)) {
      for (let m of q.media) {
        if (m.type === "embed") {
          editingMedia.push({
            type: "embed",
            url: m.url || "",
            label: m.label || "",
            role: m.role || "question",
            name: m.name || "Embedded Media",
            mediaId: m.mediaId || null,
          });
        } else {
          try {
            const blob = await getMediaBlob(m.mediaId);
            if (!blob) continue;
            editingMedia.push({
              mediaId: m.mediaId,
              label: m.label || "",
              type: blob.type,
              name: m.name || "Imported File",
              tempFile: blob,
              role: m.role || "question",
            });
          } catch (err) {
            console.warn("Failed to load media", m, err);
          }
        }
      }
    }

    await renderMediaPreview();

    document.getElementById("editMedia").value = "";
    document.getElementById("editorModal").classList.add("active");
  } catch (err) {
    console.error("Error opening editor:", err);
    alert("Failed to open editor. See console for details.");
  }
}

document.getElementById("addMediaBtn").onclick = () => {
  document.getElementById("editMedia").click();
};

document.getElementById("addEmbedBtn").onclick = () => {
  addEmbedInput();
};

document.getElementById("editMedia").addEventListener("change", async (e) => {
  const files = e.target.files;

  for (let file of files) {
    const mediaId = "media_" + crypto.randomUUID();

    await saveMediaBlob(mediaId, file);

    editingMedia.push({
      mediaId: mediaId,
      label: "",
      type: file.type,
      name: file.name,
      role: "question",
    });
  }

  renderMediaPreview();
  e.target.value = "";
});

function addEmbedInput() {
  const container = document.getElementById("mediaPreviewList");

  const embedObj = {
    type: "embed",
    url: "",
    label: "",
    role: "question",
  };

  editingMedia.push(embedObj);
  renderMediaPreview();
}

function editFinal() {
  if (!currentBoard.final) {
    currentBoard.final = {
      value: 0,
      type: "text",
      question: "",
      answer: "",
      media: [],
      hintCost: 0,
    };
  }
  editQuestionFinal(currentBoard.final);
}

async function editQuestionFinal(finalQuestion) {
  editingCoords = null;
  const q = finalQuestion;

  document.getElementById("editValue").value = q.value || 0;
  document.getElementById("editHintCost").value = q.hintCost || 0;
  document.getElementById("editType").value = q.type || "text";
  document.getElementById("editQuestionText").value = q.question || "";
  document.getElementById("editAnswerText").value = q.answer || "";

  editingMedia = [];

  if (q.media && Array.isArray(q.media)) {
    for (let m of q.media) {
      if (!m.mediaId) continue;
      const blob = await getMediaBlob(m.mediaId);
      if (!blob) continue;
      editingMedia.push({
        mediaId: m.mediaId,
        label: m.label || "",
        type: blob.type,
        name: m.name || "Imported File",
        tempFile: blob,
        role: m.role || "question",
      });
    }
  }

  renderMediaPreview();
  document.getElementById("editMedia").value = "";
  document.getElementById("editorModal").classList.add("active");
}

async function renderMediaPreview() {
  const container = document.getElementById("mediaPreviewList");
  container.innerHTML = "";

  for (let index = 0; index < editingMedia.length; index++) {
    const file = editingMedia[index];
    const isEmbed = file.type === "embed";

    const wrapper = document.createElement("div");
    wrapper.className = "mediaItem";

    const previewWrapper = document.createElement("div");
    previewWrapper.className = "mediaPreviewWrapper";

    // Label and media display role
    const labelRoleRow = document.createElement("div");
    labelRoleRow.style.display = "flex";
    labelRoleRow.style.gap = "10px";
    labelRoleRow.style.alignItems = "center";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.placeholder = "Optional label: $(hint)";
    labelInput.value = file.label || "";
    labelInput.className = "mediaLabelInput";
    labelInput.addEventListener("input", () => {
      file.label = labelInput.value;
    });

    const roleSelect = document.createElement("select");
    roleSelect.className = "mediaRoleSelect";

    const roles = [
      { value: "question", text: "Question" },
      { value: "hint", text: "Hint" },
      { value: "answer", text: "Answer" },
    ];

    roles.forEach((r) => {
      const option = document.createElement("option");
      option.value = r.value;
      option.textContent = r.text;
      if ((file.role || "question") === r.value) {
        option.selected = true;
      }
      roleSelect.appendChild(option);
    });

    roleSelect.addEventListener("change", () => {
      file.role = roleSelect.value;
    });

    labelRoleRow.appendChild(labelInput);
    labelRoleRow.appendChild(roleSelect);
    wrapper.appendChild(labelRoleRow);

    let preview;
    
    // Embed media
    if (isEmbed) {
      const urlPreviewRow = document.createElement("div");
      urlPreviewRow.className = "mediaUrlPreviewRow";

      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.placeholder = "Enter media URL...";
      urlInput.value = file.url || "";
      urlInput.className = "mediaUrlInput";
      urlInput.addEventListener("input", () => {
        file.url = urlInput.value;
      });

      const previewBtn = document.createElement("button");
      previewBtn.textContent = "Preview";
      previewBtn.className = "previewMediaBtn";

      urlPreviewRow.appendChild(urlInput);
      urlPreviewRow.appendChild(previewBtn);
      wrapper.appendChild(urlPreviewRow);

      const previewContainer = document.createElement("div");
      previewContainer.className = "embedPreviewContainer";

      const placeholder = document.createElement("div");
      placeholder.className = "embedPreviewPlaceholder";
      placeholder.textContent = "Embedded media (no preview yet)";

      previewContainer.appendChild(placeholder);
      previewWrapper.appendChild(previewContainer);

      if (file.url && file.url.trim()) {
        renderEmbedPreview(file, previewContainer);
      }

      previewBtn.onclick = () => renderEmbedPreview(file, previewContainer);
    } else {
      if (file.type.startsWith("image/")) {
        preview = document.createElement("img");
      } else if (file.type.startsWith("audio/")) {
        preview = document.createElement("audio");
        preview.controls = true;
      } else if (file.type.startsWith("video/")) {
        preview = document.createElement("video");
        preview.controls = true;
      } else {
        preview = document.createElement("div");
        preview.textContent = file.name;
      }

      if (file.mediaId && file.tempFile) {
        preview.src = URL.createObjectURL(file.tempFile);
      }

      preview.className = "mediaPreview";
      previewWrapper.appendChild(preview);
    }

    const removeBtn = document.createElement("button");
    removeBtn.innerHTML = "<span>✕</span>";
    removeBtn.className = "removeMediaBtn";
    removeBtn.onclick = () => {
      if (file.mediaId) deleteMediaBlob(file.mediaId);
      editingMedia.splice(index, 1);
      renderMediaPreview();
    };

    wrapper.appendChild(previewWrapper);
    previewWrapper.appendChild(removeBtn);
    container.appendChild(wrapper);
  }
}

function renderEmbedPreview(file, previewContainer) {
  previewContainer.innerHTML = "";

  const url = file.url?.trim();
  if (!url) return;

  let element;

  if (url.match(/\.(mp4|webm|ogg)$/i)) {
    element = document.createElement("video");
    element.controls = true;
    element.src = url;
  } else if (url.match(/\.(mp3|wav|ogg)$/i)) {
    element = document.createElement("audio");
    element.controls = true;
    element.src = url;
  } else if (url.match(/\.(jpg|jpeg|png|gif|webp|avif)$/i)) {
    element = document.createElement("img");
    element.src = url;
  } else if (url.includes("youtube.com") || url.includes("youtu.be")) {
    element = document.createElement("iframe");
    element.src = convertYouTubeUrl(url);
    element.allowFullscreen = true;
  } else {
    previewContainer.textContent = "Unsupported embed format.";
    return;
  }

  element.className = "mediaPreview";
  previewContainer.appendChild(element);
}

function convertYouTubeUrl(url) {
  const match = url.match(/(?:v=|youtu\.be\/)([^&]+)/);
  if (!match) return url;
  return `https://www.youtube.com/embed/${match[1]}`;
}

document.getElementById("cancelQuestionBtn").onclick = () => {
  document.getElementById("editorModal").classList.remove("active");
};

document.getElementById("saveQuestionBtn").onclick = async () => {
  let q;

  if (editingCoords) {
    const { c, r } = editingCoords;
    q = currentBoard.categories[c].questions[r];
  } else {
    q = currentBoard.final;
  }

  q.value = parseInt(document.getElementById("editValue").value) || 0;
  q.hintCost = parseInt(document.getElementById("editHintCost").value) || 0;
  q.type = document.getElementById("editType").value;
  q.question = document.getElementById("editQuestionText").value;
  q.answer = document.getElementById("editAnswerText").value;

  const finalMedia = [];

  for (let m of editingMedia) {
    if (m.tempFile) {
      await saveMediaBlob(m.mediaId, m.tempFile);
    }

    if (m.type === "embed" && !m.mediaId) {
      m.mediaId = "embed_" + crypto.randomUUID();
    }

    finalMedia.push({
      mediaId: m.mediaId,
      label: m.label || "",
      type: m.type,
      name: m.name,
      role: m.role || "question",
      url: m.type === "embed" ? m.url : undefined,
    });
  }

  q.media = finalMedia;

  if (q._editorButton) {
    const valueEl = q._editorButton.querySelector(".editorTileValue");
    const iconEl = q._editorButton.querySelector(".editorTileIcon");

    if (valueEl) {
      valueEl.textContent = "$" + q.value;
    }

    if (iconEl) {
      iconEl.className = getQuestionIconClass(q.type) + " editorTileIcon";
    }
  }

  q.type = document.getElementById("editType").value;
  q.question = document.getElementById("editQuestionText").value;
  q.answer = document.getElementById("editAnswerText").value;

  document.getElementById("editorModal").classList.remove("active");

  saveLocal();
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

function saveBoard() {
  saveLocal();
  showToast("Saved!");
}

function showToast(message, duration = 2000) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => container.removeChild(toast), 400);
  }, duration);
}

// ------------- PLAY MODE -------------
function buildBoard() {
  let table = document.getElementById("board");
  table.innerHTML = "";
  scoreboard.innerHTML = "";

  let header = document.createElement("tr");
  for (let c = 0; c < currentBoard.visibleCategories; c++) {
    let cat = currentBoard.categories[c];
    let th = document.createElement("th");
    th.textContent = cat.title;
    header.appendChild(th);
  }
  table.appendChild(header);

  let rows = currentBoard.visibleRows;
  for (let r = 0; r < rows; r++) {
    let tr = document.createElement("tr");
    for (let c = 0; c < currentBoard.visibleCategories; c++) {
      let cat = currentBoard.categories[c];
      let td = document.createElement("td");
      let q = cat.questions[r];
      td.textContent = "$" + q.value;
      td.className = "tile";
      td.onclick = () => openQuestion(c, r, td);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
}

function openQuestion(c, r, tile) {
  currentQuestion = { c, r, tile };

  const q = currentBoard.categories[c].questions[r];
  const category = currentBoard.categories[c];

  openPlayableQuestion(q, {
    tile: tile,
    categoryTitle: category.title,
    value: q.value,
    isFinal: false,
  });
}

function openFinalQuestion() {
  openPlayableQuestion(currentBoard.final, {
    isFinal: true,
  });
}

async function openPlayableQuestion(questionData, config = {}) {
  const {
    tile = null,
    categoryTitle = "",
    value = "",
    isFinal = false,
  } = config;

  const questionModal = document.getElementById("questionModal");

  questionModal.innerHTML = "";
  questionModal.classList.add("active");

  const content = document.createElement("div");
  content.className = "questionContent";

  const q = questionData;

  // Header
  const header = document.createElement("h2");
  header.className = "questionHeader";

  if (isFinal) {
    header.textContent = "Final Jeopardy";
  } else {
    header.textContent = `${categoryTitle}  $${value}`;
  }

  content.appendChild(header);

  // Question + Answer
  if (q.question && q.question.trim() !== "") {
    const questionText = document.createElement("div");
    questionText.className = "questionText";
    questionText.textContent = q.question;
    content.appendChild(questionText);
  }
  const answerEl = document.createElement("div");
  answerEl.className = "questionAnswer hiddenAnswer";
  answerEl.textContent = q.answer;
  content.appendChild(answerEl);

  // Media
  let mediaContainer = null;
  let questionMedia = [];
  let hintMedia = [];
  let answerMedia = [];
  let missingMediaDetected = false;

  if (q.media && q.media.length > 0) {
    for (let file of q.media) {
      if (file.role === "hint") hintMedia.push(file);
      else if (file.role === "answer") answerMedia.push(file);
      else questionMedia.push(file);
    }

    mediaContainer = document.createElement("div");
    mediaContainer.className = "questionMedia";

    content.appendChild(mediaContainer);

    async function renderMediaSet(mediaArray) {
      mediaContainer.innerHTML = "";
      missingMediaDetected = false;

      for (let file of mediaArray) {
        if (file.type === "embed") {
          renderEmbedInModal(file, mediaContainer);
          continue;
        }

        const blob = await getMediaBlob(file.mediaId);
        if (!blob) {
          missingMediaDetected = true;
          continue;
        }

        const url = URL.createObjectURL(blob);

        const labelText = file.label
          ? file.label.replace(/\$\(\s*hint\s*\)/gi, `$${q.hintCost || 0}`)
          : "";

        let element;

        if (blob.type.startsWith("video/")) {
          element = document.createElement("video");
          element.controls = true;
          element.style.maxWidth = "80vw";
        } else if (blob.type.startsWith("audio/")) {
          element = document.createElement("audio");
          element.controls = true;
        } else if (blob.type.startsWith("image/")) {
          element = document.createElement("img");
          element.style.maxWidth = "600px";
        }

        if (element) {
          element.src = url;

          const wrapper = document.createElement("div");
          wrapper.className = "questionMediaWrapper";

          wrapper.appendChild(element);

          const labelEl = document.createElement("span");
          labelEl.textContent = labelText || "";
          labelEl.className = "questionMediaLabel";
          wrapper.appendChild(labelEl);

          mediaContainer.appendChild(wrapper);
        }
      }

      if (missingMediaDetected) {
        const warning = document.createElement("div");
        warning.className = "missingMediaWarning";
        warning.textContent = "Media file missing. Please re-import the board.";
        mediaContainer.appendChild(warning);
      }
    }

    await renderMediaSet(questionMedia);

    if (hintMedia.length > 0) {
      const hintWrapper = document.createElement("div");
      hintWrapper.className = "questionMediaWrapper";

      const hintBtn = document.createElement("button");
      const cost = q.hintCost || 0;
      hintBtn.textContent = cost > 0 ? `Show Hint ($${cost})` : "Show Hint";
      hintBtn.className = "questionMediaHintBtn";

      hintBtn.onclick = async () => {
        await renderMediaSet([...questionMedia, ...hintMedia]);
      };

      hintWrapper.appendChild(hintBtn);

      // Add empty label placeholder so layout stays aligned
      const labelPlaceholder = document.createElement("span");
      labelPlaceholder.className = "questionMediaLabel";
      labelPlaceholder.textContent = "";
      hintWrapper.appendChild(labelPlaceholder);

      mediaContainer.appendChild(hintWrapper);
    }

    content._renderMediaSet = renderMediaSet;
  }

  questionModal.appendChild(content);

  // Buttons
  const buttonRow = document.createElement("div");
  buttonRow.className = "questionButtons";

  const showAns = document.createElement("button");
  showAns.textContent = "Show Answer";

  showAns.onclick = async () => {
    answerEl.classList.add("visibleAnswer");

    if (tile) {
      tile.classList.add("blank");
      tile.textContent = "";
    }

    if (mediaContainer && answerMedia.length > 0 && content._renderMediaSet) {
      await content._renderMediaSet(answerMedia);
    }
  };

  const back = document.createElement("button");
  back.textContent = "Back to Board";
  back.onclick = () => {
    questionModal.classList.remove("active");
  };

  buttonRow.appendChild(showAns);
  buttonRow.appendChild(back);

  questionModal.appendChild(buttonRow);
}

function renderEmbedInModal(file, container) {
  const wrapper = document.createElement("div");
  wrapper.className = "questionMediaWrapper";

  let element;
  const url = file.url;

  if (url.match(/\.(mp4|webm|ogg)$/i)) {
    element = document.createElement("video");
    element.controls = true;
    element.src = url;
  } else if (url.match(/\.(mp3|wav|ogg)$/i)) {
    element = document.createElement("audio");
    element.controls = true;
    element.src = url;
  } else if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    element = document.createElement("img");
    element.src = url;
  } else if (url.includes("youtube.com") || url.includes("youtu.be")) {
    element = document.createElement("iframe");
    element.src = convertYouTubeUrl(url);
    element.allowFullscreen = true;
  }

  if (!element) return;

  wrapper.appendChild(element);

  const labelEl = document.createElement("span");
  labelEl.className = "questionMediaLabel";
  labelEl.textContent = file.label || "";
  wrapper.appendChild(labelEl);

  container.appendChild(wrapper);
}

function addTeam() {
  let teamDiv = document.createElement("div");
  teamDiv.className = "team";

  let removeBtn = document.createElement("button");
  removeBtn.className = "removeTeamBtn";
  removeBtn.innerHTML = "<span>✕</span>";
  removeBtn.setAttribute("data-tooltip", "Remove team");
  removeBtn.onclick = () => {
    teamDiv.remove();
    teams = teams.filter((t) => t.div !== teamDiv);
  };

  let name = document.createElement("h4");
  name.contentEditable = true;
  name.textContent = "";
  name.className = "teamName";
  setTimeout(() => name.focus(), 0);

  let scoreDiv = document.createElement("div");
  scoreDiv.className = "teamScore";

  const team = { div: teamDiv, name, scoreDiv, score: 0 };

  scoreDiv.textContent = team.score;
  scoreDiv.contentEditable = true;
  scoreDiv.addEventListener("blur", () => {
    let raw = scoreDiv.textContent.trim();
    let isNegative = raw.startsWith("-");
    let numericPart = raw.replace(/\D/g, "");
    let value = parseInt(numericPart) || 0;
    if (isNegative) value = -value;
    team.score = value;
    scoreDiv.textContent = team.score;
    updateScoreboard();
  });

  let controls = document.createElement("div");
  controls.className = "teamControls";

  let addBtn = document.createElement("button");
  addBtn.innerHTML = "<span>+</span>";
  addBtn.className = "teamAddBtn";
  addBtn.setAttribute("data-tooltip", "Add points");
  addBtn.onclick = () => {
    team.score += getLastQuestionValue();
    updateScoreboard();
  };

  let subBtn = document.createElement("button");
  subBtn.innerHTML = "<span>−</span>";
  subBtn.className = "teamSubBtn";
  subBtn.setAttribute("data-tooltip", "Remove points");
  subBtn.onclick = () => {
    team.score -= getLastQuestionValue();
    updateScoreboard();
  };

  const hintBtn = document.createElement("button");
  hintBtn.innerHTML = "<span>?</span>";
  hintBtn.className = "teamHintBtn";
  hintBtn.setAttribute("data-tooltip", "Remove hint cost");
  hintBtn.onclick = () => {
    if (!currentQuestion) return;

    const { c, r } = currentQuestion;
    const q = currentBoard.categories[c].questions[r];
    const cost = q.hintCost || 0;

    team.score -= cost;
    updateScoreboard();
  };

  controls.appendChild(addBtn);
  controls.appendChild(subBtn);
  controls.appendChild(hintBtn);

  teamDiv.appendChild(removeBtn);
  teamDiv.appendChild(name);
  teamDiv.appendChild(scoreDiv);
  teamDiv.appendChild(controls);

  scoreboard.appendChild(teamDiv);

  teams.push(team);
}

function updateScoreboard() {
  teams.forEach((team) => {
    team.scoreDiv.textContent = team.score;
  });
}

function getLastQuestionValue() {
  if (!currentQuestion) return 0;

  const { c, r } = currentQuestion;
  const q = currentBoard.categories[c].questions[r];

  return q.value || 0;
}

// ------------- IMPORT AND EXPORT -------------
async function exportBoard() {
  let name = boardSelect.value;
  let boardData = boards[name];

  const mediaBundle = [];

  for (let cat of boardData.categories) {
    for (let q of cat.questions) {
      if (q.media) {
        for (let m of q.media) {
          const blob = await getMediaBlob(m.mediaId);
          if (!blob) continue;

          const base64 = await fileToBase64(blob);

          mediaBundle.push({
            id: m.mediaId,
            type: blob.type,
            data: base64,
          });
        }
      }
    }
  }

  const exportData = {
    board: boardData,
    media: mediaBundle,
  };

  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(exportData));

  const a = document.createElement("a");
  a.href = dataStr;
  a.download = name + ".json";
  a.click();
}

document.getElementById("importBoardBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});

async function importBoard(event) {
  let file = event.target.files[0];
  let reader = new FileReader();

  reader.onload = async function (e) {
    let data = JSON.parse(e.target.result);

    let name = prompt("Name for imported board?");

    boards[name] = data.board;

    if (data.media && Array.isArray(data.media)) {
      for (let m of data.media) {
        const blob = await fetch(m.data).then((r) => r.blob());
        await saveMediaBlob(m.id, blob);
      }
    }

    saveLocal();
    refreshDropdown();
  };

  reader.readAsText(file);
}
