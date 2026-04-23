import { auth } from "./firebase.js";
import { GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let user=null;

export async function login(){
 const provider=new GoogleAuthProvider();
 provider.setCustomParameters({prompt:"select_account"});
 const res=await signInWithPopup(auth,provider);
 user=res.user;
 return user;
}

export async function logout(){
 await signOut(auth);
 location.reload();
}

export function getUser(){
 return user;
}