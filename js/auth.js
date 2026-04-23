import { auth } from "./firebase.js";

import {
  GoogleAuthProvider,
  signInWithRedirect,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let user = null;

export async function login() {
  const provider = new GoogleAuthProvider();

  provider.setCustomParameters({
    prompt: "select_account"
  });

  // 🔥 dùng redirect thay vì popup
  await signInWithRedirect(auth, provider);
}

export async function logout() {
  await signOut(auth);
  location.reload();
}

export function getUser() {
  return user;
}