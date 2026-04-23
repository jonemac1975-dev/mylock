import { login, logout, getUser } from "./auth.js";
import { initKey, decrypt } from "./crypto.js";
import { loadVault, saveVault, deleteVault, initVault } from "./vault.js";
import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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

/* STATE */
let user = null;
let authReady = false;

// 🔥 FIX mobile + PWA login
(async () => {
  await setPersistence(auth, browserLocalPersistence);

  try {
    const result = await getRedirectResult(auth);

    if (result?.user) {
//  console.log("Login OK 😏", result.user);
  user = result.user;

  // 🔥 NGĂN LOOP
  isRedirecting = false;
}
  } catch (err) {
//    console.error("Redirect error", err);
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

    const ok = await verifyPassword();
    if (!ok) return showToast("❌ Sai master password");

    localStorage.setItem("unlocked", "1");

    showApp();

    // 🔥 CHỈ LOAD Ở ĐÂY
    await loadData();

    startAutoLock();

  } catch (err) {
    console.error(err);
    showToast("Lỗi unlock");
  }
};

async function verifyPassword() {
  const snap = await loadVaultRaw();

  for (let item of snap) {
    if (item.type === "verify") {
      try {
        const res = await decrypt(item.data);
        return res === "vault_ok";
      } catch {
        return false;
      }
    }
  }

  return true;
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
//    console.log("DATA RAW:", raw);

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

//    console.log("DATA DECRYPTED:", data);

    // 🔥 render (không cần setTimeout nữa)
    render();

  } catch (err) {
//    console.error("❌ loadData lỗi:", err);
    showToast("Lỗi tải dữ liệu");
  }
}

/* ================= SAVE ================= */

btnSave.onclick = async () => {
if (!localStorage.getItem("unlocked")) {
  alert("Chưa unlock vault");
  return;
}
  const item = {
    type: type.value,
    title: title.value,
    username: username.value,
    password: password.value
  };
if (editingId) {
  await deleteVault(user.uid, editingId);
  editingId = null;
}
  await saveVault(user.uid, item);
  autoBackup();
  closeModal();
  await loadData();
};

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
    .filter((i) =>
      i.type !== "verify" &&
      (filter === "all" || i.type === filter) &&
      (i.title || "").toLowerCase().includes(q)
    )
    .forEach((i) => {
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
        title.value = i.title;
        username.value = i.username;
        password.value = i.password;

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


/* ================= MODAL ================= */

btnNew.onclick = () => (modal.style.display = "flex");

btnCancel.onclick = closeModal;

function closeModal() {
  modal.style.display = "none";
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

window.exportData = () => {
  const payload = {
    time: new Date().toISOString(),
    data: data
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "vault_backup.json";
  a.click();

  showToast("Đã export!");
};

const importInput = document.getElementById("importFile");

if (importInput) {
  importInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const json = JSON.parse(text);

    const arr = json.data || json;

    for (let item of arr) {
      await saveVault(user.uid, item);
    }

    await loadData();
    showToast("Import xong!");
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

  for (const key in iconMap) {
    if (title.includes(key)) {
      return iconMap[key];
    }
  }

  return iconMap.default;
}