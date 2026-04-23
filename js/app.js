import { login, logout, getUser } from "./auth.js";
import { initKey, decrypt } from "./crypto.js";
import { loadVault, saveVault, deleteVault, initVault } from "./vault.js";
import { auth } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
let data = [];
let filter = "all";
let editingId = null;
let lockTimer;

/* ================= AUTH ================= */

onAuthStateChanged(auth, async (u) => {
  if (u) {
    user = u;
    btnLogin.style.display = "none";

    await initVault(user.uid);

   if (sessionStorage.getItem("unlocked")) {
  // 🔥 yêu cầu nhập lại master password
  showLoginUnlockOnly();
}
  }
});

btnLogin.onclick = async () => {
  await login();
};

btnLogout.onclick = async () => {
  sessionStorage.removeItem("unlocked");
  await logout();
};

/* ================= UNLOCK ================= */

btnUnlock.onclick = async () => {
  if (!user) return alert("Login trước");
  if (!master.value) return alert("Nhập master password");

  await initKey(master.value);

  const ok = await verifyPassword();

  if (!ok) {
    alert("❌ Sai master password");
    return;
  }

  sessionStorage.setItem("unlocked", "1");

  showApp();
  await loadData();
startAutoLock();
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
  data = await loadVault(user.uid);
  render();
}

/* ================= SAVE ================= */

btnSave.onclick = async () => {
if (!sessionStorage.getItem("unlocked")) {
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

  const q = search.value.toLowerCase();

  data
    .filter(
      (i) =>
        (filter === "all" || i.type === filter) &&
        i.title.toLowerCase().includes(q)
    )
    .forEach((i) => {
      const div = document.createElement("div");
      div.className = "item";

      let show = false;

      div.innerHTML = `
        <b>${i.title}</b><br>
        ${i.username}<br>
        <span>******</span>
      `;

      const passEl = div.querySelector("span");

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

      const btnShow = document.createElement("button");
      btnShow.className = "btn";
      btnShow.textContent = "👁️";
      btnShow.onclick = () => {
        show = !show;
        passEl.textContent = show ? i.password : "******";
      };

const btnCopy = document.createElement("button");
btnCopy.className = "btn";
btnCopy.textContent = "📋";
btnCopy.onclick = async () => {
  await navigator.clipboard.writeText(i.password);
  showToast("Đã copy!");

  setTimeout(() => {
    navigator.clipboard.writeText("");
  }, 5000);
};
      const btnDelete = document.createElement("button");
      btnDelete.className = "btn";
      btnDelete.textContent = "🗑️";
      btnDelete.onclick = () => removeItem(i.id);

      div.appendChild(btnEdit);   // 👈 thêm
div.appendChild(btnShow);
div.appendChild(btnCopy);   // 👈 thêm
div.appendChild(btnDelete);
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
    sessionStorage.removeItem("unlocked");
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

  btnLogin.style.display = "none";
}


if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js")
    .then(() => console.log("SW registered 😏"))
    .catch(err => console.log("SW error", err));
}