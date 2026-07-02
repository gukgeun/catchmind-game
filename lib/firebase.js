import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyADVwZq3jfCh1zPSiO5HERstPyKs33Sqs4",
  authDomain: "catchmind-game.firebaseapp.com",
  databaseURL: "https://catchmind-game-default-rtdb.firebaseio.com",
  projectId: "catchmind-game",
  storageBucket: "catchmind-game.firebasestorage.app",
  messagingSenderId: "376951448697",
  appId: "1:376951448697:web:4c40243cfb8addd0f5a0a8",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);

let anonSignInPromise = null;

export function ensureAnonymousAuth() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!anonSignInPromise) {
    anonSignInPromise = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (user) {
            unsubscribe();
            resolve(user);
          }
        },
        (error) => {
          unsubscribe();
          reject(error);
        }
      );
      signInAnonymously(auth).catch((error) => {
        unsubscribe();
        reject(error);
      });
    });
  }
  return anonSignInPromise;
}
