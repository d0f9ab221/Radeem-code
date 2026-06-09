import { auth, db } from "./firebase.js";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile
} from "firebase/auth";
import { ref, set, get, serverTimestamp } from "firebase/database";

/**
 * Register a new user with Email, Password, and Username.
 * Instantly creates their default database profile structure.
 */
export async function registerUser(username, email, password) {
  if (!username || username.trim() === "") {
    throw new Error("Please enter a valid username.");
  }
  
  // Create user account in Firebase Authentication
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // Set the display name in Firebase Auth
  await updateProfile(user, { displayName: username });

  // Initialize their RTDB structure under users/{uid}
  const userRef = ref(db, `users/${user.uid}`);
  await set(userRef, {
    username: username.trim(),
    email: email.trim(),
    coins: 0,
    diamonds: 0,
    createdAt: Date.now() // Precise precise timestamp
  });

  return user;
}

/**
 * Log in an existing user using Email and Password.
 */
export async function loginUser(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

/**
 * Trigger a Firebase password reset email.
 */
export async function forgotPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

/**
 * Log out the current user session.
 */
export async function logoutUser() {
  await signOut(auth);
}

/**
 * Google Sign-In helper.
 * Fits web browsers, handles automatic fallback explanations if within restricted Android WebView contexts.
 */
export async function googleSignIn() {
  const provider = new GoogleAuthProvider();
  // Configured with standard Google client ID
  provider.setCustomParameters({
    client_id: "1059355688483-ee9g0rurtbo4k1o5kafkunrot9nkge97.apps.googleusercontent.com"
  });

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // Check if user has an existing database node; if not, initialize database node
    const userRef = ref(db, `users/${user.uid}`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
      await set(userRef, {
        username: user.displayName || user.email.split("@")[0] || "Player",
        email: user.email,
        coins: 0,
        diamonds: 0,
        createdAt: Date.now()
      });
    }

    return user;
  } catch (error) {
    console.error("Google login error Details:", error);
    if (error.code === "auth/operation-not-supported-in-this-environment" || 
        error.code === "auth/popup-blocked") {
      throw new Error("Google login popup is disabled or not supported inside this WebView/APK environment. Please use Email and Password login!");
    }
    if (error.code === "auth/unauthorized-domain" || (error.message && error.message.includes("unauthorized-domain"))) {
      throw new Error("Google Login Error: This domain is not whitelisted in Firebase. Please use 'Email and Password' login to start instantly, or add this app's domain to Firebase Console -> Authentication -> Settings -> Authorized Domains!");
    }
    throw error;
  }
}
