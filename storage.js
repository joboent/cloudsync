import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs,
    doc,
    setDoc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, 
    GoogleAuthProvider, 
    signInWithPopup, 
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- KONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCORFqlBS6sIsXZ8a8U2mVvES7LG41OOV8",
  authDomain: "vovab-16a93.firebaseapp.com",
  projectId: "vovab-16a93",
  storageBucket: "vovab-16a93.firebasestorage.app",
  messagingSenderId: "297465606820",
  appId: "1:297465606820:web:22646c91397eb137d1ec31"
};

// --- INITIALISIERUNG ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// --- AUTHENTICATION FUNKTIONEN ---

// Login mit Google
export async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (error) {
        console.error("Login Fehler:", error);
        throw error;
    }
}

// Logout
export function logout() {
    return signOut(auth);
}

// User Status überwachen (Callback wird bei Login/Logout gefeuert)
export function monitorUser(callback) {
    onAuthStateChanged(auth, (user) => {
        callback(user);
    });
}

// --- DATENBANK FUNKTIONEN (Beispiele für Vokabeln) ---

// Vokabel speichern (User-spezifisch)
export async function saveVocabulary(userId, vocabWord, translation) {
    if (!userId) return;
    
    // Wir speichern unter: users -> {userId} -> vocab -> {autoId}
    // Das hält die Daten sauber getrennt pro User
    try {
        const userVocabRef = collection(db, "users", userId, "vocab");
        await addDoc(userVocabRef, {
            word: vocabWord,
            translation: translation,
            createdAt: new Date()
        });
        console.log("Vokabel gespeichert!");
    } catch (e) {
        console.error("Fehler beim Speichern: ", e);
    }
}

// Vokabeln laden (User-spezifisch)
export async function loadVocabulary(userId) {
    if (!userId) return [];

    const userVocabRef = collection(db, "users", userId, "vocab");
    const q = query(userVocabRef); // Hier könnte man später sortieren: orderBy("createdAt")
    
    const querySnapshot = await getDocs(q);
    const vocabList = [];
    querySnapshot.forEach((doc) => {
        vocabList.push({ id: doc.id, ...doc.data() });
    });
    return vocabList;
}
