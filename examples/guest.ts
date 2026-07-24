// Guest / anonymous auth example.
//
// A guest is a real player (with a persistent player_id) that needs no username
// or password. The device holds a {device_id, device_secret} keypair; the same
// pair resumes the same player on every launch. `guestDevice` manages that
// keypair for you (generate on first run, persist, reuse) and signs in.

import { Asobi, device } from "../src/index.js";

const sdk = new Asobi({ baseUrl: "http://localhost:8084" });

// --- The one-call flow (recommended) -----------------------------------
// Generates + persists the keypair on first run (localStorage in a browser),
// reuses it after, and signs in. `created` is true only on the first sign-in.
async function signIn() {
  const session = await sdk.auth.guestDevice();

  if (session.created) {
    console.log("brand-new guest:", session.player_id);
    // ... run first-time onboarding here ...
  } else {
    console.log("welcome back, guest:", session.player_id);
  }

  // You now have an authenticated session; the SDK is ready for backend calls
  // and a WebSocket handshake.
  const ws = sdk.websocket();
  await ws.connect();
}

// --- Turning a guest into a real account --------------------------------
// Call this (after a successful guest sign-in) when the player wants their
// progress to survive a reinstall or move to another device. The player_id is
// KEPT - nothing is lost; a username/password is just added to the same player.
async function upgradeToAccount(username: string, password: string) {
  const res = await sdk.auth.upgradeGuest({ username, password });
  console.log("account claimed, same player_id:", res.player_id);
}

// --- Switch guest / "forget me" / delete-my-data ------------------------
// Erase the stored keypair. The NEXT guestDevice mints a brand-new guest
// (session.created = true). This is local-only - it does not delete the server
// account, so pair it with logout to end the current session. If the player
// wants to KEEP the current guest, call upgradeGuest first.
async function forgetGuest() {
  await sdk.auth.logout();
  device.clear(); // pass the same key/store opts you signed in with
  console.log("guest forgotten; next launch starts fresh");
}

// --- Options: custom storage or a stronger byte source ------------------
// Store under your own key, in your own persistence, and/or supply the random
// bytes yourself (the default is Web Crypto getRandomValues).
async function signInWithOptions() {
  const session = await sdk.auth.guestDevice({
    key: "mygame.guest", // storage key (default "asobi.guest_device")
    // store: myKeychainStore,       // any { getItem, setItem, removeItem }
    // randomBytes: (n) => myCsprng(n),  // must return >= n bytes
  });
  console.log("signed in:", session.player_id);
}

// --- Bring your own credentials -----------------------------------------
// If you would rather manage the keypair yourself (e.g. an OS keychain), skip
// the helper and pass the values to guest() directly. device_secret must be
// standard base64 of >= 32 random bytes; device_id is any stable per-install id.
async function signInManual(deviceId: string, deviceSecret: string) {
  const session = await sdk.auth.guest({ device_id: deviceId, device_secret: deviceSecret });
  console.log("signed in:", session.player_id);
}

export { signIn, upgradeToAccount, forgetGuest, signInWithOptions, signInManual };
