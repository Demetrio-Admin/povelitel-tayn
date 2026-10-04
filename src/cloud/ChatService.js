import { CloudError } from "./api.js";

const READS = new Set([
  "bootstrap",
  "history",
  "profile",
  "roles_lookup",
  "tickets",
  "ticket",
  "roster",
  "reports",
  "audit",
  "tasks",
  "ignored",
  "player_lookup",
  "templates",
]);
export const roleOf = (p) =>
  ["owner", "admin", "developer", "support", "moderator"].find((r) =>
    p?.roles?.includes(r),
  ) || "player";
export const isAdmin = (p) =>
  p?.roles?.some((r) => r === "admin" || r === "owner");
export const rankOf = (p) => ["player", "moderator", "support", "developer", "admin", "owner"].indexOf(roleOf(p));
export const isOwner = (p) => roleOf(p) === "owner";
export const policyReady = (p) => p?.policyVersion === 2;
export const isDeveloper = (p) => rankOf(p) >= 3;
export const isModerator = (p) => policyReady(p) ? rankOf(p) >= 1 : isAdmin(p) || p?.roles?.includes("moderator");
export const isSupport = (p) => policyReady(p) ? rankOf(p) >= 2 : isAdmin(p) || p?.roles?.includes("support");
export const canManage = (actor, target) => actor?.ref !== target?.ref && rankOf(actor) > rankOf(target) && !isOwner(target);
export const textLength = (s) => Array.from(s.normalize("NFC")).length;

/** One token lifecycle, memory-only drafts, idempotent retry, permission refresh on every poll. */
export class ChatService {
  constructor(
    session,
    {
      setTimer = (fn, ms) => setTimeout(fn, ms),
      clearTimer = (t) => clearTimeout(t),
    } = {},
  ) {
    this.session = session;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.userId = session?.userId;
    this.data = null;
    this.drafts = new Map();
    this.pending = new Map();
    this.listeners = new Set();
    this.timer = null;
    this.open = false;
    this.polling = false;
    this.error = null;
    this.epoch = 0;
    this.off = session?.onChange(() => {
      if (this.userId !== session.userId) {
        this.clear();
        this.userId = session.userId;
        this.emit("account");
      }
      if (session.signedIn && !this.timer && !this.polling) this.schedule(0);
    });
    if (session?.signedIn) this.schedule(0);
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(reason) {
    this.listeners.forEach((f) => f(reason, this));
  }
  clear() {
    this.epoch++;
    this.data = null;
    this.error = null;
    this.drafts.clear();
    this.pending.clear();
    this.clearTimer(this.timer);
    this.timer = null;
  }
  dispose() {
    this.clear();
    this.off?.();
    this.listeners.clear();
  }
  draft(key, value) {
    if (value !== undefined) this.drafts.set(key, value);
    return this.drafts.get(key) || "";
  }
  async request(op, args = {}) {
    if (!this.session?.signedIn)
      throw new CloudError(
        "not_configured",
        "Войдите в онлайн-аккаунт, чтобы открыть чат.",
      );
    const epoch = this.epoch,
      uid = this.session.userId,
      key = op + ":" + JSON.stringify(args);
    let id = null;
    if (!READS.has(op)) {
      id = this.pending.get(key) || crypto.randomUUID();
      this.pending.set(key, id);
    }
    try {
      const result = await this.session._authed((token) =>
        this.session.api.rpc(
          "chat_request",
          { op, args, request_id: id },
          token,
        ),
      );
      if (this.epoch !== epoch || this.session.userId !== uid)
        throw new CloudError(
          "unauthorized",
          "Аккаунт изменился. Откройте чат снова.",
        );
      this.pending.delete(key);
      return result;
    } catch (e) {
      if (!["network", "timeout", "server"].includes(e.code))
        this.pending.delete(key);
      throw e;
    }
  }
  async refresh() {
    const epoch = this.epoch;
    const data = await this.request("bootstrap");
    if (epoch !== this.epoch) return;
    const changed =
      this.data?.me?.revision !== undefined &&
      (this.data.me.revision !== data.me.revision ||
        this.data.me.policyVersion !== data.me.policyVersion);
    const staffChanged = this.data?.me?.staffRevision !== undefined &&
      this.data.me.staffRevision !== data.me.staffRevision;
    this.data = data;
    this.error = null;
    if (data.sanctions.some((b) => b.kind === "game"))
      this.session.setGameBan?.(data);
    else if (this.session.status === "banned")
      await this.session.reloadAfterBan?.();
    else if (staffChanged)
      await this.session.flush?.({ force: true });
    this.emit(changed ? "permissions" : "refresh");
    return data;
  }
  get unread() {
    return (
      (this.data?.supportUnread || 0) +
      (this.data?.mentions || 0) +
      (this.data?.rooms || []).reduce(
        (n, r) =>
          n + (r.kind === "dm" || r.kind === "news" ? Number(r.unread) : 0),
        0,
      )
    );
  }
  setOpen(value) {
    this.open = value;
    this.schedule(value ? 5000 : 30000);
  }
  schedule(ms) {
    this.clearTimer(this.timer);
    this.timer = null;
    if (!this.session?.signedIn) return;
    this.timer = this.setTimer(() => this.poll(), ms);
  }
  async poll() {
    this.timer = null;
    if (this.polling) return;
    if (typeof document !== "undefined" && document.hidden) {
      this.schedule(30000);
      return;
    }
    this.polling = true;
    try {
      await this.refresh();
    } catch (e) {
      this.error = e;
      this.emit("error");
    } finally {
      this.polling = false;
      this.schedule(this.open ? 5000 : 30000);
    }
  }
}
