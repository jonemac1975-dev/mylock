import { login, logout, getUser } from "./auth.js";

import { loadVault, saveVault, deleteVault, initVault } from "./vault.js";
import { db,auth } from "./firebase.js";
import {
  onAuthStateChanged,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { initKey, decrypt, encrypt } from "./crypto.js";




/* DOM */
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


/* STATE */
let user = null;
let authReady = false;

// 🔥 FIX mobile + PWA login
(async () => {
  await setPersistence(auth, browserLocalPersistence);

  try {
    const result = await getRedirectResult(auth);

    if (result?.user) {

  user = result.user;

  // 🔥 NGĂN LOOP
  isRedirecting = false;
}
  } catch (err) {

  } finally {
    isRedirecting = false;
  }
})();

let data = [];
let filter = "all";
let editingId = null;
let lockTimer;
let isRedirecting = false;

/* ================= AUTH ================= */
onAuthStateChanged(auth, async (u) => {
  authReady = true;

  if (u) {
    user = u;

    // ẩn nút login
    btnLogin.style.display = "none";

    // init vault (Firestore path)
    await initVault(user.uid);

    // đợi auth thật sự ổn định
    await waitForAuth();

    // 🔥 QUAN TRỌNG: luôn bắt unlock lại (KHÔNG auto unlock)
    showLoginUnlockOnly();

  } else {
    // chưa login
    user = null;

    // chỉ hiện nút login khi không redirect
    if (!isRedirecting && authReady) {
      btnLogin.style.display = "block";
    }
  }
});



btnLogin.onclick = async () => {
  if (user || isRedirecting) return;

  isRedirecting = true;
  await login();
};

btnLogout.onclick = async () => {
  localStorage.removeItem("unlocked");
  await logout();
};

/* ================= UNLOCK ================= */

btnUnlock.onclick = async () => {
  if (!user) return showToast("Chưa đăng nhập");
  if (!master.value) return showToast("Nhập master password");

  try {
    await initKey(master.value);

    const raw = await loadVaultRaw();

    let verifyItem = raw.find(i => i.type === "verify");

    // 🔥 CASE 1: CHƯA có verify → tạo mới
    if (!verifyItem) {
      

      const verify = await encrypt("vault_ok");

      await saveVault(user.uid, {
        type: "verify",
        data: verify
      });

      showToast("🔐 Tạo master password lần đầu");

      localStorage.setItem("unlocked", "1");
      showApp();
      await loadData();
      startAutoLock();
      return;
    }

    // 🔥 CASE 2: Đã có verify → check pass
    try {
      const res = await decrypt(verifyItem.data);

      if (res !== "vault_ok") {
        return showToast("❌ Sai master password");
      }

    } catch {
      return showToast("❌ Sai master password");
    }

    // ✅ PASS ĐÚNG
    localStorage.setItem("unlocked", "1");

    showApp();
    await loadData();
    startAutoLock();

  } catch (err) {
    console.error(err);
    showToast("Lỗi unlock");
  }
};

async function verifyPassword() {
  const snap = await loadVaultRaw();

  const verifyItem = snap.find(i => i.type === "verify");

  // 🔥 chưa có verify
  if (!verifyItem) return "NO_VERIFY";

  try {
    const res = await decrypt(verifyItem.data);
    return res === "vault_ok";
  } catch {
    return false;
  }
}

/* lấy raw data để check */
async function loadVaultRaw() {
  const { collection, getDocs } = await import(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
  );
  const { db } = await import("./firebase.js");

  const snap = await getDocs(collection(db, "users", user.uid, "vault"));

  return snap.docs.map((d) => d.data());
}

/* ================= UI ================= */

function showApp() {
  loginBox.style.display = "none";
  appBox.style.display = "flex";
}

/* ================= DATA ================= */

async function loadData() {
  try {
    // 🔥 load raw từ Firestore
    const raw = await loadVault(user.uid);


    const decrypted = [];

    for (let item of raw) {
      // ❌ bỏ item verify
      if (item.type === "verify") continue;

      try {
        // 🔐 decrypt
        const plain = await decrypt(item.data);

        // parse JSON
        const obj = JSON.parse(plain);

        decrypted.push({
          id: item.id,
          ...obj
        });

      } catch (err) {
        console.warn("❌ Decrypt lỗi:", item, err);
      }
    }

    // 🔥 gán lại data đã xử lý
    data = decrypted;



    // 🔥 render (không cần setTimeout nữa)
    render();

  } catch (err) {

    showToast("Lỗi tải dữ liệu");
  }
}

/* ================= SAVE ================= */

btnSave.onclick = async () => {
  if (!localStorage.getItem("unlocked")) {
    alert("Chưa unlock vault");
    return;
  }

  let item;

  // ===== SOCIAL =====
  if (type.value === "social") {
    item = {
      type: "social",
      data: {
        url: socialUrl.value,
        username: socialUser.value,
        password: socialPass.value
      }
    };
  }

  // ===== INFO =====
  else if (type.value === "info") {
    item = {
      type: "info",
      subType: subType.value,
      data: collectInfoData()
    };
  }

  // ===== DEFAULT =====
  else {
    item = {
      type: type.value,
      title: title.value,
      username: username.value,
      password: password.value
    };
  }

  // ===== UPDATE =====
  if (editingId) {
    await deleteVault(user.uid, editingId);
    editingId = null;
  }

  await saveVault(user.uid, item);

  autoBackup();
  closeModal();
  await loadData();
};


function collectInfoData() {
  if (subType.value === "personal") {
    return {
      fullName: document.getElementById("fullName").value,
      birth: document.getElementById("birth").value,
      tel: document.getElementById("tel").value,
      address: document.getElementById("address").value,
      email: document.getElementById("email").value,
      note: document.getElementById("note").value
    };
  }

  if (subType.value === "web") {
    return {
      site: document.getElementById("site").value,
      note: document.getElementById("noteWeb").value
    };
  }

  if (subType.value === "note") {
    return {
      date: document.getElementById("date").value,
      content: document.getElementById("content").value
    };
  }

  return {};
}


/* ================= DELETE ================= */

async function removeItem(id) {
  await deleteVault(user.uid, id);
  await loadData();
}

/* ================= FILTER ================= */

document.querySelectorAll(".menu div").forEach((el) => {
  el.onclick = () => {
    filter = el.dataset.type;
    render();
  };
});

/* ================= SEARCH ================= */

search.oninput = render;

/* ================= RENDER ================= */

function render() {
  list.innerHTML = "";

  const q = (search.value || "").toLowerCase();

  const iconMap = {
    facebook: "📘",
    fb: "📘",
    gmail: "📧",
    mail: "📧",
    bank: "🏦",
    banking: "🏦",
    wifi: "📶",
    tiktok: "🎵",
    youtube: "▶️",
    default: "🔒"
  };

  data
    .filter((i) => {
  const text = buildSearchText(i);

  return (
    i.type !== "verify" &&
    (filter === "all" || i.type === filter) &&
    smartMatch(text, q)
  );
})
    
    .forEach((i) => {

	if (i.type === "social") {
	  return renderSocialItem(i);
	}
	// 🔥 render riêng cho info
	if (i.type === "info") {
	  return renderInfoItem(i);
	}

      const div = document.createElement("div");
      div.className = "item";

      // ================= ICON =================
      const titleKey = (i.title || "").toLowerCase().trim();

      let icon = iconMap.default;

      for (const k in iconMap) {
        if (titleKey.includes(k)) {
          icon = iconMap[k];
          break;
        }
      }

      // ================= UI =================
      div.innerHTML = `
        <div class="top"
             style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:6px">
          <span class="icon">${icon}</span>
          <span class="title">${i.title || ""}</span>
        </div>

        <div style="opacity:0.8">${i.username || ""}</div>

        <span class="pass">******</span>
      `;

      const passEl = div.querySelector(".pass");

      // ================= STATE =================
      let show = false;

      // ================= BUTTON EDIT =================
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn";
      btnEdit.textContent = "✏️";

      btnEdit.onclick = () => {
  editingId = i.id;

  type.value = i.type;

  if (i.type === "info") {
    subType.value = i.subType;
    renderSubTypeUI();
    
    title.value =
      i.data.fullName ||
      i.data.site ||
      "";

    username.value =
      i.data.tel || "";

    password.value =
      i.data.note ||
      i.data.content ||
      "";
  } else {
    title.value = i.title;
    username.value = i.username;
    password.value = i.password;
  }

  modal.style.display = "flex";
};

      // ================= BUTTON SHOW =================
      const btnShow = document.createElement("button");
      btnShow.className = "btn";
      btnShow.textContent = "👁️";

      btnShow.onclick = () => {
        show = !show;
        passEl.textContent = show ? i.password : "******";
      };

      // ================= BUTTON COPY =================
      const btnCopy = document.createElement("button");
      btnCopy.className = "btn";
      btnCopy.textContent = "📋";

      btnCopy.onclick = async () => {
        await navigator.clipboard.writeText(i.password);

        btnCopy.textContent = "✔️";
        setTimeout(() => (btnCopy.textContent = "📋"), 1000);
      };

      // ================= BUTTON DELETE =================
      const btnDel = document.createElement("button");
      btnDel.className = "btn";
      btnDel.textContent = "🗑️";

      btnDel.onclick = async () => {
  if (confirm("Xóa item này?")) {
    await deleteVault(user.uid, i.id); // 🔥 xóa thật trên Firestore
    await loadData(); // reload lại từ server
  }
};

      // ================= ACTION ROW =================
      const action = document.createElement("div");
      action.style.marginTop = "8px";
      action.style.display = "flex";
      action.style.gap = "6px";

      action.appendChild(btnEdit);
      action.appendChild(btnShow);
      action.appendChild(btnCopy);
      action.appendChild(btnDel);

      div.appendChild(action);

      list.appendChild(div);
    });
}


function renderInfoItem(i) {
  const div = document.createElement("div");
  div.className = "item";

  // ===== CONTENT =====
  if (i.subType === "personal") {
    div.innerHTML = `
      👤 <b>${i.data.fullName || ""}</b>
      <div>${i.data.tel || ""}</div>
      <div>${i.data.note || ""}</div>
    `;
  }

  if (i.subType === "web") {
    div.innerHTML = `
      🌐 ${i.data.site || ""}
      <div>${i.data.note || ""}</div>
    `;
  }

  if (i.subType === "note") {
    div.innerHTML = `
      📝 ${i.data.date || ""}
      <div>${i.data.content || ""}</div>
    `;
  }

  // ===== ACTION =====
  const action = document.createElement("div");
  action.style.marginTop = "8px";
  action.style.display = "flex";
  action.style.gap = "6px";

  // ✏️ EDIT
  const btnEdit = document.createElement("button");
  btnEdit.className = "btn";
  btnEdit.textContent = "✏️";

  btnEdit.onclick = () => {
    editingId = i.id;

    type.value = "info";
    formDefault.style.display = "none";
    formInfo.style.display = "block";

    subType.value = i.subType;
    renderSubTypeUI();

    // fill data
    if (i.subType === "personal") {
      document.getElementById("fullName").value = i.data.fullName || "";
      document.getElementById("birth").value = i.data.birth || "";
      document.getElementById("tel").value = i.data.tel || "";
      document.getElementById("address").value = i.data.address || "";
      document.getElementById("email").value = i.data.email || "";
      document.getElementById("note").value = i.data.note || "";
    }

    if (i.subType === "web") {
      document.getElementById("site").value = i.data.site || "";
      document.getElementById("noteWeb").value = i.data.note || "";
    }

    if (i.subType === "note") {
      document.getElementById("date").value = i.data.date || "";
      document.getElementById("content").value = i.data.content || "";
    }

    modal.style.display = "flex";
  };

  // 👁️ VIEW (chỉ mở modal, disable input)
  const btnView = document.createElement("button");
  btnView.className = "btn";
  btnView.textContent = "👁️";

  btnView.onclick = () => {
    btnEdit.onclick(); // reuse edit

    // disable input
    document.querySelectorAll("#form-info input").forEach(i => i.disabled = true);
  };

  // 🗑️ DELETE
  const btnDel = document.createElement("button");
  btnDel.className = "btn";
  btnDel.textContent = "🗑️";

  btnDel.onclick = async () => {
    if (confirm("Xóa item này?")) {
      await deleteVault(user.uid, i.id);
      await loadData();
    }
  };

  action.appendChild(btnEdit);
  action.appendChild(btnView);
  action.appendChild(btnDel);

  div.appendChild(action);

  list.appendChild(div);
}

/* ================= MODAL ================= */

btnNew.onclick = () => {
  editingId = null;

  // ===== RESET TYPE =====
  type.value = "mail";
  subType.value = "personal";

  // ===== RESET FORM DEFAULT =====
  title.value = "";
  username.value = "";
  password.value = "";

  // ===== RESET SOCIAL =====
  if (socialUrl) socialUrl.value = "";
  if (socialUser) socialUser.value = "";
  if (socialPass) socialPass.value = "";

  // ===== RESET INFO =====
  const setVal = (id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  };

  setVal("fullName");
  setVal("birth");
  setVal("tel");
  setVal("address");
  setVal("email");
  setVal("note");

  setVal("site");
  setVal("noteWeb");

  setVal("date");
  setVal("content");

  // ===== ENABLE INPUT (fix case view mode trước đó) =====
  document.querySelectorAll("#modal input").forEach(i => i.disabled = false);

  // ===== RESET UI FORM =====
  toggleForm();        // 🔥 quyết định form nào hiện (default/info/social)
  renderSubTypeUI();   // 🔥 hiển thị đúng personal/web/note

  // ===== SHOW MODAL =====
  modal.style.display = "flex";

  // ===== AUTO FOCUS CHO MƯỢT =====
  setTimeout(() => {
    modal.querySelector("input")?.focus();
  }, 100);
};

btnCancel.onclick = closeModal;

function closeModal() {
  modal.style.display = "none";

  // enable lại input
  document.querySelectorAll("input").forEach(i => i.disabled = false);

  title.value = "";
  username.value = "";
  password.value = "";
}



function startAutoLock() {
  clearTimeout(lockTimer);

  lockTimer = setTimeout(() => {
    localStorage.removeItem("unlocked");
    location.reload();
  }, 5 * 60 * 1000);
}

document.onclick = startAutoLock;
document.onkeydown = startAutoLock;


function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";

  setTimeout(() => {
    t.style.display = "none";
  }, 2000);
}



type.onchange = () => {
  toggleForm();
};


subType.onchange = () => {
  infoPersonal.style.display = "none";
  infoWeb.style.display = "none";
  infoNote.style.display = "none";

  if (subType.value === "personal") {
    infoPersonal.style.display = "block";
  }

  if (subType.value === "web") {
    infoWeb.style.display = "block";
  }

  if (subType.value === "note") {
    infoNote.style.display = "block";
  }
};



window.exportData = async () => {
  const pass = prompt("Nhập master password để export");

  if (!pass) return;

  try {
    // 🔐 tạo key từ pass nhập
    await initKey(pass);

    // 🔥 verify giống unlock
    const ok = await verifyPassword();

    if (!ok) {
      showToast("❌ Sai password - không cho export");
      return;
    }

    // 🔥 EXPORT DATA (đã mã hóa sẵn)
    const payload = {
      time: new Date().toISOString(),
      data: await loadVault(user.uid) // 🔥 lấy raw encrypted
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json"
    });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vault_secure_backup.json";
    a.click();

    showToast("✅ Export an toàn!");
    
  } catch (err) {
    console.error(err);
    showToast("Lỗi export");
  }
};

const importInput = document.getElementById("importFile");

if (importInput) {
  importInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const pass = prompt("🔐 Nhập password file backup:");
    if (!pass) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const enc = new TextEncoder();
      const dec = new TextDecoder();

      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(pass),
        "PBKDF2",
        false,
        ["deriveKey"]
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: new Uint8Array(json.salt),
          iterations: 100000,
          hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(json.iv) },
        key,
        new Uint8Array(json.data)
      );

      const parsed = JSON.parse(dec.decode(decrypted));

      // save lại vào Firestore
      for (let item of parsed) {
        await saveVault(user.uid, item);
      }

      await loadData();
      showToast("✅ Import OK");
    } catch (err) {
      console.error(err);
      showToast("❌ Sai password hoặc file lỗi");
    }
  };
}

function showLoginUnlockOnly(){
  loginBox.style.display = "flex";
  appBox.style.display = "none";
  master.value = "";
  btnLogin.style.display = "none";
}


if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
    .then(() => console.log("SW registered 😏"))
    .catch(err => console.log("SW error", err));
}



function autoBackup() {
  const payload = {
    time: new Date().toISOString(),
    data: data
  };

  localStorage.setItem("vault_backup_auto", JSON.stringify(payload));
}

//====helper đợi auth sẵn sàng

async function waitForAuth() {
  if (auth.currentUser) return auth.currentUser;

  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) {
        unsub();
        resolve(u);
      }
    });
  });
}



//==== lấy icon thông minh
function getIcon(item) {
  const title = (item.title || "").toLowerCase().trim();

const iconMap = {
  facebook: "📘",
  fb: "📘",
  gmail: "📧",
  mail: "📧",
  bank: "🏦",
  wifi: "📶",
  tiktok: "🎵",
  youtube: "▶️",
  default: "🔒"
};

  for (const key in iconMap) {
    if (title.includes(key)) {
      return iconMap[key];
    }
  }

  return iconMap.default;
}


function renderSubTypeUI() {
  // reset tất cả
  infoPersonal.style.display = "none";
  infoWeb.style.display = "none";
  infoNote.style.display = "none";

  // show đúng cái cần
  if (subType.value === "personal") {
    infoPersonal.style.display = "block";
  }

  if (subType.value === "web") {
    infoWeb.style.display = "block";
  }

  if (subType.value === "note") {
    infoNote.style.display = "block";
  }
}
// gán event
subType.onchange = renderSubTypeUI;


window.changeMasterPassword = async () => {
  const oldPass = prompt("Nhập mật khẩu cũ");
  const newPass = prompt("Nhập mật khẩu mới");

  if (!oldPass || !newPass) return;

  try {
    // 🔐 init key cũ
    await initKey(oldPass);

    const raw = await loadVault(user.uid);

    // 🔥 check verify
    const verifyItem = raw.find(i => i.type === "verify");

    if (verifyItem) {
      const res = await decrypt(verifyItem.data);
      if (res !== "vault_ok") {
        return showToast("❌ Sai mật khẩu cũ");
      }
    }

    // 🔓 decrypt toàn bộ
    const plainData = [];

    for (let item of raw) {
      if (item.type === "verify") continue;

      const text = await decrypt(item.data);
      plainData.push({
        id: item.id,
        ...JSON.parse(text)
      });
    }

    // 🔐 init key mới
    await initKey(newPass);

    // 🔥 XÓA HẾT vault cũ
    for (let item of raw) {
      await deleteVault(user.uid, item.id);
    }

    // 🔥 lưu lại với key mới
    for (let item of plainData) {
      await saveVault(user.uid, item);
    }

    // 🔐 tạo verify mới
    const verify = await encrypt("vault_ok");

    await saveVault(user.uid, {
      type: "verify",
      data: verify
    });

    showToast("✅ Đổi mật khẩu thành công");

  } catch (err) {
    console.error(err);
    showToast("Lỗi đổi mật khẩu");
  }
};


//===Mạng xã hội Social netwwork ====//
function toggleForm() {
  // ẩn tất cả form
  formDefault.style.display = "none";
  formInfo.style.display = "none";
  socialForm.style.display = "none";

  // hiện đúng form
  if (type.value === "info") {
    formInfo.style.display = "block";
  } 
  else if (type.value === "social") {
    socialForm.style.display = "block";
  } 
  else {
    formDefault.style.display = "block";
  }
}

function clearForm() {
  title.value = "";
  socialUrl.value = "";
  socialUser.value = "";
  socialPass.value = "";

  editingId = null;
}

function renderSocialItem(i) {
  const div = document.createElement("div");
  div.className = "item";

  const data = i.data || {};

  div.innerHTML = `
    🌐 <b>${data.url || ""}</b>
    <div>${data.username || ""}</div>
    <div class="pass">******</div>
  `;

  const passEl = div.querySelector(".pass");

  let show = false;

  // 👁️ show
  const btnShow = document.createElement("button");
  btnShow.className = "btn";
  btnShow.textContent = "👁️";

  btnShow.onclick = () => {
    show = !show;
    passEl.textContent = show ? data.password : "******";
  };

  // 📋 copy
  const btnCopy = document.createElement("button");
  btnCopy.className = "btn";
  btnCopy.textContent = "📋";

  btnCopy.onclick = async () => {
    await navigator.clipboard.writeText(data.password);
    btnCopy.textContent = "✔️";
    setTimeout(() => (btnCopy.textContent = "📋"), 1000);
  };

  // ✏️ edit
  const btnEdit = document.createElement("button");
  btnEdit.className = "btn";
  btnEdit.textContent = "✏️";

  btnEdit.onclick = () => {
    editingId = i.id;

    type.value = "social";
    toggleForm();

    socialUrl.value = data.url || "";
    socialUser.value = data.username || "";
    socialPass.value = data.password || "";

    modal.style.display = "flex";
  };

  // 🗑️ delete
  const btnDel = document.createElement("button");
  btnDel.className = "btn";
  btnDel.textContent = "🗑️";

  btnDel.onclick = async () => {
    if (confirm("Xóa item này?")) {
      await deleteVault(user.uid, i.id);
      await loadData();
    }
  };

  const action = document.createElement("div");
  action.style.marginTop = "8px";
  action.style.display = "flex";
  action.style.gap = "6px";

  action.append(btnEdit, btnShow, btnCopy, btnDel);

  div.appendChild(action);
  list.appendChild(div);
}




window.registerFaceID = async () => {
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: new Uint8Array(32),

        rp: { name: "Vault App" },

        user: {
          id: new Uint8Array(16),
          name: user.email,
          displayName: user.email
        },

        pubKeyCredParams: [
          { type: "public-key", alg: -7 }
        ],

        authenticatorSelection: {
          authenticatorAttachment: "platform", // dùng Face ID
          userVerification: "required"
        },

        timeout: 60000,
        attestation: "none"
      }
    });

    // 👉 lưu lại (simple version)
    localStorage.setItem("faceid", "1");

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
      publicKey: {
        challenge: new Uint8Array(32),
        userVerification: "required",
        timeout: 60000
      }
    });

    showToast("✅ Face ID OK");

    localStorage.setItem("unlocked", "1");

    showApp();
    await loadData();
    startAutoLock();

  } catch (err) {
    console.error(err);
    showToast("❌ Face ID thất bại");
  }
};


function smartMatch(text, query) {
  text = text.toLowerCase();
  query = query.toLowerCase();

  // exact
  if (text.includes(query)) return true;

  // gần đúng (facebook -> face)
  let i = 0;
  for (let c of text) {
    if (c === query[i]) i++;
    if (i === query.length) return true;
  }

  return false;
}


function buildSearchText(i) {
  return [
    i.title,
    i.username,
    i.password,

    i.data?.fullName,
    i.data?.birth,
    i.data?.tel,
    i.data?.address,
    i.data?.email,

    i.data?.site,
    i.data?.note,
    i.data?.content,

    i.data?.url
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

document.querySelectorAll(".menu div").forEach((el) => {
  el.onclick = () => {
    document.querySelectorAll(".menu div").forEach(x => x.classList.remove("active"));
    el.classList.add("active");

    filter = el.dataset.type;
    render();
  };
});



