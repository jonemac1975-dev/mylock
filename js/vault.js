import { db } from "./firebase.js";
import { collection, addDoc, getDocs,setDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

export async function saveVault(uid, item, id = null) {
  const { db } = await import("./firebase.js");

  const colRef = collection(db, "users", uid, "vault");

  // 🔥 CASE VERIFY
  if (item.type === "verify") {
    if (id) {
      await setDoc(doc(db, "users", uid, "vault", id), {
        type: "verify",
        data: item.data
      });
    } else {
      await addDoc(colRef, {
        type: "verify",
        data: item.data
      });
    }
    return;
  }

  // 🔐 encrypt
  const encrypted = await encrypt(JSON.stringify(item));

  const payload = {
    type: item.type,
    data: encrypted
  };

  // 🔥 KEY FIX Ở ĐÂY
  if (id) {
    // 👉 UPDATE (KHÔNG tạo mới)
    await setDoc(doc(db, "users", uid, "vault", id), payload);
  } else {
    // 👉 CREATE
    await addDoc(colRef, payload);
  }
}

export async function deleteVault(uid,id){
 await deleteDoc(doc(db,"users",uid,"vault",id));
}

// thêm vào file
export async function initVault(uid) {
  // ❌ KHÔNG làm gì ở đây nữa
//  return;
}