import { db } from "./firebase.js";
import { 
  ref, 
  onValue, 
  get, 
  update, 
  push, 
  runTransaction,
  query,
  orderByChild,
  equalTo
} from "firebase/database";

/**
 * Sync logged in user profile, coins, and diamonds in real-time.
 * Automatically detaches when user changes or session closes.
 */
export function syncUserProfile(uid, onCallback) {
  const userRef = ref(db, `users/${uid}`);
  const unsubscribe = onValue(userRef, (snapshot) => {
    if (snapshot.exists()) {
      onCallback(snapshot.val());
    } else {
      onCallback(null);
    }
  }, (error) => {
    console.error("User profile sync error:", error);
  });
  return unsubscribe;
}

/**
 * Handle Watch Ads Reward System.
 * Safe Atomic transaction update to guarantee no race conditions.
 */
export async function claimAdReward(uid) {
  const userRef = ref(db, `users/${uid}`);
  
  await runTransaction(userRef, (currentData) => {
    if (currentData) {
      if (currentData.diamonds === undefined) {
        currentData.diamonds = 0;
      }
      currentData.diamonds += 19;
    }
    return currentData;
  });
}

/**
 * Handle Mystery Box reward opening.
 * Deducts 19 Diamonds, claims +190 Coins.
 * Performs transaction check to protect against exploits.
 */
export async function openMysteryBox(uid) {
  const userRef = ref(db, `users/${uid}`);
  let openedSuccessfully = false;

  await runTransaction(userRef, (currentData) => {
    if (currentData) {
      const diamonds = currentData.diamonds || 0;
      if (diamonds < 19) {
        // Stop transaction - insufficient funds
        return; 
      }
      currentData.diamonds = diamonds - 19;
      currentData.coins = (currentData.coins || 0) + 190;
      openedSuccessfully = true;
    }
    return currentData;
  });

  if (!openedSuccessfully) {
    throw new Error("Insufficient Diamonds! You need at least 19 Diamonds to open a Mystery Box.");
  }
}

/**
 * Purchase/claim a redeem code request.
 * Required: Deduct 900 coins balance and record redeemRequest model.
 * 900 Coins = 10 Rupees (RS) format. Formula checks for multiples as well (e.g. increments).
 */
export async function createRedeemRequest(uid, email, rtdbCoinsAmount, rupeesVal) {
  if (rupeesVal <= 0) {
    throw new Error("Invalid redemption amount requested.");
  }
  
  const coinsNeeded = (rupeesVal / 10) * 900;
  
  const userRef = ref(db, `users/${uid}`);
  let processSuccess = false;

  // 1. Atomically deduct requested coins
  await runTransaction(userRef, (currentData) => {
    if (currentData) {
      const currentCoins = currentData.coins || 0;
      if (currentCoins < coinsNeeded) {
        return; // Abort
      }
      currentData.coins = currentCoins - coinsNeeded;
      processSuccess = true;
    }
    return currentData;
  });

  if (!processSuccess) {
    throw new Error(`Insufficient coins! You need at least ${coinsNeeded} coins to claim RS ${rupeesVal}.`);
  }

  // 2. Insert redeem request securely into database under `redeemRequests/`
  const requestsRef = ref(db, "redeemRequests");
  const newRequestRef = push(requestsRef);
  
  await update(newRequestRef, {
    uid: uid,
    email: email,
    coinsUsed: coinsNeeded,
    amount: rupeesVal,
    status: "pending",
    createdAt: Date.now()
  });

  return newRequestRef.key;
}

/**
 * Subscribe to the redeem request list in real-time specifically belonging to this user
 */
export function syncRedeemRequests(uid, onCallback) {
  const requestsRef = ref(db, "redeemRequests");
  const userQuery = query(requestsRef, orderByChild("uid"), equalTo(uid));
  
  const unsubscribe = onValue(userQuery, (snapshot) => {
    const list = [];
    if (snapshot.exists()) {
      snapshot.forEach((childSnapshot) => {
        list.push({
          id: childSnapshot.key,
          ...childSnapshot.val()
        });
      });
      // Sort descending (newest first)
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    onCallback(list);
  }, (error) => {
    console.error("Redeem requests subscription error:", error);
  });

  return unsubscribe;
}

/**
 * Update the user's username profile data
 */
export async function updateUsername(uid, newName) {
  if (!newName || newName.trim() === "") {
    throw new Error("Username cannot be blank!");
  }
  const userRef = ref(db, `users/${uid}`);
  await update(userRef, {
    username: newName.trim()
  });
}
