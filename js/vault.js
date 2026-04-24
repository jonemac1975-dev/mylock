import { db } from "./firebase.js";
import { collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { encrypt, decrypt } from "./crypto.js";

export async function loadVault(uid) {
  const { db } = await import("./firebase.js");

  const ref = collection(db, "users", uid, "vault");

  // 🔥 BẮT BUỘC lấy từ server
  const snap = await getDocs(ref);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data()
  }));
}

export async function saveVault(uid, item) {
  const { collection, addDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
  );
  const { db } = await import("./firebase.js");

  // 🔥 CASE VERIFY (KHÔNG stringify nữa)
  if (item.type === "verify") {
    await addDoc(collection(db, "users", uid, "vault"), {
      type: "verify",
      data: item.data
    });
    return;
  }

  // 🔥 CASE NORMAL
  const encrypted = await encrypt(JSON.stringify(item));

  await addDoc(collection(db, "users", uid, "vault"), {
    type: item.type,
    data: encrypted
  });
}

export async function deleteVault(uid,id){
 await deleteDoc(doc(db,"users",uid,"vault",id));
}

// thêm vào file
export async function initVault(uid) {
  // ❌ KHÔNG làm gì ở đây nữa
//  return;
}