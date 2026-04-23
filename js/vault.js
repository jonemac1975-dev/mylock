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

export async function saveVault(uid,item){
 const enc=await encrypt(JSON.stringify(item));
 await addDoc(collection(db,"users",uid,"vault"),{data:enc});
}

export async function deleteVault(uid,id){
 await deleteDoc(doc(db,"users",uid,"vault",id));
}

// thêm vào file
export async function initVault(uid) {
  const snap = await getDocs(collection(db, "users", uid, "vault"));

  if (snap.empty) {
    const verify = await encrypt("vault_ok");
    await addDoc(collection(db, "users", uid, "vault"), {
      type: "verify",
      data: verify
    });
  }
}