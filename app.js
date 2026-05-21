import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "",
  authDomain: "sharedspace-50c52.firebaseapp.com",
  projectId: "sharedspace-50c52",
  storageBucket: "sharedspace-50c52.firebasestorage.app",
  messagingSenderId: "1034280394799",
  appId: "1:1034280394799:web:8a81acfa4bdd3c5d7e26da"
};

const ADMIN_EMAIL = "genadiy.zoger@gmail.com";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

const signedOutView = document.querySelector('[data-view="signed-out"]');
const signedInView = document.querySelector('[data-view="signed-in"]');
const googleSignInButton = document.querySelector("#googleSignInButton");
const signOutButton = document.querySelector("#signOutButton");
const newVideoButton = document.querySelector("#newVideoButton");
const closeDialogButton = document.querySelector("#closeDialogButton");
const cancelVideoButton = document.querySelector("#cancelVideoButton");
const videoDialog = document.querySelector("#videoDialog");
const videoForm = document.querySelector("#videoForm");
const saveVideoButton = document.querySelector("#saveVideoButton");
const titleInput = document.querySelector("#titleInput");
const urlInput = document.querySelector("#urlInput");
const platformInput = document.querySelector("#platformInput");
const thumbnailUrlInput = document.querySelector("#thumbnailUrlInput");
const suggestTitleButton = document.querySelector("#suggestTitleButton");
const videoList = document.querySelector("#videoList");
const detailPanel = document.querySelector("#detailPanel");
const searchInput = document.querySelector("#searchInput");
const filterButtons = document.querySelectorAll("[data-filter]");
const adminScopeTabs = document.querySelector("#adminScopeTabs");
const scopeButtons = document.querySelectorAll("[data-scope]");
const toast = document.querySelector("#toast");

const userName = document.querySelector("#userName");
const userEmail = document.querySelector("#userEmail");
const userUid = document.querySelector("#userUid");
const totalCount = document.querySelector("#totalCount");
const unusedCount = document.querySelector("#unusedCount");
const usedCount = document.querySelector("#usedCount");
const transcriptCount = document.querySelector("#transcriptCount");

let currentUser = null;
let videos = [];
let selectedVideoId = null;
let unsubscribeVideos = null;
let activeFilter = "all";
let libraryScope = "mine";
let toastTimer = null;
let saveTimer = null;
let formMetadataTimer = null;
const metadataCheckedIds = new Set();

googleSignInButton.addEventListener("click", async () => {
  googleSignInButton.disabled = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    showError(error);
  } finally {
    googleSignInButton.disabled = false;
  }
});

signOutButton.addEventListener("click", () => signOut(auth));
newVideoButton.addEventListener("click", () => {
  videoForm.reset();
  videoDialog.showModal();
  document.querySelector("#titleInput").focus();
});
closeDialogButton.addEventListener("click", () => videoDialog.close());
cancelVideoButton.addEventListener("click", () => videoDialog.close());
searchInput.addEventListener("input", renderVideos);
suggestTitleButton.addEventListener("click", async () => {
  suggestTitleButton.disabled = true;
  suggestTitleButton.textContent = "Thinking...";
  try {
    const title = await suggestTitleFromData(readFormTitleData());
    titleInput.value = title;
    showToast("Title suggested");
  } catch (error) {
    showError(error);
  } finally {
    suggestTitleButton.disabled = false;
    suggestTitleButton.textContent = "Suggest title";
  }
});
urlInput.addEventListener("input", () => {
  platformInput.value = detectPlatform(urlInput.value);
  window.clearTimeout(formMetadataTimer);
  formMetadataTimer = window.setTimeout(() => applyUrlMetadataToForm(urlInput.value), 550);
});
urlInput.addEventListener("blur", () => applyUrlMetadataToForm(urlInput.value));

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderVideos();
  });
});

scopeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!isAdminUser(currentUser)) return;
    libraryScope = button.dataset.scope;
    scopeButtons.forEach((item) => item.classList.toggle("active", item === button));
    selectedVideoId = null;
    subscribeToVideos();
  });
});

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (unsubscribeVideos) {
    unsubscribeVideos();
    unsubscribeVideos = null;
  }

  if (!user) {
    videos = [];
    selectedVideoId = null;
    libraryScope = "mine";
    adminScopeTabs.classList.add("hidden");
    signedOutView.classList.remove("hidden");
    signedInView.classList.add("hidden");
    renderVideos();
    renderEmptyDetail();
    return;
  }

  userName.textContent = user.displayName || "Signed in";
  userEmail.textContent = user.email || "";
  userUid.textContent = isAdminUser(user) ? `UID: ${user.uid}` : "";
  adminScopeTabs.classList.toggle("hidden", !isAdminUser(user));
  if (!isAdminUser(user)) {
    libraryScope = "mine";
  }
  scopeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.scope === libraryScope);
  });
  signedOutView.classList.add("hidden");
  signedInView.classList.remove("hidden");
  subscribeToVideos();
});

videoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;

  saveVideoButton.disabled = true;
  saveVideoButton.textContent = "Saving...";

  try {
    const formData = new FormData(videoForm);
    const file = formData.get("file");
    const thumbnailFile = formData.get("thumbnailFile");
    const sourceUrl = clean(formData.get("url"));
    const manualThumbnailUrl = clean(formData.get("thumbnailUrl"));
    const fileData = file && file.size ? await uploadLibraryFile(file, { generateThumbnail: !manualThumbnailUrl && !(thumbnailFile && thumbnailFile.size) }) : {};
    const uploadedThumbnail = thumbnailFile && thumbnailFile.size ? await uploadThumbnailFile(thumbnailFile) : {};
    const derivedThumbnailUrl = manualThumbnailUrl || uploadedThumbnail.thumbnailUrl || fileData.thumbnailUrl || getYouTubeThumbnail(sourceUrl);
    const title = clean(formData.get("title")) || await suggestTitleFromData({
      title: "",
      sourceUrl,
      platform: clean(formData.get("platform")) || detectPlatform(sourceUrl),
      thumbnailUrl: derivedThumbnailUrl,
      transcript: clean(formData.get("transcript")),
      notes: clean(formData.get("notes")),
      fileName: file?.name || ""
    }).catch(() => fallbackTitle(sourceUrl, file?.name));

    await addDoc(userVideosCollection(), {
      ...fileData,
      title,
      sourceUrl,
      platform: clean(formData.get("platform")),
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || "",
      ownerName: currentUser.displayName || "",
      tags: splitTags(formData.get("tags")),
      thumbnailUrl: derivedThumbnailUrl,
      thumbnailPath: uploadedThumbnail.thumbnailPath || fileData.thumbnailPath || "",
      transcript: clean(formData.get("transcript")),
      notes: clean(formData.get("notes")),
      usedForContent: Boolean(formData.get("used")),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    videoDialog.close();
    videoForm.reset();
    showToast("Video saved");
  } catch (error) {
    showError(error);
  } finally {
    saveVideoButton.disabled = false;
    saveVideoButton.textContent = "Save video";
  }
});

function subscribeToVideos() {
  if (!currentUser) return;
  if (unsubscribeVideos) {
    unsubscribeVideos();
    unsubscribeVideos = null;
  }

  const allUsersView = isAdminUser(currentUser) && libraryScope === "all";
  const videosQuery = allUsersView
    ? query(collectionGroup(db, "videos"), orderBy("createdAt", "desc"))
    : query(collection(db, "users", currentUser.uid, "videos"), orderBy("createdAt", "desc"));

  unsubscribeVideos = onSnapshot(
    videosQuery,
    (snapshot) => {
      videos = snapshot.docs.map((document) => {
        const ownerUid = allUsersView
          ? document.ref.parent.parent?.id || document.data().ownerUid || ""
          : currentUser.uid;
        return {
          id: document.id,
          ...document.data(),
          ownerUid
        };
      });
      if (!selectedVideoId && videos.length) {
        selectedVideoId = videos[0].id;
      }
      if (selectedVideoId && !videos.some((video) => video.id === selectedVideoId)) {
        selectedVideoId = videos[0]?.id || null;
      }
      updateStats();
      renderVideos();
      renderDetail();
      hydrateMissingMetadata();
    },
    (error) => showError(error)
  );
}

function renderVideos() {
  const visibleVideos = getVisibleVideos();

  if (!visibleVideos.length) {
    videoList.innerHTML = `<div class="empty-list">No videos match this view yet. Add a video or adjust the filter.</div>`;
    return;
  }

  videoList.innerHTML = visibleVideos.map(renderVideoCard).join("");
  videoList.querySelectorAll(".video-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedVideoId = card.dataset.id;
      renderVideos();
      renderDetail();
    });
  });
}

function renderVideoCard(video) {
  const previewText = video.transcript || video.notes || video.sourceUrl || "No transcript or notes yet.";
  const tags = (video.tags || []).slice(0, 3).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("");
  const ownerPill = shouldShowOwner(video)
    ? `<span class="pill owner-pill">${escapeHtml(getOwnerLabel(video))}</span>`
    : "";
  const thumbnailUrl = getBestThumbnail(video);
  const thumb = thumbnailUrl
    ? `<img src="${escapeAttribute(thumbnailUrl)}" alt="" loading="lazy" />`
    : renderThumbnailPlaceholder(video, "card");

  return `
    <button class="video-card ${video.id === selectedVideoId ? "active" : ""}" data-id="${video.id}" type="button">
      <span class="video-thumb">${thumb}</span>
      <span>
        <h3>${escapeHtml(video.title || "Untitled video")}</h3>
        <p>${escapeHtml(previewText)}</p>
        <span class="meta-row">
          <span class="pill ${video.usedForContent ? "used" : "unused"}">${video.usedForContent ? "Used" : "Unused"}</span>
          ${video.transcript ? '<span class="pill">Transcript</span>' : ""}
          ${ownerPill}
          ${tags}
        </span>
      </span>
    </button>
  `;
}

function renderDetail() {
  const video = videos.find((item) => item.id === selectedVideoId);
  if (!video) {
    renderEmptyDetail();
    return;
  }

  detailPanel.classList.remove("empty");
  const thumbnailUrl = getBestThumbnail(video);
  const needsManualThumbnail = isProtectedSocialSource(video.sourceUrl) && !thumbnailUrl;
  const editable = canEditVideo(video);
  const disabledAttribute = editable ? "" : "disabled";
  const readonlyNotice = editable ? "" : `
    <div class="thumbnail-note">
      You are viewing another user's saved video. This item is read-only in All users mode.
    </div>
  `;
  detailPanel.innerHTML = `
    <div class="detail-preview ${thumbnailUrl ? "" : "empty-preview"}">
      ${thumbnailUrl ? `<img src="${escapeAttribute(thumbnailUrl)}" alt="" />` : renderThumbnailPlaceholder(video, "detail")}
    </div>
    ${readonlyNotice}
    ${needsManualThumbnail ? `
      <div class="thumbnail-note">
        Instagram and Facebook do not expose video frames to this browser app. Upload a screenshot or paste an image URL below to use it as the thumbnail.
      </div>
    ` : ""}

    <div class="detail-header">
      <div class="detail-title">
        <p class="eyebrow">${escapeHtml(video.platform || "Video item")}</p>
        <input id="detailTitle" value="${escapeAttribute(video.title || "")}" aria-label="Video title" ${disabledAttribute} />
        ${shouldShowOwner(video) ? `<div class="owner-line">Saved by ${escapeHtml(getOwnerLabel(video))}</div>` : ""}
      </div>
      <div class="detail-actions">
        ${editable ? '<button class="ghost-button" id="suggestDetailTitleButton" type="button">Suggest title</button>' : ""}
        ${editable ? '<button class="danger-button" id="deleteVideoButton" type="button">Delete</button>' : ""}
      </div>
    </div>

    <div class="field-grid">
      <label>
        Source URL
        <div class="url-field">
          <input id="detailUrl" value="${escapeAttribute(video.sourceUrl || "")}" placeholder="https://..." ${disabledAttribute} />
          <a class="open-url-button ${video.sourceUrl ? "" : "disabled"}" href="${escapeAttribute(video.sourceUrl || "#")}" target="_blank" rel="noreferrer">Open</a>
        </div>
      </label>
      <div class="split-fields">
        <label>
          Platform
          <input id="detailPlatform" value="${escapeAttribute(video.platform || "")}" placeholder="YouTube, TikTok, Drive..." ${disabledAttribute} />
        </label>
        <label>
          Tags
          <input id="detailTags" value="${escapeAttribute((video.tags || []).join(", "))}" placeholder="ads, hook, testimonial" ${disabledAttribute} />
        </label>
      </div>
      <div class="split-fields">
        <label>
          Thumbnail URL
          <input id="detailThumbnailUrl" value="${escapeAttribute(video.thumbnailUrl || "")}" placeholder="Paste an image URL for Facebook or any source" ${disabledAttribute} />
        </label>
        <label>
          Upload thumbnail
          <input id="detailThumbnailFile" type="file" accept="image/*" ${disabledAttribute} />
        </label>
      </div>
      <label class="checkbox-row">
        <input id="detailUsed" type="checkbox" ${video.usedForContent ? "checked" : ""} ${disabledAttribute} />
        Already used this video for content
      </label>
      <label>
        <span class="label-with-action">
          Transcript
          <span class="transcript-actions">
            ${editable ? '<button class="small-action-button" id="importTranscriptButton" type="button">Import transcript</button>' : ""}
            <button class="small-action-button" id="externalTranscriberButton" type="button">Open transcriber</button>
          </span>
        </span>
        <textarea id="detailTranscript" rows="11" placeholder="Paste or edit the full video transcript" ${disabledAttribute}>${escapeHtml(video.transcript || "")}</textarea>
      </label>
      <label>
        Notes / content angle
        <textarea id="detailNotes" rows="5" placeholder="Ideas, hooks, clips to pull, next steps" ${disabledAttribute}>${escapeHtml(video.notes || "")}</textarea>
      </label>
      <label>
        Replace uploaded file
        <input id="detailFile" type="file" accept="video/*,audio/*,image/*,.pdf" ${disabledAttribute} />
      </label>
      <div class="file-line">
        ${video.fileUrl ? `<a href="${escapeAttribute(video.fileUrl)}" target="_blank" rel="noreferrer">Open uploaded file</a>` : "<span class=\"pill\">No file uploaded</span>"}
        <span class="pill">${video.updatedAt ? "Autosaves edits" : "New item"}</span>
      </div>
    </div>
  `;

  bindDetailEvents(video);
}

function bindDetailEvents(video) {
  const editable = canEditVideo(video);

  document.querySelector("#externalTranscriberButton").addEventListener("click", async () => {
    const sourceUrl = clean(document.querySelector("#detailUrl").value || video.sourceUrl);
    if (!sourceUrl) {
      showToast("Add a source URL first");
      return;
    }

    await copyText(sourceUrl);
    window.open("https://videotranscriber.ai/", "_blank", "noreferrer");
    showToast("Video URL copied. Paste it into Video Transcriber AI.");
  });

  if (!editable) {
    return;
  }

  const fields = {
    detailTitle: "title",
    detailPlatform: "platform",
    detailThumbnailUrl: "thumbnailUrl",
    detailTranscript: "transcript",
    detailNotes: "notes"
  };

  Object.entries(fields).forEach(([id, field]) => {
    document.querySelector(`#${id}`).addEventListener("input", (event) => {
      scheduleUpdate(video.id, { [field]: clean(event.target.value) });
    });
  });

  document.querySelector("#detailTags").addEventListener("input", (event) => {
    scheduleUpdate(video.id, { tags: splitTags(event.target.value) });
  });

  document.querySelector("#suggestDetailTitleButton").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Thinking...";
    try {
      const title = await suggestTitleFromData(readDetailTitleData(video));
      document.querySelector("#detailTitle").value = title;
      await updateVideo(video.id, { title });
      showToast("Title suggested");
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = "Suggest title";
    }
  });

  document.querySelector("#detailUrl").addEventListener("input", (event) => {
    const sourceUrl = clean(event.target.value);
    const platform = detectPlatform(sourceUrl);
    document.querySelector("#detailPlatform").value = platform;
    scheduleUpdate(video.id, { sourceUrl, platform });
    window.clearTimeout(formMetadataTimer);
    formMetadataTimer = window.setTimeout(() => applyUrlMetadataToVideo(video.id, sourceUrl), 650);
  });

  document.querySelector("#detailUrl").addEventListener("blur", (event) => {
    applyUrlMetadataToVideo(video.id, event.target.value);
  });

  document.querySelector("#detailThumbnailFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const thumbnailData = await uploadThumbnailFile(file);
      await deleteStoredPath(video.thumbnailPath);
      await updateVideo(video.id, thumbnailData);
      showToast("Thumbnail updated");
    } catch (error) {
      showError(error);
    }
  });

  document.querySelector("#detailUsed").addEventListener("change", async (event) => {
    try {
      await updateVideo(video.id, { usedForContent: event.target.checked });
      showToast(event.target.checked ? "Marked as used" : "Marked as unused");
    } catch (error) {
      event.target.checked = !event.target.checked;
      showError(error);
    }
  });

  document.querySelector("#importTranscriptButton").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Importing...";
    try {
      const transcript = await importTranscript(video.sourceUrl);
      document.querySelector("#detailTranscript").value = transcript;
      await updateVideo(video.id, { transcript });
      showToast("Transcript imported");
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = "Import transcript";
    }
  });

  document.querySelector("#detailFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const fileData = await uploadLibraryFile(file);
      await deleteStoredPath(video.filePath);
      if (fileData.thumbnailPath && fileData.thumbnailPath !== video.thumbnailPath) {
        await deleteStoredPath(video.thumbnailPath);
      }
      await updateVideo(video.id, fileData);
      showToast("File uploaded");
    } catch (error) {
      showError(error);
    }
  });

  document.querySelector("#deleteVideoButton").addEventListener("click", async () => {
    const confirmed = window.confirm("Delete this video item?");
    if (!confirmed) return;
    try {
      await deleteStoredPath(video.filePath);
      await deleteStoredPath(video.thumbnailPath);
      await deleteDoc(videoDocRef(video));
      showToast("Video deleted");
    } catch (error) {
      showError(error);
    }
  });
}

function renderEmptyDetail() {
  detailPanel.classList.add("empty");
  detailPanel.innerHTML = `
    <div class="empty-state">
      <h2>Select a video</h2>
      <p>Click any item to edit its transcript, notes, source, files, and content usage status.</p>
    </div>
  `;
}

function updateStats() {
  totalCount.textContent = videos.length;
  usedCount.textContent = videos.filter((video) => video.usedForContent).length;
  unusedCount.textContent = videos.filter((video) => !video.usedForContent).length;
  transcriptCount.textContent = videos.filter((video) => clean(video.transcript)).length;
}

function getVisibleVideos() {
  const term = searchInput.value.trim().toLowerCase();
  return videos.filter((video) => {
    const matchesStatus =
      activeFilter === "all" ||
      (activeFilter === "used" && video.usedForContent) ||
      (activeFilter === "unused" && !video.usedForContent) ||
      (activeFilter === "with-transcript" && Boolean(clean(video.transcript))) ||
      (activeFilter === "empty-transcript" && !clean(video.transcript));

    const haystack = [
      video.title,
      video.sourceUrl,
      video.platform,
      video.transcript,
      video.notes,
      ...(video.tags || [])
    ].join(" ").toLowerCase();

    return matchesStatus && (!term || haystack.includes(term));
  });
}

async function applyUrlMetadataToForm(url) {
  const sourceUrl = clean(url);
  if (!sourceUrl) return;

  const platform = detectPlatform(sourceUrl);
  if (platform) {
    platformInput.value = platform;
  }

  const metadata = await getUrlMetadata(sourceUrl);
  if (!metadata) return;

  if (!clean(titleInput.value) && metadata.title) {
    titleInput.value = metadata.title;
  }
  if (!clean(thumbnailUrlInput.value) && metadata.thumbnailUrl) {
    thumbnailUrlInput.value = metadata.thumbnailUrl;
  }
  if (!clean(platformInput.value) && metadata.platform) {
    platformInput.value = metadata.platform;
  }
  if (!clean(titleInput.value)) {
    suggestTitleFromData(readFormTitleData()).then((title) => {
      if (!clean(titleInput.value)) {
        titleInput.value = title;
      }
    }).catch(() => {});
  }
}

async function applyUrlMetadataToVideo(videoId, url) {
  const sourceUrl = clean(url);
  if (!sourceUrl) return;

  const video = videos.find((item) => item.id === videoId);
  if (!video) return;

  const metadata = await getUrlMetadata(sourceUrl);
  const platform = detectPlatform(sourceUrl) || metadata?.platform || video.platform || "";
  const updates = { platform };

  if (metadata?.title && (!clean(video.title) || video.title === "Untitled video")) {
    updates.title = metadata.title;
  }
  if (metadata?.thumbnailUrl && !clean(video.thumbnailUrl)) {
    updates.thumbnailUrl = metadata.thumbnailUrl;
  }

  await updateVideo(videoId, updates).catch(showError);
}

function hydrateMissingMetadata() {
  videos.forEach((video) => {
    const sourceUrl = clean(video.sourceUrl);
    if (!sourceUrl || metadataCheckedIds.has(video.id)) return;
    if (!canEditVideo(video)) return;

    const platform = detectPlatform(sourceUrl);
    const needsPlatform = platform && platform !== video.platform;
    const needsThumbnail = !clean(video.thumbnailUrl) && !getYouTubeThumbnail(sourceUrl);
    const needsTitle = !clean(video.title) || video.title === "Untitled video";

    if (!needsPlatform && !needsThumbnail && !needsTitle) return;

    metadataCheckedIds.add(video.id);
    applyUrlMetadataToVideo(video.id, sourceUrl);
  });
}

function readFormTitleData() {
  return {
    title: titleInput.value,
    sourceUrl: urlInput.value,
    platform: platformInput.value || detectPlatform(urlInput.value),
    thumbnailUrl: thumbnailUrlInput.value || getYouTubeThumbnail(urlInput.value),
    transcript: document.querySelector("#transcriptInput").value,
    notes: document.querySelector("#notesInput").value,
    fileName: document.querySelector("#fileInput").files?.[0]?.name || ""
  };
}

function readDetailTitleData(video) {
  return {
    title: document.querySelector("#detailTitle").value || video.title,
    sourceUrl: document.querySelector("#detailUrl").value || video.sourceUrl,
    platform: document.querySelector("#detailPlatform").value || video.platform,
    thumbnailUrl: document.querySelector("#detailThumbnailUrl").value || getBestThumbnail(video),
    transcript: document.querySelector("#detailTranscript").value || video.transcript,
    notes: document.querySelector("#detailNotes").value || video.notes,
    fileName: video.fileName || ""
  };
}

async function suggestTitleFromData(data) {
  const response = await fetch("/api/suggest-title", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Could not suggest a title.");
  }
  return clean(result.title);
}

function fallbackTitle(sourceUrl, fileName) {
  const detected = detectPlatform(sourceUrl);
  if (fileName) {
    return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").split(/\s+/).slice(0, 5).join(" ");
  }
  if (detected && detected !== "Web") {
    return `${detected} Video`;
  }
  return "Untitled video";
}

function scheduleUpdate(videoId, data) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    try {
      await updateVideo(videoId, data);
    } catch (error) {
      showError(error);
    }
  }, 450);
}

function updateVideo(videoId, data) {
  const video = videos.find((item) => item.id === videoId);
  return updateDoc(videoDocRef(video || { id: videoId }), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

async function uploadLibraryFile(file, options = {}) {
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
  const filePath = `users/${currentUser.uid}/videos/${crypto.randomUUID()}-${safeName}`;
  const fileRef = ref(storage, filePath);
  await uploadBytes(fileRef, file);
  const fileUrl = await getDownloadURL(fileRef);
  const shouldGenerateThumbnail = options.generateThumbnail !== false;
  const thumbnailData = shouldGenerateThumbnail && file.type?.startsWith("video/") ? await uploadGeneratedVideoThumbnail(file) : {};
  const imageThumbnail = file.type?.startsWith("image/") ? { thumbnailUrl: fileUrl } : {};

  return {
    fileName: file.name,
    filePath,
    fileType: file.type || "application/octet-stream",
    fileUrl,
    ...imageThumbnail,
    ...thumbnailData
  };
}

async function uploadThumbnailFile(file) {
  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
  return uploadThumbnailBlob(file, safeName, file.type || "image/jpeg");
}

async function uploadGeneratedVideoThumbnail(file) {
  try {
    const blob = await createVideoFrameBlob(file);
    return uploadThumbnailBlob(blob, `${crypto.randomUUID()}-first-frame.jpg`, "image/jpeg");
  } catch (error) {
    console.warn("Could not create video thumbnail", error);
    return {};
  }
}

async function uploadThumbnailBlob(blob, fileName, contentType) {
  const thumbnailPath = `users/${currentUser.uid}/thumbnails/${fileName}`;
  const thumbnailRef = ref(storage, thumbnailPath);
  await uploadBytes(thumbnailRef, blob, { contentType });
  const thumbnailUrl = await getDownloadURL(thumbnailRef);
  return { thumbnailPath, thumbnailUrl };
}

function createVideoFrameBlob(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    const cleanup = () => URL.revokeObjectURL(objectUrl);
    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("Could not read video file."));
    });
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.min(0.25, video.duration || 0);
    });
    video.addEventListener("seeked", () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        cleanup();
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Could not create video thumbnail."));
        }
      }, "image/jpeg", 0.82);
    }, { once: true });
  });
}

async function deleteStoredPath(path) {
  if (!path) return;
  await deleteObject(ref(storage, path)).catch(() => {});
}

function getBestThumbnail(video) {
  return video.thumbnailUrl || getYouTubeThumbnail(video.sourceUrl) || "";
}

function renderThumbnailPlaceholder(video, size) {
  const platform = detectPlatform(video.sourceUrl) || video.platform || "Video";
  const initial = escapeHtml(platform.slice(0, 1).toUpperCase());
  const text = isProtectedSocialSource(video.sourceUrl)
    ? "Thumbnail needed"
    : "No thumbnail";

  if (size === "detail") {
    return `
      <div class="thumbnail-placeholder detail-placeholder">
        <strong>${initial}</strong>
        <span>${escapeHtml(platform)}</span>
        <small>${text}</small>
      </div>
    `;
  }

  return `
    <span class="thumbnail-placeholder card-placeholder">
      <strong>${initial}</strong>
    </span>
  `;
}

function isProtectedSocialSource(url) {
  const platform = detectPlatform(url);
  return platform === "Facebook" || platform === "Instagram";
}

async function getUrlMetadata(url) {
  const sourceUrl = clean(url);
  if (!sourceUrl) return null;

  const youtubeThumbnail = getYouTubeThumbnail(sourceUrl);
  const platform = detectPlatform(sourceUrl);

  try {
    const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(sourceUrl)}`);
    if (!response.ok) {
      throw new Error("Metadata lookup failed.");
    }
    const data = await response.json();
    return {
      title: clean(data.title),
      thumbnailUrl: clean(data.thumbnail_url) || youtubeThumbnail,
      platform: platform || clean(data.provider_name)
    };
  } catch (error) {
    if (youtubeThumbnail || platform) {
      return { title: "", thumbnailUrl: youtubeThumbnail, platform };
    }
    return null;
  }
}

async function importTranscript(url) {
  const platform = detectPlatform(url);

  if (platform === "YouTube") {
    return getYouTubeTranscript(url);
  }

  if (platform === "Facebook" || platform === "Instagram" || platform === "TikTok") {
    throw new Error(`${platform} does not expose video transcripts to this browser app. Paste the transcript manually or use an uploaded transcript file later.`);
  }

  throw new Error("Automatic transcript import is not available for this platform yet.");
}

async function getYouTubeTranscript(url) {
  const videoId = getYouTubeId(url);
  if (!videoId) {
    throw new Error("Could not find a YouTube video ID in this link.");
  }

  const tracks = await getYouTubeCaptionTracks(videoId);
  const track = chooseCaptionTrack(tracks);
  if (!track) {
    throw new Error("No public captions were found for this YouTube video.");
  }

  const transcriptUrl = track.baseUrl
    ? `${track.baseUrl}&fmt=json3`
    : `https://video.google.com/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(track.languageCode)}&fmt=json3`;
  const response = await fetch(transcriptUrl);
  if (!response.ok) {
    throw new Error("Could not download the YouTube captions.");
  }

  const data = await response.json();
  const transcript = (data.events || [])
    .flatMap((event) => event.segs || [])
    .map((segment) => clean(segment.utf8).replace(/\s+/g, " "))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!transcript) {
    throw new Error("The caption track was empty.");
  }

  return transcript;
}

async function getYouTubeCaptionTracks(videoId) {
  const timedTextTracks = await getYouTubeTimedTextTracks(videoId);
  if (timedTextTracks.length) {
    return timedTextTracks;
  }

  const response = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
  if (!response.ok) {
    throw new Error("Could not read the YouTube page.");
  }

  const html = await response.text();
  const match = html.match(/"captionTracks":(\[.*?\])/);
  if (!match?.[1]) {
    return [];
  }

  return JSON.parse(match[1].replaceAll("\\u0026", "&"));
}

async function getYouTubeTimedTextTracks(videoId) {
  try {
    const response = await fetch(`https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}`);
    if (!response.ok) return [];
    const xml = await response.text();
    const documentXml = new DOMParser().parseFromString(xml, "text/xml");
    return Array.from(documentXml.querySelectorAll("track")).map((track) => ({
      languageCode: track.getAttribute("lang_code") || "",
      name: track.getAttribute("name") || "",
      baseUrl: ""
    }));
  } catch (error) {
    return [];
  }
}

function chooseCaptionTrack(tracks) {
  const normalized = Array.isArray(tracks) ? tracks : [];
  return normalized.find((track) => track.languageCode === "en")
    || normalized.find((track) => track.languageCode?.startsWith("en"))
    || normalized[0]
    || null;
}

function detectPlatform(url) {
  const value = clean(url).toLowerCase();
  if (!value) return "";
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "YouTube";
  if (value.includes("facebook.com") || value.includes("fb.watch")) return "Facebook";
  if (value.includes("instagram.com")) return "Instagram";
  if (value.includes("tiktok.com")) return "TikTok";
  if (value.includes("vimeo.com")) return "Vimeo";
  if (value.includes("drive.google.com")) return "Google Drive";
  if (value.includes("dropbox.com")) return "Dropbox";
  if (value.includes("linkedin.com")) return "LinkedIn";
  if (value.includes("x.com") || value.includes("twitter.com")) return "X";
  return "Web";
}

function getYouTubeThumbnail(url) {
  const videoId = getYouTubeId(url);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "";
}

function getYouTubeId(url) {
  const value = clean(url);
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/i,
    /youtube\.com\/shorts\/([^?&/]+)/i,
    /youtu\.be\/([^?&/]+)/i,
    /youtube\.com\/embed\/([^?&/]+)/i
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function userVideosCollection() {
  return collection(db, "users", currentUser.uid, "videos");
}

function videoDocRef(video) {
  const ownerUid = video?.ownerUid || currentUser.uid;
  return doc(db, "users", ownerUid, "videos", video.id);
}

function isAdminUser(user) {
  return clean(user?.email).toLowerCase() === ADMIN_EMAIL;
}

function shouldShowOwner(video) {
  return isAdminUser(currentUser) && libraryScope === "all" && video.ownerUid !== currentUser.uid;
}

function getOwnerLabel(video) {
  return video.ownerEmail || video.ownerName || video.ownerUid || "Unknown user";
}

function canEditVideo(video) {
  return Boolean(currentUser?.uid && (video?.ownerUid === currentUser.uid || isAdminUser(currentUser)));
}

function splitTags(value) {
  return clean(value)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function clean(value) {
  return String(value || "").trim();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function showError(error) {
  console.error(error);
  const message = error?.code === "permission-denied"
    ? "Firestore denied this save. Publish firestore.rules in Firebase, then try again."
    : error?.message || "Something went wrong.";
  showToast(message);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.warn("Clipboard copy failed", error);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
