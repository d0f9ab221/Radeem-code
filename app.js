import { auth } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import { registerUser, loginUser, forgotPassword, logoutUser, googleSignIn } from "./auth.js";
import { 
  syncUserProfile, 
  claimAdReward, 
  openMysteryBox, 
  createRedeemRequest, 
  syncRedeemRequests, 
  updateUsername 
} from "./database.js";

// Session persistence variables
let currentUser = null;
let currentProfileData = null;
let profileUnsubscribe = null;
let requestsUnsubscribe = null;

// Track if active animations are running to prevent click-spamming
let isAdPlaying = false;
let isOpeningBox = false;

// Initialize app after DOM content loads
document.addEventListener("DOMContentLoaded", () => {
  setupAuthListeners();
  
  // Bring to view the default login page
  swapAuthView("loginPage");
  
  // Attach first-time render state
  switchView("dashboardPage");
});

/* ==========================================================================
   TOAST MESSAGE SYSTEM
   ========================================================================== */
function showToast(message, type = "success") {
  const toast = document.getElementById("globalToast");
  const msgText = document.getElementById("toastMessage");
  const icon = document.getElementById("toastIcon");

  if (!toast) return;

  msgText.innerText = message;
  
  // Pick theme style
  if (type === "success") {
    toast.className = "fixed top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-emerald-600 border-emerald-500 text-white rounded-full px-5 py-2.5 shadow-xl border flex items-center gap-2 text-xs font-semibold transform transition-all duration-300";
    icon.innerText = "✓";
  } else if (type === "error") {
    toast.className = "fixed top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-rose-600 border-rose-500 text-white rounded-full px-5 py-2.5 shadow-xl border flex items-center gap-2 text-xs font-semibold transform transition-all duration-300";
    icon.innerText = "⚠";
  } else {
    toast.className = "fixed top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none bg-slate-900 border-slate-800 text-white rounded-full px-5 py-2.5 shadow-xl border flex items-center gap-2 text-xs font-semibold transform transition-all duration-300";
    icon.innerText = "ℹ";
  }

  // Slide down & Fade in
  toast.style.transform = "translate(-50%, 0)";
  toast.style.opacity = "1";

  setTimeout(() => {
    toast.style.transform = "translate(-50%, -100px)";
    toast.style.opacity = "0";
  }, 3500);
}

/* ==========================================================================
   VIEW NAVIGATION CONTROLLERS
   ========================================================================== */
window.switchView = function(viewId) {
  // Hide all view panels
  const panels = document.querySelectorAll("#appShell .view-panel");
  panels.forEach(p => p.classList.remove("active-view"));

  // Show active view
  const activePanel = document.getElementById(viewId);
  if (activePanel) {
    activePanel.classList.add("active-view");
  }

  // Update bottom navigation bar styles
  const navButtons = document.querySelectorAll("#appShell nav button");
  navButtons.forEach(btn => {
    btn.classList.add("text-slate-400");
    btn.classList.remove("text-indigo-600");
  });

  const activeTab = document.getElementById(`tab-${viewId}`);
  if (activeTab) {
    activeTab.classList.remove("text-slate-400");
    activeTab.classList.add("text-indigo-600");
  }
};

window.swapAuthView = function(authPageId) {
  const authPanels = document.querySelectorAll("#authShell .view-panel");
  authPanels.forEach(p => p.classList.remove("active-view"));

  const targetPanel = document.getElementById(authPageId);
  if (targetPanel) {
    targetPanel.classList.add("active-view");
  }
};

/* ==========================================================================
   AUTHENTICATION FORM LISTENERS
   ========================================================================== */
function setupAuthListeners() {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const forgotForm = document.getElementById("forgotForm");

  // Auth State changed observer
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      
      // Toggle UI Layout shell
      document.getElementById("authShell").classList.add("hidden");
      document.getElementById("appShell").classList.remove("hidden");

      // Set placeholder HUD name instantly while syncing
      document.getElementById("hudUsername").innerText = user.displayName || "Gamer";

      // 1. Subscribe to profile in real-time
      if (profileUnsubscribe) profileUnsubscribe();
      profileUnsubscribe = syncUserProfile(user.uid, (profile) => {
        if (profile) {
          currentProfileData = profile;
          updateDashboardAndHUDBalance(profile);
        }
      });

      // 2. Subscribe to redeem history requests list
      if (requestsUnsubscribe) requestsUnsubscribe();
      requestsUnsubscribe = syncRedeemRequests(user.uid, (requests) => {
        renderRedeemHistory(requests);
      });

      // Redirect to dashboard on login
      switchView("dashboardPage");

    } else {
      currentUser = null;
      currentProfileData = null;

      // Tear down real-time sync subscription channels
      if (profileUnsubscribe) { profileUnsubscribe(); profileUnsubscribe = null; }
      if (requestsUnsubscribe) { requestsUnsubscribe(); requestsUnsubscribe = null; }

      // Toggle shell
      document.getElementById("appShell").classList.add("hidden");
      document.getElementById("authShell").classList.remove("hidden");
      swapAuthView("loginPage");
    }
  });

  // Login click
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const loginEmail = document.getElementById("loginEmail").value;
      const loginPass = document.getElementById("loginPassword").value;
      const submitBtn = document.getElementById("loginSubmitBtn");

      submitBtn.disabled = true;
      submitBtn.innerText = "Verifying Credentials...";

      try {
        await loginUser(loginEmail, loginPass);
        showToast("Logged in successfully! Welcome back.", "success");
        loginForm.reset();
      } catch (err) {
        console.error(err);
        showToast(translateAuthError(err.code || err.message), "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Secure Log In";
      }
    });
  }

  // Register click
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("registerUsername").value;
      const email = document.getElementById("registerEmail").value;
      const password = document.getElementById("registerPassword").value;
      const submitBtn = document.getElementById("registerSubmitBtn");

      submitBtn.disabled = true;
      submitBtn.innerText = "Creating Profile...";

      try {
        await registerUser(username, email, password);
        showToast("Welcome! Profile database created successfully.", "success");
        registerForm.reset();
      } catch (err) {
        console.error(err);
        showToast(translateAuthError(err.code || err.message), "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Initialize Free Account";
      }
    });
  }

  // Forgot password Click
  if (forgotForm) {
    forgotForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("forgotEmail").value;
      const submitBtn = document.getElementById("forgotSubmitBtn");

      submitBtn.disabled = true;
      submitBtn.innerText = "Dispatching Link...";

      try {
        await forgotPassword(email);
        showToast("Password reset link dispatched! Please check your email inbox.", "success");
        forgotForm.reset();
        swapAuthView("loginPage");
      } catch (err) {
        console.error(err);
        showToast(translateAuthError(err.code || err.message), "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Send Reset Link";
      }
    });
  }
}

// Map Firebase system error identifiers to elegant descriptions for the end-user
function translateAuthError(message) {
  if (message.includes("auth/user-not-found") || message.includes("auth/wrong-password")) {
    return "Invalid email address or incorrect password. Please check your credentials and try again.";
  }
  if (message.includes("auth/email-already-in-use")) {
    return "This email address is already registered on our database. Please log in instead!";
  }
  if (message.includes("auth/weak-password")) {
    return "Weak Password! Password length must be at least 6 characters.";
  }
  if (message.includes("auth/invalid-email")) {
    return "Please enter a valid structured email address.";
  }
  return message;
}

/* ==========================================================================
   GOOGLE AUTHENTICATION TRIGGER
   ========================================================================== */
window.triggerGoogleSignIn = async function() {
  try {
    await googleSignIn();
    showToast("Google Authentication Session initialized!", "success");
  } catch (error) {
    console.error("Google login trigger error:", error);
    if (error.message && (error.message.includes("unauthorized-domain") || error.message.includes("Authorized Domains") || error.message.includes("whitelisted"))) {
      window.showDomainModal();
    } else {
      showToast(error.message, "error");
    }
  }
};

window.triggerQuickDemoLogin = async function() {
  const demoEmail = `demo_${Math.random().toString(36).substring(2, 9)}@redeemapp.com`;
  const demoPassword = "demopassword123";
  const demoUsername = `Gamer_${Math.floor(100 + Math.random() * 899)}`;

  const btn = document.getElementById("quickDemoBtn");
  const modalBtn = document.getElementById("modalDemoBtn");
  
  const originalTxt = btn ? btn.innerHTML : "Quick Demo Login";
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin h-3 w-3 text-indigo-600 mr-2 inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Initializing...`;
  }
  if (modalBtn) {
    modalBtn.disabled = true;
    modalBtn.innerText = "Launching...";
  }

  try {
    await registerUser(demoUsername, demoEmail, demoPassword);
    showToast(`Logged in under temporary profile: ${demoUsername}!`, "success");
  } catch (err) {
    console.error("Quick demo login failed:", err);
    showToast("Interactive demo login failed. Please use normal register form instead.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalTxt;
    }
    if (modalBtn) {
      modalBtn.disabled = false;
      modalBtn.innerText = "Launch Instant Demo Player";
    }
  }
};

window.showDomainModal = function() {
  const modal = document.getElementById("unauthorizedDomainModal");
  if (!modal) return;
  
  const domainCode = document.getElementById("modalCurrentDomain");
  if (domainCode) {
    domainCode.innerText = window.location.hostname;
  }
  
  modal.classList.remove("hidden");
  // Force a browser reflow to transition nicely
  modal.offsetHeight;
  modal.classList.remove("opacity-0");
  modal.classList.add("opacity-100");
};

window.closeDomainModal = function() {
  const modal = document.getElementById("unauthorizedDomainModal");
  if (!modal) return;
  modal.classList.remove("opacity-100");
  modal.classList.add("opacity-0");
  setTimeout(() => {
    modal.classList.add("hidden");
  }, 300);
};

window.copyCurrentDomain = function() {
  const host = window.location.hostname;
  navigator.clipboard.writeText(host).then(() => {
    showToast("Copied to clipboard: " + host, "success");
  }).catch(() => {
    showToast("Failed to copy domain name", "error");
  });
};

/* ==========================================================================
   LOGOUT TRIGGER
   ========================================================================== */
window.triggerLogout = async function() {
  if (confirm("Are you sure you want to sign out from the Redeem App?")) {
    try {
      await logoutUser();
      showToast("Logged out of session. See you soon!", "success");
    } catch(err) {
      showToast("Logout failed: " + err.message, "error");
    }
  }
};

/* ==========================================================================
   BALANCE HUD & PROFILE DATA UPDATE CORES
   ========================================================================== */
function updateDashboardAndHUDBalance(profile) {
  // 1. Sticky HUD counters
  document.getElementById("hudUsername").innerText = profile.username || "Gamer";
  document.getElementById("hudCoins").innerText = profile.coins !== undefined ? profile.coins : 0;
  document.getElementById("hudDiamonds").innerText = profile.diamonds !== undefined ? profile.diamonds : 0;

  // 2. Profile metadata panels
  document.getElementById("profileUsername").innerText = profile.username || "Player";
  document.getElementById("profileEmail").innerText = profile.email || currentUser.email;
  document.getElementById("profileUid").innerText = currentUser.uid;

  // Render join Date beautifully
  if (profile.createdAt) {
    const d = new Date(profile.createdAt);
    document.getElementById("profileJoinDate").innerText = d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  } else {
    document.getElementById("profileJoinDate").innerText = "Join Date Untracked";
  }

  // 3. Dashboard metrics totals
  document.getElementById("statBoxes").innerText = profile.mysteryBoxesOpened !== undefined ? profile.mysteryBoxesOpened : 0;
  document.getElementById("statAds").innerText = profile.totalAdsWatched !== undefined ? profile.totalAdsWatched : 0;
}

/* ==========================================================================
   WATCH ADS SYSTEM
   ========================================================================== */
window.runWatchAdFlow = async function() {
  if (!currentUser) {
    showToast("Please log in first to earn diamond sync rewards!", "error");
    return;
  }
  if (isAdPlaying) return;

  isAdPlaying = true;
  const watchBtn = document.getElementById("watchAdBtn");
  const adFrame = document.getElementById("adLoadingFrame");
  const progressFill = document.getElementById("adProgressFill");
  const countdownText = document.getElementById("adCountdown");

  // Prevent click-spamming by disabling CTA button
  watchBtn.disabled = true;
  watchBtn.className = "btn-tap-feedback w-full max-w-xs bg-gray-200 text-gray-400 cursor-not-allowed rounded-xl py-3 font-bold text-xs flex items-center justify-center gap-2";
  watchBtn.innerHTML = `
    <svg class="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
    <span>Loading Sponsoring Ad Video...</span>
  `;

  // Start 5-second watch count down
  adFrame.classList.remove("hidden");
  let timeLeft = 5;
  countdownText.innerText = `${timeLeft}s`;
  progressFill.style.width = "0%";
  
  // Transition fill rate smoothly
  setTimeout(() => {
    progressFill.style.width = "100%";
  }, 50);

  const watchTimer = setInterval(() => {
    timeLeft -= 1;
    if (timeLeft >= 0) {
      countdownText.innerText = `${timeLeft}s`;
    }
    
    if (timeLeft <= 0) {
      clearInterval(watchTimer);
      finalizeAdReward();
    }
  }, 1000);
};

// Safe reward finalizer
async function finalizeAdReward() {
  try {
    // Write diamonds directly to Firebase Realtime Database
    await claimAdReward(currentUser.uid);
    showToast("Reward Claimed! +19 Diamonds saved to profile.", "success");
  } catch (err) {
    console.error(err);
    showToast("Ad synchronization failed: " + err.message, "error");
  } finally {
    // Revoke loading templates back
    isAdPlaying = false;
    document.getElementById("adLoadingFrame").classList.add("hidden");
    
    const watchBtn = document.getElementById("watchAdBtn");
    watchBtn.disabled = false;
    watchBtn.className = "btn-tap-feedback w-full max-w-xs bg-slate-900 text-white rounded-xl py-3 font-bold text-xs hover:bg-slate-800 transition-all shadow-md flex items-center justify-center gap-2";
    watchBtn.innerHTML = `
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
      <span>Watch Ad (+19 Diamonds)</span>
    `;
  }
}

/* ==========================================================================
   MYSTERY BOX SYSTEM & SHAKE/GLOW PARTICLE EFFECTS
   ========================================================================== */
window.triggerMysteryBoxFlow = async function() {
  if (!currentUser) {
    showToast("Log in of session required to unlock mystery boxes!", "error");
    return;
  }
  if (isOpeningBox) return;

  // Balance checking
  const diamonds = (currentProfileData && currentProfileData.diamonds) || 0;
  if (diamonds < 19) {
    showToast("Insufficient Diamonds! Watch 1 sponsor ad to earn 19 diamonds instantly.", "error");
    switchView("earnPage");
    return;
  }

  isOpeningBox = true;
  const openBoxBtn = document.getElementById("openBoxBtn");
  const boxContainer = document.getElementById("boxContainer");
  const boxLid = document.getElementById("boxLid");
  const boxInstructionText = document.getElementById("boxInstructionText");
  const boxGlow = document.getElementById("boxGlow");

  // Prevent multiple double click spamming
  openBoxBtn.disabled = true;
  openBoxBtn.innerText = "Shaking Box...";

  // 1. ADD Premium shaken classes
  boxContainer.classList.add("box-shake");
  boxGlow.classList.add("glow-amber");
  boxInstructionText.innerText = "Rumbling Lock...";

  // 2. Start Particle spawning routine inside WebView space
  const particlesLoop = setInterval(() => {
    spawnParticle();
  }, 120);

  // After 1.5 seconds, pop open chest lid and deduct diamonds
  setTimeout(async () => {
    clearInterval(particlesLoop);
    boxContainer.classList.remove("box-shake");
    
    try {
      // Deduct diamonds, write coins securely to Realtime database
      await openMysteryBox(currentUser.uid);
      
      // Open lid visual animation
      boxLid.style.transition = "transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
      boxLid.style.transform = "translateY(-14px) rotate(-8deg)";

      boxInstructionText.innerText = "Claimed +190 Coins!";
      showToast("Box contents claimed successfully! +190 Coins credited.", "success");
      
      // Visual flare sparkles burst
      for (let i = 0; i < 15; i++) {
        setTimeout(spawnParticle, i * 40);
      }

    } catch (err) {
      console.error(err);
      showToast(err.message, "error");
      boxInstructionText.innerText = "Failed to unlock";
    } finally {
      // Re-enable opening states back
      setTimeout(() => {
        boxLid.style.transform = "none";
        boxGlow.classList.remove("glow-amber");
        boxInstructionText.innerText = "Tap Chest to Unlock";
        
        openBoxBtn.disabled = false;
        openBoxBtn.innerText = "Open Mystery Box (💎 19 Diamonds)";
        isOpeningBox = false;
      }, 2500);
    }
  }, 1500);
};

// Generates a floating gold pixel / particle on screen
function spawnParticle() {
  const space = document.getElementById("particleSpace");
  if (!space) return;

  const div = document.createElement("div");
  div.className = "particle-element";
  
  // Pick random style variations for sparkle feel
  const randLeft = 35 + Math.random() * 30; // Center values
  div.style.left = `${randLeft}%`;
  div.style.bottom = "36px";
  
  const colors = ["#F59E0B", "#FBBF24", "#FEF08A", "#EF4444", "#38BDF8"];
  div.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
  
  space.appendChild(div);

  // Self clean DOM after animation loops
  setTimeout(() => {
    if (div.parentNode) {
      div.parentNode.removeChild(div);
    }
  }, 1800);
}

/* ==========================================================================
   REDEEM CODE VOUCHER SYSTEM
   ========================================================================== */
window.requestRedemption = async function(provider, rulesAmount) {
  if (!currentUser) {
    showToast("Please log in to redeem point vouchers!", "error");
    return;
  }

  const coinCost = 900; // 900 Coins = 10 Rs
  const coinsBalance = (currentProfileData && currentProfileData.coins) || 0;

  if (coinsBalance < coinCost) {
    showToast(`Insufficient point balance! You need at least ${coinCost} coins to claim RS ${rulesAmount}.`, "error");
    return;
  }

  const proceed = confirm(`Are you sure you want to swap ${coinCost} Coins for a ${rulesAmount} RS ${provider} redeem voucher?`);
  if (!proceed) return;

  try {
    // Atomic deduction and write request queue to Firebase Realtime Database
    await createRedeemRequest(currentUser.uid, currentUser.email, coinsBalance, rulesAmount);
    showToast(`Purchased RS ${rulesAmount} Voucher! Added to claim history below.`, "success");
  } catch (err) {
    console.error(err);
    showToast(err.message, "error");
  }
};

// Render real-time syncing logs from database
function renderRedeemHistory(requestsList) {
  const container = document.getElementById("redeemHistoryList");
  if (!container) return;

  if (!requestsList || requestsList.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-xs">
        <p>No redemption submissions yet.</p>
        <p class="text-[11px] text-slate-400 mt-1">Your purchased scratchcard vouchers will generate here.</p>
      </div>
    `;
    return;
  }

  let htmlStr = "";
  requestsList.forEach((req) => {
    const formattedDate = new Date(req.createdAt).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });

    const isPending = req.status === "pending";

    // Generate simulated unlock key from code ID
    const sampleVoucherCode = generateLocalKey(req.id, req.amount);

    htmlStr += `
      <div class="border border-slate-100 rounded-xl p-4 bg-slate-50/50 relative overflow-hidden transition-all">
        <!-- Timestamp -->
        <span class="absolute right-3.5 top-3.5 text-[9px] font-bold text-slate-400 font-mono">${formattedDate}</span>

        <div class="space-y-0.5">
          <span class="text-[9px] uppercase tracking-wider font-extrabold text-indigo-500">${req.coinsUsed} COINS SWAPPED</span>
          <h4 class="text-xs font-bold text-slate-800 leading-tight">RS ${req.amount} Redeem Card</h4>
        </div>

        <!-- Scratch Coating logic -->
        <div class="mt-3 relative h-14 w-full bg-white rounded-lg border border-slate-200 flex items-center justify-between px-3 overflow-hidden">
          <div class="text-left font-mono">
            <p class="text-[8px] text-slate-400 tracking-wider">VOUCHER ACTIVE CODE</p>
            <p class="text-xs font-bold text-indigo-600 font-mono tracking-wide">${sampleVoucherCode}</p>
          </div>

          <button onclick="copyGeneratedKey('${sampleVoucherCode}')" class="btn-tap-feedback bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] rounded-lg px-3 py-2 shadow-sm transition-all">
            Copy Code
          </button>
        </div>

        <div class="mt-2.5 flex items-center gap-1.5 text-[10px]">
          <span class="h-2 w-2 rounded-full ${isPending ? 'bg-amber-400 animate-ping' : 'bg-emerald-500'}"></span>
          <span class="${isPending ? 'text-amber-600 font-bold' : 'text-slate-500'} uppercase font-extrabold tracking-widest text-[9px]">
            Status: ${req.status || "completed"}
          </span>
        </div>
      </div>
    `;
  });

  container.innerHTML = htmlStr;
}

// Generate simple human readable copy string key for simulation based on request context 
function generateLocalKey(reqId, rsAmount) {
  const safeId = reqId.slice(-4).toUpperCase();
  return `GPLY-RS${rsAmount}-${safeId}-APP0`;
}

// Clipboard copy action
window.copyGeneratedKey = function(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast("Redeem key copied to clipboard!", "success");
  }).catch(() => {
    showToast("Unable to copy code", "error");
  });
};

/* ==========================================================================
   PROFILE EDITING & UPDATES
   ========================================================================== */
window.toggleProfileEdit = function(isEditing) {
  const viewMode = document.getElementById("profileViewMode");
  const editMode = document.getElementById("profileEditMode");
  const input = document.getElementById("editUsernameInput");

  if (isEditing) {
    viewMode.classList.add("hidden");
    editMode.classList.remove("hidden");
    input.value = (currentProfileData && currentProfileData.username) || "";
    input.focus();
  } else {
    viewMode.classList.remove("hidden");
    editMode.classList.add("hidden");
  }
};

window.saveUserProfileName = async function() {
  if (!currentUser) return;
  
  const input = document.getElementById("editUsernameInput");
  const newName = input.value;

  if (!newName || newName.trim() === "") {
    showToast("Username cannot be empty!", "error");
    return;
  }

  try {
    await updateUsername(currentUser.uid, newName);
    showToast("Profile nickname modified!", "success");
    toggleProfileEdit(false);
  } catch (err) {
    console.error(err);
    showToast("Save failed: " + err.message, "error");
  }
};
