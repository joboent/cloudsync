// ... existing code ...
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const STORAGE_KEY = 'vtrainer_modular_v1';

// Sicherer Check für lokale Tests ohne Umgebungsvariablen
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "local-dev-key",
    authDomain: "local-dev.firebaseapp.com",
    projectId: "local-dev"
};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-vtrainer';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const DEFAULT_STATE = {
    customPack: [], 
    stats: {xp:0, streak:0, totalMastered:0, lastLearningDate: null, sessionsCompleted: 0}, 
    sm2: {}, 
    settings: {
        volume:1, ttsRate:1, sessionSize:15, lastLevel: null, enableAudioMatch: true, enableWrittenReview: true,
        bgHue: 0, bgBrightness: 100, creatorsMode: false,
        isCloudEnabled: null,
        cloudShortId: null // NEW: Stores the 6-char user ID
    } 
};

export function getWordKey(en, de) { return (String(en||'') + "::" + String(de||'')).toLowerCase().trim(); }

export async function initCloudAuth() {
// ... existing code ...
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (e) {
        console.error("Cloud Auth Error:", e);
    }
}

// ==========================================
// [HISTORY START: STEP 73] [2026-01-02 10:15]
// CHANGE: Implementation des Short-ID Alias Systems
// STATUS: ACTIVE
// ==========================================
function generateRandomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Ohne I, 1, O, 0 (Lesbarkeit)
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// ==========================================
// [HISTORY START: STEP 74] [2026-01-02 11:10]
// CHANGE: Hinzufügen einer Retry-Loop (3 Versuche) für ID-Generierung um Kollisionen/Fehler abzufangen.
// STATUS: ACTIVE
// ==========================================
export async function getOrRegisterShortId(uid, currentState) {
    // 1. Check if we already have one locally
    if (currentState.settings.cloudShortId) return currentState.settings.cloudShortId;

    let retries = 3;
    
    while (retries > 0) {
        const newId = generateRandomId();
        
        try {
            // ==========================================
            // [HISTORY START: STEP 78] [2026-01-02 11:50]
            // CHANGE: Korrektur des Firestore-Pfads für 'aliases' (Hinzufügen von 'data'-Segment gemäß Regel 1)
            // STATUS: ACTIVE
            // ==========================================
            const aliasRef = doc(db, 'artifacts', appId, 'public', 'data', 'aliases', newId);
            // ==========================================
            // [HISTORY END: STEP 78]
            // [OLD-CODE (COMMENTED OUT) START]
            // const aliasRef = doc(db, 'artifacts', appId, 'public', 'aliases', newId);
            // [OLD-CODE END]
            // ==========================================
            
            // Versuche zu speichern. Schlägt fehl, wenn ID existiert (Dank Security Rules: !exists)
            await setDoc(aliasRef, { uid: uid, created: Date.now() });
            
            // Erfolg!
            currentState.settings.cloudShortId = newId;
            saveState(currentState);
            return newId;
            
        } catch (e) {
            console.warn(`ID Generation attempt failed (${retries} left). Reason:`, e);
            retries--;
            if (retries <= 0) {
                console.error("Failed to register alias after 3 attempts.");
                // ==========================================
                // [HISTORY START: STEP 84] [2026-01-02 13:20]
                // CHANGE: Explizites Werfen eines Fehlers bei Fehlschlag, da ID kritisch ist.
                // STATUS: ACTIVE
                // ==========================================
                throw new Error("CRITICAL_ID_FAILURE: Could not generate unique ID.");
                // ==========================================
                // [HISTORY END: STEP 84]
                // [OLD-CODE (COMMENTED OUT) START]
                // return null;
                // [OLD-CODE END]
                // ==========================================
            }
            // Kurze Pause vor dem nächsten Versuch (Backoff)
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return null;
}
// ==========================================
// [HISTORY END: STEP 74]
// ==========================================

// ==========================================
// [HISTORY START: STEP 84] [2026-01-02 13:20]
// CHANGE: Härtung der resolveShortId Funktion mit strikter Input-Validierung.
// STATUS: ACTIVE
// ==========================================
export async function resolveShortId(shortId) {
    // Strikte Input Guard Clause
    if(!shortId || typeof shortId !== 'string' || shortId.trim().length < 3) {
        console.warn("Resolve aborted: Invalid ID format");
        return null;
    }

    try {
        const cleanId = shortId.trim().toUpperCase();
        // Nutzung des korrekten Pfads (Step 78 Logik beibehalten)
        const aliasRef = doc(db, 'artifacts', appId, 'public', 'data', 'aliases', cleanId);
        
        const snap = await getDoc(aliasRef);
        if (snap.exists()) {
            return snap.data().uid;
        }
        return null;
    } catch (e) {
        console.error("Resolve Error (DB Access):", e);
        return null;
    }
}
// ==========================================
// [HISTORY END: STEP 84]
// [OLD-CODE (COMMENTED OUT) START]
/*
export async function resolveShortId(shortId) {
    if(!shortId) return null;
    try {
        // [HISTORY START: STEP 78] ...
        const aliasRef = doc(db, 'artifacts', appId, 'public', 'data', 'aliases', shortId);
        // ...
        
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
*/
// [OLD-CODE END]
// ==========================================

export async function syncToCloud(state) {
// ... existing code ...
    if (!state || state.settings.isCloudEnabled !== true || !auth.currentUser) return;
    try {
        const userId = auth.currentUser.uid;
        const stateDoc = doc(db, 'artifacts', appId, 'users', userId, 'data', 'state');
        await setDoc(stateDoc, { ...state, lastSync: Date.now() }, { merge: false });
    } catch (e) {
        console.error("Sync to Cloud failed:", e);
    }
}

export async function fetchFromCloud(targetUserId = null) {
// ... existing code ...
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
// ... existing code ...
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
// ... existing code ...
    if(!currentState) return;
    if(currentState.words) delete currentState.words;
    
    // Update local timestamp for sync comparison
    currentState.lastSync = Date.now();
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState)); 
    
    if (currentState.settings.isCloudEnabled === true) {
        syncToCloud(currentState);
    }
    
    window.dispatchEvent(new CustomEvent('stateUpdated', { detail: currentState }));
}

export function checkStreakValidity(currentState){
// ... existing code ...
    if(!currentState || !currentState.stats.lastLearningDate) return;
    const today = new Date().toDateString();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    
    if (currentState.stats.lastLearningDate !== today && currentState.stats.lastLearningDate !== yesterday.toDateString()) {
        currentState.stats.streak = 0;
        saveState(currentState); 
    }
}

// Globaler Zugriff für nicht-modulare Skripte
window.loadState = loadState;
window.saveState = saveState;
window.checkStreakValidity = checkStreakValidity;
window.getWordKey = getWordKey;

window.VTrainerCloud = {
    initAuth: initCloudAuth,
    fetch: fetchFromCloud,
    sync: syncToCloud,
    getUID: () => auth.currentUser?.uid,
    getOrRegisterShortId: getOrRegisterShortId,
    resolveShortId: resolveShortId
};

window.VTrainer = { loadState, saveState, checkStreakValidity, getWordKey };