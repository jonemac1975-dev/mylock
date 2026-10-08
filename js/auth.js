import { auth } from "./firebase.js";
import {GoogleAuthProvider,signInWithPopup,signInWithRedirect} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export async function login() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});

  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    await signInWithRedirect(auth,provider);
    return null;
  }

  const result = await signInWithPopup(auth,provider);
  return result.user;
}

export async function logout() {
  await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js").then(({signOut}) => signOut(auth));
  location.reload();
}