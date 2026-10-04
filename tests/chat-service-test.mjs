import assert from "node:assert/strict";
import { ChatService } from "../src/cloud/ChatService.js";
import { CloudError } from "../src/cloud/api.js";
import { PlayerSession } from "../src/cloud/PlayerSession.js";
import { GameState } from "../src/state/GameState.js";

let listener;
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
console.log(
  "✓ Chat retry, shared auth refresh, account isolation and draft privacy",
);
