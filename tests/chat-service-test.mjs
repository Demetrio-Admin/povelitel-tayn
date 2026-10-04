import assert from "node:assert/strict";
import { ChatService, isSupport, isModerator, policyReady } from "../src/cloud/ChatService.js";
import { CloudError } from "../src/cloud/api.js";
import { PlayerSession } from "../src/cloud/PlayerSession.js";
import { GameState } from "../src/state/GameState.js";
import { loginEmail } from "../src/cloud/nickname.js";

let listener;
assert.equal(isModerator({ roles: ["support"] }), false);
assert.equal(isSupport({ roles: ["developer"] }), false);
assert.equal(policyReady({ roles: ["owner"] }), false);
assert.equal(isModerator({ roles: ["support"], policyVersion: 2 }), true);
assert.equal(isSupport({ roles: ["developer"], policyVersion: 2 }), true);
const calls = [];
let fail = true;
const session = {
  signedIn: true,
  userId: "alice",
  onChange: (fn) => ((listener = fn), () => {}),
  _authed: (fn) => fn("shared-token"),
  api: {
    rpc: async (name, args, token) => {
      calls.push({ name, args, token });
      if (fail) throw new CloudError("network", "offline");
      return { ok: true };
    },
  },
};
const chat = new ChatService(session, {
  setTimer: () => 0,
  clearTimer: () => {},
});
await assert.rejects(() => chat.request("send", { body: "hello" }));
fail = false;
await chat.request("send", { body: "hello" });
assert.equal(calls[0].args.request_id, calls[1].args.request_id);
assert.equal(calls[1].token, "shared-token");
chat.draft("room:a", "private draft");
session.userId = "bob";
listener();
assert.equal(chat.draft("room:a"), "");
assert.equal(chat.pending.size, 0);
let resolve;
session.api.rpc = () => new Promise((r) => (resolve = r));
const pending = chat.request("bootstrap");
await Promise.resolve();
session.userId = "alice";
listener();
resolve({ me: { nickname: "bob" } });
await assert.rejects(() => pending, /Аккаунт изменился/);
chat.dispose();

let refreshCount = 0,
  finish;
const player = new PlayerSession({
  api: {
    enabled: true,
    refresh: async () => {
      refreshCount++;
      return new Promise((r) => (finish = r));
    },
  },
  state: new GameState(null),
  storage: null,
});
player.auth = {
  access_token: "old",
  refresh_token: "refresh",
  expires_at: 0,
  user: { id: "alice" },
};
const a = player._fresh(),
  b = player._fresh();
assert.equal(refreshCount, 1);
finish({
  access_token: "new",
  refresh_token: "new-refresh",
  expires_at: Date.now() + 3600000,
  user: { id: "alice" },
});
assert.equal((await a).access_token, "new");
assert.equal((await b).access_token, "new");
player.auth = {
  access_token: "old",
  refresh_token: "refresh",
  expires_at: 0,
  user: { id: "alice" },
};
const stale = player._fresh();
player.auth = {
  access_token: "bob",
  refresh_token: "bob-refresh",
  expires_at: Date.now() + 3600000,
  user: { id: "bob" },
};
finish({ access_token: "alice", user: { id: "alice" } });
await assert.rejects(() => stale, /Аккаунт изменился/);
assert.equal(player.auth.user.id, "bob");
let finishRequest;
const oldRequest = player._authed(() => new Promise(r => { finishRequest = r; }));
await Promise.resolve(); await Promise.resolve();
player.auth = {access_token:"charlie",expires_at:Date.now()+3600000,user:{id:"charlie"}};
finishRequest({private:"bob"});
await assert.rejects(() => oldRequest, /Аккаунт изменился/);
// Nickname resolution happens before Auth: old name must never be submitted.
const loginCalls = [];
const renamedPlayer = new PlayerSession({
  api: { enabled: true, loginDomain: "game.test",
    nicknameLogin: async (norm) => norm === "alina" ? "alice" : null,
    signInWithEmail: async (email, password) => { loginCalls.push({ email, password }); return { access_token: "a", expires_at: Date.now()+3600000, user: { id: "a" } }; },
  }, state: new GameState(null), storage: null,
});
renamedPlayer._loadPlayer = async () => {};
await assert.rejects(() => renamedPlayer.login({ nickname: "alice", password: "unchanged" }), /Неверный никнейм/);
assert.equal(loginCalls.length, 0);
await renamedPlayer.login({ nickname: "Alina", password: "unchanged" });
assert.equal(loginCalls[0].email, await loginEmail("alice", "game.test"));
assert.equal(loginCalls[0].password, "unchanged");
// Staff changes refresh via normal delta synchronization, even with no local changes.
const refreshedState = new GameState(null);
let balance = 5, patches = [];
const refreshedPlayer = new PlayerSession({ api: { enabled: true, syncPlayer: async (_t, p) => { patches.push(p); balance += p.inv?.coins || 0; return { inventory: { coins: balance }, meta: { nickname: "Alina" } }; } }, state: refreshedState, storage: null, setTimer: () => 0 });
refreshedPlayer.auth = { access_token: "a", expires_at: Date.now()+3600000, user: { id: "a" } };
refreshedPlayer._applyServer({ inventory: { coins: 5 } });
balance = 11;
assert.equal(await refreshedPlayer.flush({ force: true }), true);
assert.equal(patches.length, 1); assert.equal(refreshedState.data.inventory.coins, 11);
refreshedState.data.inventory.coins += 2; balance += 6;
await refreshedPlayer.flush({ force: true });
assert.equal(patches[1].inv.coins, 2); assert.equal(refreshedState.data.inventory.coins, 19);
assert.equal(refreshedPlayer.nickname, "Alina");
console.log(
  "✓ Chat retry, shared auth, account isolation, renamed login and live staff resource refresh",
);
