import { login, logout } from "./auth.js";
import { loadVault, saveVault, deleteVault, initVault } from "./vault.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged, getRedirectResult, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initKey, decrypt, encrypt } from "./crypto.js";

const loginBox = document.getElementById("login");
const appBox = document.getElementById("app");
const list = document.getElementById("list");
const btnLogin = document.getElementById("btnLogin");
const btnUnlock = document.getElementById("btnUnlock");
const btnLogout = document.getElementById("btnLogout");
const btnSave = document.getElementById("btnSave");
const btnCancel = document.getElementById("btnCancel");
const btnNew = document.getElementById("btnNew");
const search = document.getElementById("search");
const modal = document.getElementById("modal");
const type = document.getElementById("type");
const title = document.getElementById("title");
const username = document.getElementById("username");
const password = document.getElementById("password");
const master = document.getElementById("master");
const subType = document.getElementById("subType");
const formDefault = document.getElementById("form-default");
const formInfo = document.getElementById("form-info");
const infoPersonal = document.getElementById("info-personal");
const infoWeb = document.getElementById("info-web");
const infoNote = document.getElementById("info-note");
const socialForm = document.getElementById("form-social");
const socialUrl = document.getElementById("social_url");
const socialUser = document.getElementById("social_user");
const socialPass = document.getElementById("social_pass");
const avatarInput = document.getElementById("avatarInput");
const noteImagesInput = document.getElementById("noteImages");
const noteVideosInput = document.getElementById("noteVideos");
const defaultImageInput = document.getElementById("defaultImage");

let user = null;
let authReady = false;
let isRedirecting = false;
let data = [];
let filter = "all";
let editingId = null;
let lockTimer = null;
let currentAvatar = "";
let noteImages = [];
let noteVideos = [];
let defaultImage = [];
let selectedMedia = new Set();

async function initAuth() {
  await setPersistence(auth, browserLocalPersistence);
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) user = result.user;
  } catch (err) {
    console.error(err);
  } finally {
    isRedirecting = false;
  }
}

initAuth();

onAuthStateChanged(auth, async (currentUser) => {
  authReady = true;

  if (!currentUser) {
    user = null;
    if (!isRedirecting) btnLogin.style.display = "block";
    return;
  }

  user = currentUser;
  btnLogin.style.display = "none";

  try {
    await initVault(user.uid);
    await waitForAuth();
    showLoginUnlockOnly();
  } catch (err) {
    console.error(err);
    showToast("❌ Không khởi tạo được Vault");
  }
});

btnLogin.onclick = async () => {
  if (user || isRedirecting) return;
  isRedirecting = true;
  try {
    await login();
  } catch (err) {
    isRedirecting = false;
    alert("Đăng nhập thất bại: " + err.message);
  }
};

btnLogout.onclick = async () => {
  localStorage.removeItem("unlocked");
  await logout();
};

btnUnlock.onclick = async () => {
  if (!user) return showToast("Chưa đăng nhập");
  if (!master.value) return showToast("Nhập master password");

  try {
    await initKey(master.value);
    const raw = await loadVaultRaw();
    const verifyItem = raw.find(item => item.type === "verify");

    if (!verifyItem) {
      const verify = await encrypt("vault_ok");
      await saveVault(user.uid,{type:"verify",data:verify});
      localStorage.setItem("unlocked","1");
      showToast("🔐 Tạo master password lần đầu");
      showApp();
      await loadData();
      startAutoLock();
      return;
    }

    try {
      const result = await decrypt(verifyItem.data);
      if (result !== "vault_ok") return showToast("❌ Sai master password");
    } catch {
      return showToast("❌ Sai master password");
    }

    localStorage.setItem("unlocked","1");
    showApp();
    await loadData();
    startAutoLock();
  } catch (err) {
    console.error(err);
    showToast("❌ Lỗi unlock");
  }
};

async function loadVaultRaw() {
  const { collection,getDocs } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
  const { db } = await import("./firebase.js");
  const snapshot = await getDocs(collection(db,"users",user.uid,"vault"));
  return snapshot.docs.map(doc => ({id:doc.id,...doc.data()}));
}

async function verifyPassword() {
  const raw = await loadVaultRaw();
  const verifyItem = raw.find(item => item.type === "verify");
  if (!verifyItem) return "NO_VERIFY";
  try {
    const result = await decrypt(verifyItem.data);
    return result === "vault_ok";
  } catch {
    return false;
  }
}

function showApp() {
  loginBox.style.display = "none";
  appBox.style.display = "flex";
}

function showLoginUnlockOnly() {
  loginBox.style.display = "flex";
  appBox.style.display = "none";
  master.value = "";
  btnLogin.style.display = "none";
}

async function waitForAuth() {
  if (auth.currentUser) return auth.currentUser;

  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth,currentUser => {
      if (currentUser) {
        unsubscribe();
        resolve(currentUser);
      }
    });
  });
}

async function loadData() {
  if (!user) return;

  try {
    const raw = await loadVault(user.uid);
    const decrypted = [];

    for (const vaultItem of raw) {
      if (vaultItem.type === "verify") continue;

      try {
        const plain = await decrypt(vaultItem.data);
        const obj = JSON.parse(plain);
        decrypted.push({id:vaultItem.id,...obj});
      } catch (err) {
        console.error("Decrypt lỗi:",vaultItem,err);
      }
    }

    data = decrypted;
    render();
    updateMenuCount();
  } catch (err) {
    console.error(err);
    showToast("❌ Lỗi tải dữ liệu");
  }
}

btnSave.onclick = async () => {
  if (!localStorage.getItem("unlocked")) {
    alert("Chưa unlock vault");
    return;
  }

  let item;

  if (type.value === "social") {
    item = {
      type:"social",
      data:{
        url:socialUrl.value,
        username:socialUser.value,
        password:socialPass.value
      }
    };
  } else if (type.value === "info") {
    item = {
      type:"info",
      subType:subType.value,
      data:collectInfoData()
    };
  } else {
    item = {
      type:type.value,
      title:title.value,
      username:username.value,
      password:password.value,
      images:defaultImage || []
    };
  }

  if (isDuplicateItem(item)) {
    if (!confirm("⚠️ Đã tồn tại, vẫn lưu?")) return;
  }

  try {
    if (editingId) {
      await saveVault(user.uid,item,editingId);
      editingId = null;
    } else {
      await saveVault(user.uid,item);
    }

    autoBackup();
    closeModal();
    await loadData();
    showToast("✅ Đã lưu");
  } catch (err) {
    console.error(err);
    alert("Lỗi lưu: " + err.message);
  }
};

function collectInfoData() {
  if (subType.value === "personal") {
    return {
      fullName:document.getElementById("fullName")?.value || "",
      birth:document.getElementById("birth")?.value || "",
      tel:document.getElementById("tel")?.value || "",
      address:document.getElementById("address")?.value || "",
      email:document.getElementById("email")?.value || "",
      note:document.getElementById("note")?.value || "",
      zalo:document.getElementById("zalo")?.value || "",
      facebook:document.getElementById("facebook")?.value || "",
      messenger:document.getElementById("messenger")?.value || "",
      avatar:currentAvatar || null,
      tags:document.getElementById("tags")?.value || "",
      company:document.getElementById("company")?.value || "",
      jobTitle:document.getElementById("jobTitle")?.value || "",
      favorite:document.getElementById("favorite")?.checked || false
    };
  }

  if (subType.value === "web") {
    return {
      site:document.getElementById("site")?.value || "",
      username:document.getElementById("webUser")?.value || "",
      password:document.getElementById("webPass")?.value || "",
      note:document.getElementById("noteWeb")?.value || ""
    };
  }

  if (subType.value === "note") {
    return {
      date:document.getElementById("date")?.value || "",
      content:document.getElementById("content")?.value || "",
      images:noteImages || [],
      videos:noteVideos || []
    };
  }

  return {};
}

function collectMediaImages(item) {
  if (!Array.isArray(item)) return [];
  return item.filter(media => media && media.public_id);
}

async function deleteCloudinaryAsset(publicId,resourceType="image") {
  if (!publicId) return;

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Chưa đăng nhập Firebase");

  const idToken = await currentUser.getIdToken();

  const response = await fetch("https://mylock-cloudinary-delete.jonemac1975.workers.dev/",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${idToken}`
    },
    body:JSON.stringify({
      public_id:publicId,
      resource_type:resourceType
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(result.error || result.result || "Cloudinary delete failed");
  }

  return result;
}

async function deleteCloudinaryImages(images) {
  for (const media of collectMediaImages(images)) {
    await deleteCloudinaryAsset(media.public_id,"image");
  }
}

async function deleteCloudinaryVideos(videos) {
  for (const media of collectMediaImages(videos)) {
    await deleteCloudinaryAsset(media.public_id,"video");
  }
}

async function deleteItem(i) {
  if (!user) throw new Error("Chưa đăng nhập");

  if (i.type === "info" && i.subType === "note") {
    await deleteCloudinaryImages(i.data?.images || []);
    await deleteCloudinaryVideos(i.data?.videos || []);
  } else if (Array.isArray(i.images)) {
    await deleteCloudinaryImages(i.images);
  }

  await deleteVault(user.uid,i.id);
  await loadData();
}

function createDeleteButton(i) {
  const btn = document.createElement("button");
  btn.className = "btn delete";
  btn.textContent = "🗑️";
  btn.dataset.tip = "Xóa";

  btn.onclick = async () => {
    const label = i.type === "info" && i.subType === "note" ? "Note" : "Card";

    if (!confirm(`Xóa ${label} và toàn bộ ảnh/video trên Cloudinary?`)) return;

    try {
      await deleteItem(i);
      showToast(`✅ Đã xóa ${label} và media Cloudinary`);
    } catch (err) {
      alert("LỖI XÓA: " + err.message);
      showToast(`❌ Xóa ${label} thất bại`);
    }
  };

  return btn;
}

function duplicateItem(item) {
  const clone = JSON.parse(JSON.stringify(item));

  editingId = null;
  resetAllForms();

  type.value = clone.type;
  toggleForm();

  if (clone.type === "info") {
    subType.value = clone.subType;
    renderSubTypeUI();

    Object.keys(clone.data || {}).forEach(key => {
      const element = document.getElementById(key);
      if (element && typeof clone.data[key] !== "object") {
        if (element.type === "checkbox") element.checked = !!clone.data[key];
        else element.value = clone.data[key] || "";
      }
    });

    if (clone.subType === "note") {
      noteImages = Array.isArray(clone.data?.images) ? [...clone.data.images] : [];
      noteVideos = Array.isArray(clone.data?.videos) ? [...clone.data.videos] : [];
      renderNotePreviews();
    }
  } else if (clone.type === "social") {
    socialUrl.value = clone.data?.url || "";
    socialUser.value = clone.data?.username || "";
    socialPass.value = clone.data?.password || "";
  } else {
    title.value = clone.title || "";
    username.value = clone.username || "";
    password.value = clone.password || "";
    defaultImage = Array.isArray(clone.images) ? [...clone.images] : [];
    renderDefaultImagePreview();
  }

  modal.style.display = "flex";
  showToast("📋 Nhân bản, sửa rồi lưu để tạo mới");
}

function render() {
  list.innerHTML = "";

  const query = (search.value || "").toLowerCase();

  data.filter(item => {
    if (item.type === "verify") return false;
    if (filter !== "all" && item.type !== filter) return false;
    return smartMatch(buildSearchText(item),query);
  }).forEach(item => {
    if (item.type === "social") {
      renderSocialItem(item);
      return;
    }

    if (item.type === "info") {
      renderInfoItem(item);
      return;
    }

    renderDefaultItem(item);
  });
}

function renderDefaultItem(item) {
  const div = document.createElement("div");
  div.className = "item";

  const icon = getIcon(item);
  const images = Array.isArray(item.images) ? item.images : [];
  const firstImage = images.find(media => media?.url);

  div.innerHTML = `
    <div class="top" style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:6px">
      <span class="icon">${icon}</span>
      <span class="title">${item.title || ""}</span>
    </div>
    <div style="opacity:0.8">${item.username || ""}</div>
    ${firstImage ? `<img src="${firstImage.url}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;margin-top:8px;display:block;cursor:zoom-in">` : ""}
    <span class="pass">******</span>
  `;

  const imageElement = div.querySelector("img");
  if (imageElement && firstImage) {
    imageElement.onclick = () => window.openDefaultImage(firstImage.url);
  }

  const passEl = div.querySelector(".pass");
  let show = false;

  const btnEdit = document.createElement("button");
  btnEdit.className = "btn edit";
  btnEdit.textContent = "✏️";
  btnEdit.dataset.tip = "Chỉnh sửa";

  btnEdit.onclick = () => {
    editingId = item.id;
    resetAllForms();
    type.value = item.type;
    toggleForm();

    title.value = item.title || "";
    username.value = item.username || "";
    password.value = item.password || "";

    defaultImage = Array.isArray(item.images) ? [...item.images] : [];
    renderDefaultImagePreview();

    modal.style.display = "flex";
  };

  const btnShow = document.createElement("button");
  btnShow.className = "btn view";
  btnShow.textContent = "👁️";
  btnShow.dataset.tip = "Xem mật khẩu";

  btnShow.onclick = () => {
    show = !show;
    passEl.textContent = show ? item.password : "******";
  };

  const btnCopy = document.createElement("button");
  btnCopy.className = "btn copy";
  btnCopy.textContent = "📋";
  btnCopy.dataset.tip = "Sao chép";
  btnCopy.onclick = () => duplicateItem(item);

  const btnDel = createDeleteButton(item);

  const action = document.createElement("div");
  action.style.marginTop = "8px";
  action.style.display = "flex";
  action.style.gap = "6px";
  action.style.flexWrap = "nowrap";
  action.append(btnEdit,btnShow,btnCopy,btnDel);

  div.appendChild(action);
  list.appendChild(div);
}

function renderInfoItem(item) {
  const div = document.createElement("div");
  div.className = "item";

  const info = item.data || {};
  let btnView = null;

  if (item.subType === "personal") {
  const avatarUrl = typeof info.avatar === "string" ? info.avatar : (info.avatar?.url || "");

  div.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <img src="${avatarUrl || "https://via.placeholder.com/40"}" style="width:40px;height:40px;border-radius:50%">
      <div style="flex:1">
        <div style="font-weight:600">${info.fullName || ""} ${info.favorite ? "⭐" : ""}</div>
        <div style="font-size:12px;opacity:0.7">${info.tel || ""}</div>
        <div style="font-size:12px;opacity:0.6">${info.company || ""} ${info.jobTitle ? "- " + info.jobTitle : ""}</div>
      </div>
    </div>
  `;

  btnView = document.createElement("button");
  btnView.className = "btn view";
  btnView.textContent = "👁️";
  btnView.dataset.tip = "Xem thông tin";
  btnView.onclick = () => showPersonalDetail(item);
}

  if (item.subType === "web") {
    div.innerHTML = `
      🌐 ${info.site || ""}
      <div>${info.username || ""}</div>
      <div class="pass">******</div>
      <div>${info.note || ""}</div>
    `;

    const passEl = div.querySelector(".pass");
    let show = false;

    const btnShow = document.createElement("button");
    btnShow.className = "btn view";
    btnShow.textContent = "👁️";
    btnShow.dataset.tip = "Xem mật khẩu";

    btnShow.onclick = () => {
      show = !show;
      passEl.textContent = show ? info.password : "******";
    };

    const btnCopyWeb = document.createElement("button");
    btnCopyWeb.className = "btn copy";
    btnCopyWeb.textContent = "📋";
    btnCopyWeb.dataset.tip = "Sao chép";
    btnCopyWeb.onclick = () => duplicateItem(item);

    const webActions = document.createElement("div");
    webActions.style.display = "flex";
    webActions.style.gap = "6px";
    webActions.style.marginTop = "6px";
    webActions.append(btnShow,btnCopyWeb);

    div.appendChild(webActions);
  }

  if (item.subType === "note") {
    div.innerHTML = `
      📝 ${info.date || ""}
      <div>${info.content || ""}</div>
    `;
  }

  const action = document.createElement("div");
  action.style.marginTop = "8px";
  action.style.display = "flex";
  action.style.gap = "6px";

  const btnCall = document.createElement("a");
  btnCall.href = info.tel ? `tel:${info.tel}` : "#";
  btnCall.className = "btn";
  btnCall.textContent = "📞";
  btnCall.dataset.tip = "Gọi điện";

  const btnZalo = document.createElement("a");
  btnZalo.href = info.zalo ? `https://zalo.me/${info.zalo}` : "#";
  btnZalo.target = "_blank";
  btnZalo.className = "btn";
  btnZalo.textContent = "💬";
  btnZalo.dataset.tip = "Zalo";

  const btnFb = document.createElement("a");
  btnFb.href = info.facebook || "#";
  btnFb.target = "_blank";
  btnFb.className = "btn";
  btnFb.textContent = "📘";
  btnFb.dataset.tip = "Facebook";

  const btnEdit = document.createElement("button");
  btnEdit.type = "button";
  btnEdit.className = "btn edit";
  btnEdit.textContent = "✏️";
  btnEdit.dataset.tip = "Chỉnh sửa";

  btnEdit.onclick = () => openInfoEdit(item);

  const btnDel = createDeleteButton(item);

  action.append(btnCall,btnZalo,btnFb);

  if (btnView) action.appendChild(btnView);

  action.append(btnEdit,btnDel);

  div.appendChild(action);
  list.appendChild(div);
}

function openInfoEdit(item) {
  clearForm();
  editingId = item.id;
  modal.style.display = "flex";
  type.value = "info";
  formDefault.style.display = "none";
  formInfo.style.display = "block";
  subType.value = item.subType;
  renderSubTypeUI();

  const info = item.data || {};

  if (item.subType === "personal") {
    setField("fullName",info.fullName);
    setField("birth",info.birth);
    setField("tel",info.tel);
    setField("address",info.address);
    setField("email",info.email);
    setField("note",info.note);
    setField("company",info.company);
    setField("jobTitle",info.jobTitle);
    setField("tags",info.tags);
    setField("zalo",info.zalo);
    setField("facebook",info.facebook);
    setField("messenger",info.messenger);

    const favorite = document.getElementById("favorite");
    if (favorite) favorite.checked = !!info.favorite;

    currentAvatar = typeof info.avatar === "string" ? {url:info.avatar,public_id:""} : (info.avatar || null);

    const avatarPreview = document.getElementById("avatarPreview");
    if (avatarPreview) avatarPreview.src = currentAvatar?.url || "https://via.placeholder.com/80";
  }

  if (item.subType === "web") {
    setField("site",info.site);
    setField("webUser",info.username);
    setField("webPass",info.password);
    setField("noteWeb",info.note);
  }

  if (item.subType === "note") {
    setField("date",info.date);
    setField("content",info.content);

    noteImages = Array.isArray(info.images) ? [...info.images] : [];
    noteVideos = Array.isArray(info.videos) ? [...info.videos] : [];

    renderNotePreviews();
  }
}

function renderNotePreviews() {
  let imagePreview = document.getElementById("noteImagesPreview");
  let videoPreview = document.getElementById("noteVideosPreview");

  if (noteImagesInput && !imagePreview) {
    imagePreview = document.createElement("div");
    imagePreview.id = "noteImagesPreview";
    noteImagesInput.after(imagePreview);
  }

  if (noteVideosInput && !videoPreview) {
    videoPreview = document.createElement("div");
    videoPreview.id = "noteVideosPreview";
    noteVideosInput.after(videoPreview);
  }

  if (imagePreview) {
    imagePreview.innerHTML = "";
    noteImages.forEach((imageItem,imageIndex) => {
      const mediaKey = `image:${imageItem.public_id || imageItem.url}`;
      const box = document.createElement("div");
      box.style.cssText = "position:relative;display:inline-block;margin:8px 8px 0 0;text-align:center";
      const img = document.createElement("img");
      img.src = imageItem.url;
      img.style.cssText = "width:80px;height:80px;object-fit:cover;border-radius:8px;display:block;cursor:zoom-in";
      img.onclick = () => window.openNoteImage(imageItem.url);

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = selectedMedia.has(mediaKey);
      check.title = "Chọn để chia sẻ";
      check.style.cssText = "position:absolute;top:6px;left:6px;width:20px;height:20px;cursor:pointer;z-index:2";
      check.onclick = event => {
        event.stopPropagation();
        if (check.checked) selectedMedia.add(mediaKey);
        else selectedMedia.delete(mediaKey);
      };

      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "❌";
      del.style.cssText = "position:absolute;top:-6px;right:-6px;border:0;background:#fff;border-radius:50%;cursor:pointer;font-size:14px;padding:2px;z-index:3";
      del.onclick = async () => {
        if (!confirm("Xóa ảnh này khỏi Cloudinary?")) return;
        try {
          if (imageItem.public_id) await deleteCloudinaryAsset(imageItem.public_id,"image");
          selectedMedia.delete(mediaKey);
          noteImages = noteImages.filter(media => media.url !== imageItem.url);
          box.remove();
          showToast("✅ Đã xóa ảnh");
        } catch (err) {
          alert("LỖI XÓA ẢNH: " + err.message);
        }
      };

      const label = document.createElement("small");
      label.textContent = `Ảnh ${imageIndex + 1}`;
      box.append(img,check,del,label);
      imagePreview.appendChild(box);
    });
  }

  if (videoPreview) {
    videoPreview.innerHTML = "";
    noteVideos.forEach((videoItem,videoIndex) => {
      const mediaKey = `video:${videoItem.public_id || videoItem.url}`;
      const box = document.createElement("div");
      box.style.cssText = "position:relative;display:inline-block;margin:8px 8px 0 0;text-align:center";
      const video = document.createElement("video");
      video.src = videoItem.url;
      video.controls = true;
      video.style.cssText = "width:220px;max-width:100%;border-radius:8px";

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = selectedMedia.has(mediaKey);
      check.title = "Chọn để chia sẻ";
      check.style.cssText = "position:absolute;top:6px;left:6px;width:20px;height:20px;cursor:pointer;z-index:2";
      check.onclick = event => {
        event.stopPropagation();
        if (check.checked) selectedMedia.add(mediaKey);
        else selectedMedia.delete(mediaKey);
      };

      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "❌";
      del.style.cssText = "position:absolute;top:-6px;right:-6px;border:0;background:#fff;border-radius:50%;cursor:pointer;font-size:14px;padding:2px;z-index:3";
      del.onclick = async () => {
        if (!confirm("Xóa video này khỏi Cloudinary?")) return;
        try {
          if (videoItem.public_id) await deleteCloudinaryAsset(videoItem.public_id,"video");
          selectedMedia.delete(mediaKey);
          noteVideos = noteVideos.filter(media => media.url !== videoItem.url);
          box.remove();
          showToast("✅ Đã xóa video");
        } catch (err) {
          alert("LỖI XÓA VIDEO: " + err.message);
        }
      };

      const label = document.createElement("small");
      label.textContent = `Video ${videoIndex + 1}`;
      box.append(video,check,del,label);
      videoPreview.appendChild(box);
    });
  }

  const shareContainer = videoPreview || imagePreview;
  if (shareContainer) {
    const oldShare = shareContainer.querySelector(".mylock-share-btn");
    if (oldShare) oldShare.remove();

    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "mylock-share-btn";
    shareBtn.textContent = "📤 Share";
shareBtn.style.cssText = "display:block;margin:14px 0 6px;padding:4px 12px;border:0;border-radius:10px;background:white;color:brown;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 3px 8px rgba(0,0,0,.18);transition:.2s";
shareBtn.onmouseenter = () => shareBtn.style.transform = "translateY(-1px)";
shareBtn.onmouseleave = () => shareBtn.style.transform = "translateY(0)";

    const mediaList = [
      ...noteImages.map(item => ({...item,resourceType:"image"})),
      ...noteVideos.map(item => ({...item,resourceType:"video"}))
    ];

    shareBtn.onclick = () => shareSelectedMedia(mediaList);
    shareContainer.appendChild(shareBtn);
  }
}

async function shareSelectedMedia(mediaItems) {
  const selected = mediaItems.filter(item => selectedMedia.has(`${item.resourceType || "image"}:${item.public_id || item.url}`));
  if (!selected.length) {
    alert("Chưa chọn ảnh hoặc clip để chia sẻ");
    return;
  }

  if (!navigator.share || !navigator.canShare) {
    alert("Thiết bị hoặc trình duyệt không hỗ trợ chia sẻ file");
    return;
  }

  try {
    showToast("📤 Đang chuẩn bị file chia sẻ...");
    const files = [];

    for (const item of selected) {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error(`Không tải được media: HTTP ${response.status}`);

      const blob = await response.blob();
      const type = item.resourceType || "image";
      const extension = type === "video" ? "mp4" : "jpg";
      const name = `${type}_${Date.now()}_${files.length + 1}.${extension}`;
      files.push(new File([blob],name,{type:blob.type || (type === "video" ? "video/mp4" : "image/jpeg")}));
    }

    if (!navigator.canShare({files})) {
      alert("Thiết bị không cho phép chia sẻ các file đã chọn");
      return;
    }

    await navigator.share({
      title:"MyLock",
      files
    });

    showToast(`✅ Đã chia sẻ ${files.length} file`);
  } catch (err) {
    if (err.name === "AbortError") return;
    alert("LỖI SHARE: " + err.message);
    showToast("❌ Chia sẻ thất bại");
  }
}

function renderDefaultImagePreview() {
  const preview = document.getElementById("defaultImagePreview");
  if (!preview) return;
  preview.innerHTML = "";
  defaultImage.forEach(imageItem => {
    const mediaKey = `image:${imageItem.public_id || imageItem.url}`;
    const box = document.createElement("div");
    box.style.cssText = "position:relative;display:inline-block;margin:8px 8px 0 0";
    const img = document.createElement("img");
    img.src = imageItem.url;
    img.style.cssText = "width:100px;height:100px;object-fit:cover;border-radius:8px;cursor:zoom-in";
    img.onclick = () => window.openDefaultImage(imageItem.url);

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = selectedMedia.has(mediaKey);
    check.title = "Chọn để chia sẻ";
    check.style.cssText = "position:absolute;top:6px;left:6px;width:20px;height:20px;cursor:pointer;z-index:2";
    check.onclick = event => {
      event.stopPropagation();
      if (check.checked) selectedMedia.add(mediaKey);
      else selectedMedia.delete(mediaKey);
    };

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "❌";
    del.style.cssText = "position:absolute;top:-6px;right:-6px;border:0;background:#fff;border-radius:50%;cursor:pointer;font-size:14px;padding:2px;z-index:3";
    del.onclick = async () => {
      if (!confirm("Xóa ảnh này khỏi Cloudinary?")) return;
      try {
        if (imageItem.public_id) await deleteCloudinaryAsset(imageItem.public_id,"image");
        selectedMedia.delete(mediaKey);
        defaultImage = defaultImage.filter(media => media.url !== imageItem.url);
        box.remove();
        showToast("✅ Đã xóa ảnh");
      } catch (err) {
        alert("LỖI XÓA ẢNH: " + err.message);
      }
    };

    box.append(img,check,del);
    preview.appendChild(box);
  });
  const oldShare = preview.querySelector(".mylock-share-btn");
  if (oldShare) oldShare.remove();

  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.className = "mylock-share-btn";
  shareBtn.textContent = "📤 Share";
shareBtn.style.cssText = "display:block;margin:14px 0 6px;padding:4px 12px;border:0;border-radius:10px;background:white;color:brown;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 3px 8px rgba(0,0,0,.18);transition:.2s";
shareBtn.onmouseenter = () => shareBtn.style.transform = "translateY(-1px)";
shareBtn.onmouseleave = () => shareBtn.style.transform = "translateY(0)";
  shareBtn.onclick = () => shareSelectedMedia(defaultImage.map(item => ({...item,resourceType:"image"})));
  preview.appendChild(shareBtn);
}

function renderSocialItem(item) {
  const div = document.createElement("div");
  div.className = "item";

  const social = item.data || {};

  div.innerHTML = `
    🌐 <a href="${social.url || "#"}" target="_blank" rel="noopener noreferrer" style="font-weight:600">${social.url || ""}</a>
    <div>${social.username || ""}</div>
    <div class="pass">******</div>
  `;

  const passEl = div.querySelector(".pass");
  let show = false;

  const btnShow = document.createElement("button");
  btnShow.className = "btn view";
  btnShow.textContent = "👁️";
  btnShow.dataset.tip = "Xem thông tin";

  btnShow.onclick = () => {
    show = !show;
    passEl.textContent = show ? social.password : "******";
  };

  const btnCopy = document.createElement("button");
  btnCopy.className = "btn copy";
  btnCopy.textContent = "📋";
  btnCopy.dataset.tip = "Sao chép";
  btnCopy.onclick = () => duplicateItem(item);

  const btnEdit = document.createElement("button");
  btnEdit.className = "btn edit";
  btnEdit.textContent = "✏️";
  btnEdit.dataset.tip = "Chỉnh sửa";

  btnEdit.onclick = () => {
    editingId = item.id;
    clearForm();
    type.value = "social";
    toggleForm();
    socialUrl.value = social.url || "";
    socialUser.value = social.username || "";
    socialPass.value = social.password || "";
    modal.style.display = "flex";
  };

  const btnDel = createDeleteButton(item);

  const action = document.createElement("div");
  action.style.marginTop = "8px";
  action.style.display = "flex";
  action.style.gap = "6px";
  action.append(btnEdit,btnShow,btnCopy,btnDel);

  div.appendChild(action);
  list.appendChild(div);
}

if (btnNew) {
  btnNew.onclick = () => {
    editingId = null;
    resetAllForms();

    type.value = "mail";
    subType.value = "personal";

    toggleForm();
    renderSubTypeUI();

    modal.style.display = "flex";

    setTimeout(() => {
      modal.querySelector("input")?.focus();
    },100);
  };
}

btnCancel.onclick = closeModal;

function closeModal() {
  modal.style.display = "none";
  document.querySelectorAll("#modal input").forEach(element => element.disabled = false);
  resetAllForms();
}

function resetAllForms() {
  title.value = "";
  username.value = "";
  password.value = "";
  socialUrl.value = "";
  socialUser.value = "";
  socialPass.value = "";

  currentAvatar = "";
  noteImages = [];
  noteVideos = [];
  defaultImage = [];

  const fields = [
    "fullName","birth","tel","address","email","note",
    "site","webUser","webPass","noteWeb",
    "date","content","tags","company","jobTitle",
    "zalo","facebook","messenger"
  ];

  fields.forEach(id => {
    const element = document.getElementById(id);
    if (element) element.value = "";
  });

  const favorite = document.getElementById("favorite");
  if (favorite) favorite.checked = false;

  const avatarPreview = document.getElementById("avatarPreview");
  if (avatarPreview) avatarPreview.src = "https://via.placeholder.com/80";

  const noteImagePreview = document.getElementById("noteImagesPreview");
  const noteVideoPreview = document.getElementById("noteVideosPreview");
  const defaultPreview = document.getElementById("defaultImagePreview");

  if (noteImagePreview) noteImagePreview.innerHTML = "";
  if (noteVideoPreview) noteVideoPreview.innerHTML = "";
  if (defaultPreview) defaultPreview.innerHTML = "";
}

type.onchange = toggleForm;
subType.onchange = renderSubTypeUI;

function toggleForm() {
  formDefault.style.display = "none";
  formInfo.style.display = "none";
  socialForm.style.display = "none";

  if (type.value === "info") {
    formInfo.style.display = "block";
  } else if (type.value === "social") {
    socialForm.style.display = "block";
  } else {
    formDefault.style.display = "block";
  }
}

function renderSubTypeUI() {
  infoPersonal.style.display = "none";
  infoWeb.style.display = "none";
  infoNote.style.display = "none";

  if (subType.value === "personal") infoPersonal.style.display = "block";
  if (subType.value === "web") infoWeb.style.display = "block";
  if (subType.value === "note") infoNote.style.display = "block";
}

if (avatarInput) {
  avatarInput.onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;

    const preview = document.getElementById("avatarPreview");
    preview.src = URL.createObjectURL(file);

    try {
      showToast("☁️ Đang tải ảnh lên Cloudinary...");

      const oldAvatar = currentAvatar;

      const media = await uploadCloudinary(file,"mylock_images","image");

      if (oldAvatar?.public_id) {
        await deleteCloudinaryAsset(oldAvatar.public_id,"image");
      }

      currentAvatar = media;
      preview.src = media.url;
      showToast("✅ Đã thay ảnh Avatar");
    } catch (err) {
      console.error(err);
      showToast("❌ Thay Avatar thất bại");
    }
  };
}

async function uploadCloudinary(file,preset,resourceType) {
  const formData = new FormData();
  formData.append("file",file);
  formData.append("upload_preset",preset);

  const response = await fetch(`https://api.cloudinary.com/v1_1/mylock/${resourceType}/upload`,{
    method:"POST",
    body:formData
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || `HTTP ${response.status}`);
  }

  return {
    url:result.secure_url,
    public_id:result.public_id
  };
}

if (noteImagesInput) {
  noteImagesInput.addEventListener("change",async () => {
    for (const file of noteImagesInput.files) {
      try {
        showToast("☁️ Đang tải ảnh lên Cloudinary...");
        const media = await uploadCloudinary(file,"mylock_images","image");
        noteImages.push(media);
        renderNotePreviews();
      } catch (err) {
        console.error(err);
        showToast("❌ Upload ảnh thất bại");
      }
    }

    showToast(`✅ Đã tải ${noteImages.length} ảnh`);
  });
}

if (noteVideosInput) {
  noteVideosInput.addEventListener("change",async () => {
    for (const file of noteVideosInput.files) {
      try {
        showToast("☁️ Đang tải video lên Cloudinary...");
        const media = await uploadCloudinary(file,"mylock_videos","video");
        noteVideos.push(media);
        renderNotePreviews();
      } catch (err) {
        console.error(err);
        showToast("❌ Upload video thất bại");
      }
    }

    showToast(`✅ Đã tải ${noteVideos.length} video`);
  });
}

if (defaultImageInput) {
  defaultImageInput.addEventListener("change",async () => {
    for (const file of defaultImageInput.files) {
      try {
        showToast("☁️ Đang tải ảnh lên Cloudinary...");
        const media = await uploadCloudinary(file,"mylock_images","image");
        defaultImage.push(media);
        renderDefaultImagePreview();
      } catch (err) {
        console.error(err);
        showToast("❌ Upload ảnh thất bại");
      }
    }

    showToast(`✅ Đã tải ${defaultImage.length} ảnh`);
  });
}

function setField(id,value) {
  const element = document.getElementById(id);
  if (!element) return;

  if (element.type === "checkbox") {
    element.checked = !!value;
  } else {
    element.value = value || "";
  }
}

function clearForm() {
  resetAllForms();
}

function getIcon(item) {
  const text = (item.title || "").toLowerCase().trim();

  const iconMap = {
    facebook:"📘",
    fb:"📘",
    gmail:"📧",
    mail:"📧",
    bank:"🏦",
    banking:"🏦",
    wifi:"📶",
    tiktok:"🎵",
    youtube:"▶️",
    default:"🔒"
  };

  for (const key in iconMap) {
    if (text.includes(key)) return iconMap[key];
  }

  return iconMap.default;
}

function smartMatch(text,query) {
  text = text.toLowerCase();
  query = query.toLowerCase();

  if (!query) return true;
  if (text.includes(query)) return true;

  let position = 0;

  for (const character of text) {
    if (character === query[position]) position++;
    if (position === query.length) return true;
  }

  return false;
}

function buildSearchText(item) {
  return [
    item.title,
    item.username,
    item.password,
    item.data?.fullName,
    item.data?.birth,
    item.data?.tel,
    item.data?.address,
    item.data?.email,
    item.data?.site,
    item.data?.note,
    item.data?.content,
    item.data?.url
  ].filter(Boolean).join(" ").toLowerCase();
}

function isDuplicateItem(newItem) {
  return data.some(existing => {
    if (existing.id === editingId) return false;

    if (newItem.type !== "info" && newItem.type !== "social") {
      return existing.type === newItem.type &&
        (existing.title || "").toLowerCase().trim() === (newItem.title || "").toLowerCase().trim() &&
        (existing.username || "").toLowerCase().trim() === (newItem.username || "").toLowerCase().trim();
    }

    if (newItem.type === "social") {
      return existing.type === "social" &&
        (existing.data?.url || "").toLowerCase().trim() === (newItem.data?.url || "").toLowerCase().trim() &&
        (existing.data?.username || "").toLowerCase().trim() === (newItem.data?.username || "").toLowerCase().trim();
    }

    if (newItem.type === "info") {
      if (newItem.subType === "web") {
        return existing.type === "info" &&
          existing.subType === "web" &&
          (existing.data?.site || "").toLowerCase().trim() === (newItem.data?.site || "").toLowerCase().trim() &&
          (existing.data?.username || "").toLowerCase().trim() === (newItem.data?.username || "").toLowerCase().trim();
      }

      if (newItem.subType === "personal") {
        return existing.type === "info" &&
          existing.subType === "personal" &&
          (existing.data?.fullName || "").toLowerCase().trim() === (newItem.data?.fullName || "").toLowerCase().trim() &&
          (existing.data?.tel || "").toLowerCase().trim() === (newItem.data?.tel || "").toLowerCase().trim();
      }
    }

    return false;
  });
}

function updateMenuCount() {
  const counts = {};

  data.forEach(item => {
    counts[item.type] = (counts[item.type] || 0) + 1;
  });

  document.querySelectorAll(".count").forEach(element => {
    const typeName = element.id.replace("count-","");
    element.textContent = `(${counts[typeName] || 0})`;
  });
}

function showPersonalDetail(item) {
  const info = item.data || {};

  const html = `
    <div class="modal-detail">
      <div style="text-align:center">
        <img src="${info.avatar || "https://via.placeholder.com/80"}" style="width:80px;height:80px;border-radius:50%">
      </div>
      <h3 style="text-align:center">${info.fullName || ""} ${info.favorite ? "⭐" : ""}</h3>
      <p>💼 ${info.company || ""} ${info.jobTitle ? "- " + info.jobTitle : ""}</p>
      <p>📞 <a href="tel:${info.tel || ""}">${info.tel || ""}</a></p>
      <p>📧 ${info.email || ""}</p>
      <p>📍 ${info.address || ""}</p>
      <p>🎂 ${info.birth || ""}</p>
      ${info.zalo ? `<p>💬 <a href="https://zalo.me/${info.zalo}" target="_blank">Zalo</a></p>` : ""}
      ${info.facebook ? `<p>📘 <a href="${info.facebook}" target="_blank">Facebook</a></p>` : ""}
      ${info.messenger ? `<p>💬 <a href="${info.messenger}" target="_blank">Messenger</a></p>` : ""}
      ${info.tags ? `<p>🏷️ ${info.tags}</p>` : ""}
      <p>📝 ${info.note || ""}</p>
      <button onclick="closeDetail()">Đóng</button>
    </div>
  `;

  const wrapper = document.createElement("div");
  wrapper.id = "detailPopup";
  wrapper.innerHTML = html;
  document.body.appendChild(wrapper);
}

window.closeDetail = () => {
  document.getElementById("detailPopup")?.remove();
};

window.openDefaultImage = url => {
  const old = document.getElementById("defaultImageViewer");
  if (old) old.remove();

  const viewer = document.createElement("div");
  viewer.id = "defaultImageViewer";
  viewer.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out";
  viewer.innerHTML = `<img src="${url}" style="max-width:95%;max-height:95%;object-fit:contain;border-radius:8px">`;
  viewer.onclick = () => viewer.remove();
  document.body.appendChild(viewer);
};

window.openNoteImage = url => {
  const old = document.getElementById("noteImageViewer");
  if (old) old.remove();

  const viewer = document.createElement("div");
  viewer.id = "noteImageViewer";
  viewer.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out";
  viewer.innerHTML = `<img src="${url}" style="max-width:95%;max-height:95%;object-fit:contain;border-radius:8px">`;
  viewer.onclick = () => viewer.remove();
  document.body.appendChild(viewer);
};

search.oninput = render;

document.querySelectorAll(".menu div").forEach(element => {
  element.onclick = () => {
    document.querySelectorAll(".menu div").forEach(menuItem => menuItem.classList.remove("active"));
    element.classList.add("active");
    filter = element.dataset.type;
    render();
  };
});

document.addEventListener("pointerdown",event => {
  const button = event.target.closest(".btn[data-tip]");
  if (!button) return;

  document.querySelectorAll(".btn.tip-show").forEach(item => item.classList.remove("tip-show"));
  button.classList.add("tip-show");

  setTimeout(() => button.classList.remove("tip-show"),1500);
});

function startAutoLock() {
  clearTimeout(lockTimer);

  lockTimer = setTimeout(() => {
    localStorage.removeItem("unlocked");
    location.reload();
  },5 * 60 * 1000);
}

document.onclick = startAutoLock;
document.onkeydown = startAutoLock;

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.style.display = "block";

  setTimeout(() => {
    toast.style.display = "none";
  },2000);
}

function autoBackup() {
  const payload = {
    time:new Date().toISOString(),
    data:data
  };

  localStorage.setItem("vault_backup_auto",JSON.stringify(payload));
}

window.exportData = async () => {
  const pass = prompt("Nhập master password để export");
  if (!pass) return;

  try {
    await initKey(pass);

    const ok = await verifyPassword();

    if (!ok || ok === "NO_VERIFY") {
      showToast("❌ Sai password - không cho export");
      return;
    }

    const payload = {
      time:new Date().toISOString(),
      data:await loadVault(user.uid)
    };

    const blob = new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "vault_secure_backup.json";
    link.click();

    showToast("✅ Export an toàn!");
  } catch (err) {
    console.error(err);
    showToast("❌ Lỗi export");
  }
};

const importInput = document.getElementById("importFile");

if (importInput) {
  importInput.onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;

    const pass = prompt("🔐 Nhập password file backup:");
    if (!pass) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (Array.isArray(json.data)) {
        for (const item of json.data) {
          await saveVault(user.uid,item);
        }
      }

      await loadData();
      showToast("✅ Import OK");
    } catch (err) {
      console.error(err);
      showToast("❌ File backup lỗi");
    }
  };
}

window.changeMasterPassword = async () => {
  const oldPass = prompt("Nhập mật khẩu cũ");
  const newPass = prompt("Nhập mật khẩu mới");

  if (!oldPass || !newPass) return;

  try {
    await initKey(oldPass);

    const raw = await loadVault(user.uid);
    const verifyItem = raw.find(item => item.type === "verify");

    if (verifyItem) {
      const result = await decrypt(verifyItem.data);
      if (result !== "vault_ok") {
        showToast("❌ Sai mật khẩu cũ");
        return;
      }
    }

    const plainData = [];

    for (const vaultItem of raw) {
      if (vaultItem.type === "verify") continue;

      const text = await decrypt(vaultItem.data);
      plainData.push({id:vaultItem.id,...JSON.parse(text)});
    }

    await initKey(newPass);

    for (const vaultItem of raw) {
      await deleteVault(user.uid,vaultItem.id);
    }

    for (const plainItem of plainData) {
      await saveVault(user.uid,plainItem);
    }

    const verify = await encrypt("vault_ok");

    await saveVault(user.uid,{
      type:"verify",
      data:verify
    });

    showToast("✅ Đổi mật khẩu thành công");
  } catch (err) {
    console.error(err);
    showToast("❌ Lỗi đổi mật khẩu");
  }
};

window.registerFaceID = async () => {
  try {
    await navigator.credentials.create({
      publicKey:{
        challenge:new Uint8Array(32),
        rp:{name:"Vault App"},
        user:{
          id:new Uint8Array(16),
          name:user.email,
          displayName:user.email
        },
        pubKeyCredParams:[
          {type:"public-key",alg:-7}
        ],
        authenticatorSelection:{
          authenticatorAttachment:"platform",
          userVerification:"required"
        },
        timeout:60000,
        attestation:"none"
      }
    });

    localStorage.setItem("faceid","1");
    showToast("✅ Đã đăng ký Face ID");
  } catch (err) {
    console.error(err);
    showToast("❌ Đăng ký thất bại");
  }
};

window.loginFaceID = async () => {
  if (!localStorage.getItem("faceid")) {
    return showToast("❌ Chưa đăng ký Face ID");
  }

  try {
    await navigator.credentials.get({
      publicKey:{
        challenge:new Uint8Array(32),
        userVerification:"required",
        timeout:60000
      }
    });

    showToast("✅ Face ID OK");
    localStorage.setItem("unlocked","1");
    showApp();
    await loadData();
    startAutoLock();
  } catch (err) {
    console.error(err);
    showToast("❌ Face ID thất bại");
  }
};

window.testCloudinaryDelete = async () => {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    alert("AUTH_NULL");
    return;
  }

  try {
    const idToken = await currentUser.getIdToken();

    const response = await fetch("https://mylock-cloudinary-delete.jonemac1975.workers.dev/",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${idToken}`
      },
      body:JSON.stringify({
        public_id:"abc123",
        resource_type:"image"
      })
    });

    const result = await response.json();

    alert(`HTTP ${response.status}\n${JSON.stringify(result)}`);
  } catch (err) {
    alert("TEST CLOUDINARY ERROR: " + err.message);
  }
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
    .then(() => console.log("SW registered 😏"))
    .catch(err => console.log("SW error",err));
}