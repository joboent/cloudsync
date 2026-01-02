// [HISTORY START: STEP 91] [2026-01-02]
// CHANGE: Apple Authentication hinzugefügt
// STATUS: LIVE CANDIDATE
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    signInWithPopup, 
    GoogleAuthProvider,
    OAuthProvider, // Neu für Apple
    linkWithPopup,
    signOut,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const STORAGE_KEY = 'vtrainer_modular_v1';

// --- LIVE KONFIGURATION (vovab-16a93) ---
const firebaseConfig = {
  apiKey: "AIzaSyCORFqlBS6sIsXZ8a8U2mVvES7LG41OOV8",
  authDomain: "vovab-16a93.firebaseapp.com",
  projectId: "vovab-16a93",
  storageBucket: "vovab-16a93.firebasestorage.app",
  messagingSenderId: "297465606820",
  appId: "1:297465606820:web:22646c91397eb137d1ec31"
};

const appId = 'vovab-live';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Provider Setup
const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

// Standard State Definition
const DEFAULT_STATE = {
    customPack: [], 
    stats: {xp:0, streak:0, totalMastered:0, lastLearningDate: null, sessionsCompleted: 0}, 
    sm2: {}, 
    settings: {
        volume:1, ttsRate:1, sessionSize:15, lastLevel: null, enableAudioMatch: true, enableWrittenReview: true,
        bgHue: 0, bgBrightness: 100, creatorsMode: false,
        isCloudEnabled: false, 
        authMethod: 'local', // 'local', 'anonymous', 'google', 'apple'
        cloudShortId: null
    } 
};

// --- AUTHENTICATION LOGIC ---

export async function initAuth() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe(); 
            resolve(user);
        });
    });
}

export function getCurrentUser() {
    return auth.currentUser;
}

// 1. ANONYM
export async function loginAnonymous() {
    try {
        const result = await signInAnonymously(auth);
        return result.user;
    } catch (e) {
        console.error("Anon Auth Error:", e);
        throw e;
    }
}

// 2. GOOGLE
export async function loginGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (e) {
        console.error("Google Auth Error:", e);
        throw e;
    }
}

export async function upgradeToGoogle() {
    if (!auth.currentUser) throw new Error("Kein User eingeloggt.");
    try {
        const result = await linkWithPopup(auth.currentUser, googleProvider);
        return result.user;
    } catch (e) {
        throw e;
    }
}

// 3. APPLE (Neu)
export async function loginApple() {
    try {
        const result = await signInWithPopup(auth, appleProvider);
        return result.user;
    } catch (e) {
        console.error("Apple Auth Error:", e);
        throw e;
    }
}

export async function upgradeToApple() {
    if (!auth.currentUser) throw new Error("Kein User eingeloggt.");
    try {
        const result = await linkWithPopup(auth.currentUser, appleProvider);
        return result.user;
    } catch (e) {
        throw e;
    }
}

export async function logout() {
    await signOut(auth);
}

// --- DATA PRIVACY / DELETION ---
export async function deleteCompleteUserData(uid, shortId) {
    if (!uid) return;
    try {
        console.log(`Lösche Daten für UID: ${uid}...`);
        const stateDoc = doc(db, 'artifacts', appId, 'users', uid, 'data', 'state');
        await deleteDoc(stateDoc);
        
        if (shortId) {
            console.log(`Lösche Alias: ${shortId}...`);
            const aliasRef = doc(db, 'artifacts', appId, 'public', 'data', 'aliases', shortId);
            await deleteDoc(aliasRef);
        }
        console.log("Benutzerdaten erfolgreich gelöscht.");
    } catch (e) {
        console.error("Löschen fehlgeschlagen:", e);
        throw e; 
    }
}

// --- SYNC & CONFLICT LOGIC ---

export async function checkForCloudConflict(uid, localState) {
    if (!uid) return null;
    try {
        const cloudData = await fetchFromCloud(uid);
        if (!cloudData) return null; 

        const localTime = localState.lastSync || 0;
        const cloudTime = cloudData.lastSync || 0;

        if (cloudTime > localTime) {
            return {
                hasConflict: true,
                localTime: localTime,
                cloudTime: cloudTime,
                cloudData: cloudData
            };
        }
        return null; 
    } catch (e) {
        console.error("Conflict Check Failed:", e);
        return null;
    }
}

// --- DATABASE FUNCTIONS ---

export function getWordKey(en, de) { return (String(en||'') + "::" + String(de||'')).toLowerCase().trim(); }

function generateRandomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export async function getOrRegisterShortId(uid, currentState) {
    if (currentState.settings.cloudShortId) return currentState.settings.cloudShortId;

    let retries = 3;
    while (retries > 0) {
        const newId = generateRandomId();
        try {
            const aliasRef = doc(db, 'artifacts', appId, 'public', 'data', 'aliases', newId);
            const snap = await getDoc(aliasRef);
            if(snap.exists()) {
                throw new Error("ID collision");
            }
            await setDoc(aliasRef, { uid: uid, created: Date.now() });
            
            currentState.settings.cloudShortId = newId;
            saveState(currentState);
            return newId;
        } catch (e) {
            console.warn(`ID Gen failed (${retries} left):`, e);
            retries--;
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return null;
}

export async function resolveShortId(shortId) {
    if(!shortId) return null;
    try {
        const aliasRef = doc(db, 'artifacts', appId, 'public', 'data', 'aliases', shortId);
        const snap = await getDoc(aliasRef);
        if (snap.exists()) {
            return snap.data().uid;
        }
        return null;
    } catch (e) {
        console.error("Resolve Error", e);
        throw e;
    }
}

export async function syncToCloud(state) {
    if (!state || state.settings.isCloudEnabled !== true || !auth.currentUser) return;
    try {
        const userId = auth.currentUser.uid;
        const stateDoc = doc(db, 'artifacts', appId, 'users', userId, 'data', 'state');
        const syncState = { ...state, lastSync: Date.now() };
        await setDoc(stateDoc, syncState, { merge: false });
        
        state.lastSync = syncState.lastSync;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error("Sync to Cloud failed:", e);
        throw e;
    }
}

export async function fetchFromCloud(targetUserId = null) {
    const userId = targetUserId || auth.currentUser?.uid;
    if (!userId) return null;
    try {
        const stateDoc = doc(db, 'artifacts', appId, 'users', userId, 'data', 'state');
        const snap = await getDoc(stateDoc);
        return snap.exists() ? snap.data() : null;
    } catch (e) {
        console.error("Fetch from Cloud failed:", e);
        return null;
    }
}

export function loadState(){
    try{
        const raw = localStorage.getItem(STORAGE_KEY);
        if(!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
        const loaded = JSON.parse(raw);
        const freshState = JSON.parse(JSON.stringify(DEFAULT_STATE));
        
        if (loaded.words && Array.isArray(loaded.words) && loaded.words.length > 0) {
            if (!loaded.customPack || loaded.customPack.length === 0) {
                loaded.customPack = loaded.words;
            }
            delete loaded.words;
        }

        Object.assign(freshState, loaded);
        if(loaded.stats) Object.assign(freshState.stats, loaded.stats);
        if(loaded.settings) Object.assign(freshState.settings, loaded.settings);
        return freshState;
    }catch(e){ 
        console.error("State load error, resetting:", e);
        return JSON.parse(JSON.stringify(DEFAULT_STATE)); 
    }
}

export function saveState(currentState){ 
    if(!currentState) return;
    if(currentState.words) delete currentState.words;
    
    currentState.lastSync = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState)); 
    
    if (currentState.settings.isCloudEnabled === true) {
        syncToCloud(currentState).catch(e => console.warn("Background sync error:", e));
    }
    window.dispatchEvent(new CustomEvent('stateUpdated', { detail: currentState }));
}

export function checkStreakValidity(currentState){
    if(!currentState || !currentState.stats.lastLearningDate) return;
    const today = new Date().toDateString();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    
    if (currentState.stats.lastLearningDate !== today && currentState.stats.lastLearningDate !== yesterday.toDateString()) {
        currentState.stats.streak = 0;
        saveState(currentState); 
    }
}

// Global Exports
window.VTrainerCloud = {
    initAuth,
    loginAnonymous,
    loginGoogle,
    upgradeToGoogle,
    loginApple,     // Neu
    upgradeToApple, // Neu
    logout,
    fetch: fetchFromCloud,
    sync: syncToCloud,
    getUID: () => auth.currentUser?.uid,
    getUser: getCurrentUser,
    getOrRegisterShortId,
    resolveShortId,
    checkForCloudConflict,
    deleteCompleteUserData
};

window.VTrainer = { loadState, saveState, checkStreakValidity, getWordKey };
