import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const config = {
  apiKey: "AIzaSyCYbp4nOHhDbgFN68SW-RdE9M-HGWITFKU",
  authDomain: "saokhueedu.firebaseapp.com",
  projectId: "saokhueedu"
};

const app = initializeApp(config);

export const db = getFirestore(app);
export const auth = getAuth(app);