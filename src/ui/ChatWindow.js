import {
  createElement,
  X,
  ArrowLeft,
  Send,
  MessageCircle,
  Shield,
  Crown,
  CodeXml,
  Headphones,
  MoreHorizontal,
  UserRound,
  Pin,
  RefreshCw,
  Check,
  Plus,
  Reply,
  Trash2,
  Pencil,
  Flag,
  Ban,
  NotebookPen,
} from "lucide";
import {
  roleOf,
  isAdmin,
  isModerator,
  isSupport,
  isOwner,
  isDeveloper,
  canManage,
  policyReady,
  textLength,
} from "../cloud/ChatService.js";

const ROLES = {
  owner: ["Владелец", Crown],
  admin: ["Администратор", Crown],
  moderator: ["Модератор", Shield],
  developer: ["Разработчик", CodeXml],
  support: ["Техподдержка", Headphones],
  player: ["Игрок", UserRound],
};
const CATEGORIES = {
  account: "Аккаунт",
  bug: "Ошибка игры",
  question: "Вопрос",
  appeal: "Обжалование",
};
const STATUSES = {
  new: "Новое",
  work: "В работе",
  waiting: "Ждём игрока",
  solved: "Решено",
  closed: "Закрыто",
};
const time = (s) =>
  new Date(s).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const icon = (i) => {
  const e = createElement(i);
  e.setAttribute("aria-hidden", "true");
  return e;
};
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const append = (p, ...kids) => {
  kids.filter(Boolean).forEach((c) => p.append(c));
  return p;
};
function button(
  label,
  fn,
  { symbol, cls = "chat-button", disabled = false } = {},
) {
  const b = el("button", cls);
  b.type = "button";
  b.disabled = disabled;
  if (symbol) b.append(icon(symbol));
  if (label) b.append(el("span", "", label));
  b.onclick = fn;
  return b;
}
function iconButton(label, symbol, fn) {
  const b = button("", fn, { symbol, cls: "chat-icon" });
  b.setAttribute("aria-label", label);
  b.title = label;
  return b;
}
function field(label, input) {
  return append(el("label", "chat-field"), el("span", "", label), input);
}
function input(placeholder = "", value = "", type = "text") {
  const i = el("input");
  i.type = type;
  i.placeholder = placeholder;
  i.value = value;
  return i;
}
function select(values, value) {
  const s = el("select");
  Object.entries(values).forEach(([v, label]) => {
    const o = el("option", "", label);
    o.value = v;
    s.append(o);
  });
  if (value) s.value = value;
  return s;
}
function avatar(p) {
  const a = el("div", "chat-avatar"),
    i = el("img");
  i.src = `${import.meta.env.BASE_URL}assets/sprites/${p?.hero === "warlock" ? "warlock" : "hero"}_down.png`;
  i.alt = "";
  a.append(i);
  return a;
}
function roleBadge(role) {
  const [label, symbol] = ROLES[role] || ROLES.player;
  return append(
    el("span", `chat-role role-${role}`),
    icon(symbol),
    el("span", "", label),
  );
}
const empty = (s) => el("p", "chat-empty", s);

/** All routes fill the game canvas. No staff/customer data lives in localStorage. */
export class ChatWindow {
  constructor(service, { onClose, onLogout } = {}) {
    this.service = service;
    this.onClose = onClose;
    this.onLogout = onLogout;
    this.closed = false;
    this.stack = [];
    this.route = { view: "room" };
    this.messages = [];
    this.cursor = "0";
    this.readCursors = new Map();
    this.ticketReads = new Map();
    this.reply = null;
    this.ticketMode = "public";
    this.generation = 0;
    this.busy = false;
    this.refreshing = false;
    this.previousFocus = document.activeElement;
    this.root = el("section", "game-chat");
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "Игровой чат");
    this.root.tabIndex = -1;
    document.body.append(this.root);
    this.root.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        this.back();
      }
      if (e.key === "Tab") this.trapFocus(e);
    });
    this.root.addEventListener("keyup", (e) => e.stopPropagation());
    this.canvas = document.querySelector("#game canvas");
    this.scale = window.__game?.scale;
    this.viewport = () => {
      if (this.closed) return;
      const v = window.visualViewport;
      const visible = {
        left: v?.offsetLeft || 0,
        top: v?.offsetTop || 0,
        width: v?.width || window.innerWidth,
        height: v?.height || window.innerHeight,
      };
      const rect = this.canvas?.getBoundingClientRect();
      const game = rect?.width && rect?.height ? rect : visible;
      // FIT leaves bars around the canvas. The keyboard can also cover part of it.
      const left = Math.max(game.left, visible.left);
      const top = Math.max(game.top, visible.top);
      const right = Math.min(game.left + game.width, visible.left + visible.width);
      const bottom = Math.min(game.top + game.height, visible.top + visible.height);
      Object.assign(this.root.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${Math.max(0, right - left)}px`,
        height: `${Math.max(0, bottom - top)}px`,
      });
    };
    window.addEventListener("resize", this.viewport);
    this.scale?.on("resize", this.viewport);
    if (window.ResizeObserver && this.canvas) {
      this.resizeObserver = new ResizeObserver(this.viewport);
      this.resizeObserver.observe(this.canvas);
      if (this.canvas.parentElement)
        this.resizeObserver.observe(this.canvas.parentElement);
    }
    window.visualViewport?.addEventListener("resize", this.viewport);
    window.visualViewport?.addEventListener("scroll", this.viewport);
    this.viewport();
    this.off = service.onChange((reason) => {
      if (reason === "account") {
        this.close();
        return;
      }
      if (reason === "permissions") {
        this.stack = [];
        this.messages = [];
        this.ticket = null;
        this.route = { view: "room" };
        this.load();
        return;
      }
      if (reason === "refresh") this.liveRefresh();
      if (reason === "error" && this.statusLine) {
        this.statusLine.hidden = false;
        this.statusLine.textContent =
          "Связь прервана. Черновик сохранён; повторим подключение.";
      }
    });
    service.setOpen(true);
    this.load(true);
    this.root.focus();
  }
  trapFocus(e) {
    const all = [
      ...this.root.querySelectorAll(
        "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)",
      ),
    ].filter((n) => n.getClientRects().length);
    const first = all[0],
      last = all.at(-1);
    if (!all.length) {
      e.preventDefault();
      return;
    }
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    this.off?.();
    this.service.setOpen(false);
    window.removeEventListener("resize", this.viewport);
    this.scale?.off("resize", this.viewport);
    this.resizeObserver?.disconnect();
    window.visualViewport?.removeEventListener("resize", this.viewport);
    window.visualViewport?.removeEventListener("scroll", this.viewport);
    this.root.remove();
    this.previousFocus?.focus?.();
    this.onClose?.();
  }
  back() {
    if (this.stack.length) {
      this.route = this.stack.pop();
      this.reply = null;
      this.load();
    } else this.close();
  }
  go(route) {
    this.stack.push(this.route);
    this.route = route;
    this.reply = null;
    this.load();
  }
  replace(route) {
    this.route = route;
    this.reply = null;
    this.load();
  }
  get me() {
    return this.service.data?.me;
  }
  get bans() {
    return this.service.data?.sanctions || [];
  }
  get restricted() {
    return this.bans.some((b) => b.kind === "game");
  }
  room() {
    return (
      this.service.data?.rooms.find((r) => r.id === this.route.room) ||
      this.service.data?.rooms.find((r) => r.kind === "general")
    );
  }
  shell(title = "Чат", note = "Повелитель Тайн · Шепчущий лес") {
    this.root.replaceChildren();
    const head = el("header", "chat-head"),
      brand = append(
        el("div", "chat-brand"),
        el("h1", "", title),
        el("div", "sub", note),
      );
    if (this.stack.length)
      head.append(iconButton("Назад", ArrowLeft, () => this.back()));
    append(
      head,
      brand,
      iconButton("Мой профиль", UserRound, () =>
        this.go({ view: "profile", ref: this.me?.ref }),
      ),
      iconButton("Поддержка", Headphones, () => this.go({ view: "tickets" })),
      iconButton("Закрыть чат", X, () => this.close()),
    );
    this.root.append(head);
    this.statusLine = el("div", "chat-banner");
    this.statusLine.setAttribute("aria-live", "polite");
    this.statusLine.hidden = true;
    this.root.append(this.statusLine);
    if (isAdmin(this.me) && !policyReady(this.me)) { this.statusLine.hidden = false; this.statusLine.textContent = "Новые функции ролей ещё не включены."; }
    if (this.bans.length) {
      this.statusLine.hidden = false;
      this.statusLine.textContent = this.bans
        .map(
          (b) =>
            `${b.kind === "game" ? "Доступ к игре ограничен" : b.kind === "mute" ? "Ограничение чата" : "Предупреждение"}: ${b.reason}${b.until ? ` · до ${time(b.until)}` : " · бессрочно"}`,
        )
        .join(" / ");
    }
    this.view = el("main", "chat-view");
    this.root.append(this.view);
    this.error = el("p", "chat-error");
    this.error.setAttribute("role", "status");
    return this.view;
  }
  scroll() {
    const s = el("div", "chat-scroll");
    this.view.append(s);
    return s;
  }
  async load(initial = false) {
    const g = ++this.generation;
    this.shell();
    this.view.append(el("p", "chat-wait", "Открываем чат…"));
    try {
      if (initial || !this.service.data) await this.service.refresh();
      if (this.closed || g !== this.generation) return;
      if (this.restricted && this.route.view === "room")
        this.route = { view: "restricted" };
      const r = this.route;
      const paint = async (op, args, render) => {
        const data = await this.service.request(op, args);
        if (!this.closed && g === this.generation) render(data);
      };
      if (r.view === "room") {
        const room = this.room();
        if (!room) {
          this.renderRestricted();
          return;
        }
        r.room = room.id;
        const data = await this.service.request("history", { room: room.id });
        if (g !== this.generation) return;
        this.messages = data.messages;
        this.cursor = data.cursor;
        this.pinned = data.pinned;
        this.renderRoom();
        this.markRead();
      } else if (r.view === "profile")
        await paint("profile", { ref: r.ref || this.me.ref }, (p) =>
          this.renderProfile(p),
        );
      else if (r.view === "roles") this.renderRoles();
      else if (r.view === "player") this.renderPlayer();
      else if (r.view === "templates") await paint("templates", {}, (t) => this.renderTemplates(t));
      else if (r.view === "tickets")
        await paint("tickets", { filter: r.filter || "all" }, (t) =>
          this.renderTickets(t),
        );
      else if (r.view === "ticket")
        await paint("ticket", { ticket: r.ticket }, (t) =>
          this.renderTicket(t),
        );
      else if (r.view === "ticket_new") this.renderNewTicket();
      else if (r.view === "tasks")
        await paint("tasks", {}, (t) => this.renderTasks(t));
      else if (r.view === "reports")
        await paint("reports", {}, (t) => this.renderReports(t));
      else if (r.view === "audit")
        await paint("audit", {}, (t) => this.renderAudit(t));
      else if (r.view === "restricted") this.renderRestricted();
      else if (r.view === "message") this.renderMessageActions(r.message);
      else if (r.view === "form") this.renderForm(r);
      else if (r.view === "confirm") this.renderConfirm(r);
    } catch (e) {
      if (!this.closed && g === this.generation) {
        this.shell("Чат");
        const s = this.scroll();
        append(
          s,
          empty(e.message),
          button("Повторить", () => this.load(true), { symbol: RefreshCw }),
          button("Закрыть", () => this.close()),
        );
      }
    }
  }
  async act(fn, { after } = {}) {
    if (this.busy) return;
    this.busy = true;
    this.error.textContent = "";
    const buttons = [...this.root.querySelectorAll("button")];
    buttons.forEach((b) => (b.disabled = true));
    try {
      const result = await fn();
      if (!this.closed) await after?.(result);
      return result;
    } catch (e) {
      if (!this.closed) {
        this.error.textContent = e.message;
        if (!this.error.isConnected) this.view.append(this.error);
      }
    } finally {
      this.busy = false;
      buttons.forEach((b) => {
        if (b.isConnected) b.disabled = false;
      });
    }
  }
  async markRead() {
    const room = this.route.room,
      cursor = this.cursor;
    if (this.restricted || !room || this.readCursors.get(room) === cursor)
      return;
    try {
      await this.service.request("read", { room, cursor });
      this.readCursors.set(room, cursor);
    } catch {
      /* next poll repeats */
    }
  }
  async liveRefresh() {
    if (this.closed || this.busy || this.refreshing) return;
    this.refreshing = true;
    const g = this.generation;
    try {
      if (this.restricted && this.route.view === "room") {
        this.replace({ view: "restricted" });
        return;
      }
      if (this.route.view === "room" && this.route.room) {
        const data = await this.service.request("history", {
          room: this.route.room,
          after: this.cursor,
        });
        if (this.closed || g !== this.generation) return;
        if (data.messages.length) {
          const by = new Map(this.messages.map((m) => [m.id, m]));
          data.messages.forEach((m) => by.set(m.id, m));
          for (const m of by.values()) {
            const parent = by.get(m.reply?.id);
            if (parent)
              m.reply.body = parent.deleted
                ? "Сообщение удалено"
                : parent.body.slice(0, 120);
          }
          this.messages = [...by.values()]
            .sort((a, b) => (BigInt(a.seq) < BigInt(b.seq) ? -1 : 1))
            .slice(-150);
          this.renderFeed();
        }
        this.cursor = data.cursor;
        this.pinned = data.pinned;
        if (this.pin?.isConnected) {
          this.pin.hidden = !this.pinned;
          this.pin.replaceChildren();
          if (this.pinned)
            append(
              this.pin,
              icon(Pin),
              el("span", "", ` Закреплено: ${this.pinned.body}`),
            );
        }
        this.markRead();
      } else if (this.route.view === "ticket") {
        const t = await this.service.request("ticket", {
          ticket: this.route.ticket,
        });
        if (
          !this.closed &&
          g === this.generation &&
          t.revision !== this.ticket?.revision
        )
          this.renderTicket(t);
      } else if (this.route.view === "tickets") {
        const t = await this.service.request("tickets", {
          filter: this.route.filter || "all",
        });
        if (!this.closed && g === this.generation) this.renderTickets(t);
      }
    } catch (e) {
      if (!this.closed && this.statusLine) {
        this.statusLine.hidden = false;
        this.statusLine.textContent = e.message;
      }
    } finally {
      this.refreshing = false;
    }
  }
  renderRoom() {
    const room = this.room();
    this.shell(
      room.kind === "dm" ? room.title : "Чат",
      room.kind === "dm"
        ? "Личная переписка"
        : "Повелитель Тайн · Шепчущий лес",
    );
    const tabs = el("nav", "chat-tabs");
    tabs.setAttribute("aria-label", "Каналы");
    this.service.data.rooms
      .filter((r) => r.kind !== "dm")
      .forEach((r) => {
        const b = button(
          r.title,
          () => {
            this.messages = [];
            this.replace({ view: "room", room: r.id });
          },
          { cls: "chat-tab" },
        );
        b.setAttribute("aria-selected", String(room.id === r.id));
        tabs.append(b);
      });
    const dms = button(
      "Личные",
      () =>
        this.go({
          view: "form",
          title: "Личные сообщения",
          custom: (s) => this.renderDMList(s),
        }),
      { cls: "chat-tab" },
    );
    dms.setAttribute("aria-selected", String(room.kind === "dm"));
    tabs.append(dms);
    this.view.append(tabs);
    const toolbar = el("div", "chat-toolbar");
    if (isModerator(this.me))
      append(
        toolbar,
        button("Жалобы", () => this.go({ view: "reports" }), {
          symbol: Shield,
        }),
        button("Журнал", () => this.go({ view: "audit" }), {
          symbol: NotebookPen,
        }),
      );
    if (isAdmin(this.me))
      toolbar.append(
        button("Роли по ID", () => this.go({ view: "roles" }), {
          symbol: Crown,
        }),
      );
    if (policyReady(this.me) && isDeveloper(this.me))
      toolbar.append(button("Игрок по ID", () => this.go({ view: "player" }), { symbol: UserRound }));
    if (isDeveloper(this.me))
      toolbar.append(
        button("Задачи", () => this.go({ view: "tasks" }), { symbol: CodeXml }),
      );
    if (toolbar.children.length) this.view.append(toolbar);
    this.pin = el("div", "chat-pin");
    if (this.pinned)
      append(
        this.pin,
        icon(Pin),
        el("span", "", ` Закреплено: ${this.pinned.body}`),
      );
    this.pin.hidden = !this.pinned;
    this.view.append(this.pin);
    this.feed = this.scroll();
    this.renderFeed(true);
    if (!this.me.registered) {
      this.view.append(
        el(
          "div",
          "chat-banner",
          "Вы читаете как гость. Создайте аккаунт в профиле игры, чтобы писать.",
        ),
      );
      return;
    }
    if (
      this.bans.some((b) => b.kind === "mute") ||
      (room.kind === "news" &&
        !isDeveloper(this.me))
    ) {
      this.view.append(
        el(
          "div",
          "chat-banner",
          room.kind === "news"
            ? "Здесь публикуются официальные новости."
            : "Отправка сообщений временно ограничена. Поддержка доступна.",
        ),
      );
      return;
    }
    this.compose = el("div", "chat-compose");
    this.replyBar = el("div", "chat-reply");
    this.replyBar.hidden = true;
    this.compose.append(this.replyBar);
    const key = "room:" + room.id,
      ta = el("textarea");
    ta.rows = 2;
    ta.placeholder = "Написать сообщение…";
    ta.setAttribute("aria-label", "Сообщение");
    ta.value = this.service.draft(key);
    const count = el("div", "chat-counter");
    const update = () => {
      this.service.draft(key, ta.value);
      count.textContent = `${textLength(ta.value)} / 500 · Enter — отправить, Shift+Enter — строка`;
    };
    ta.oninput = update;
    update();
    const send = () =>
      this.act(async () => {
        const original = ta.value,
          generation = this.generation;
        const body = original.trim();
        if (!body || textLength(body) > 500)
          throw Error("Введите сообщение до 500 символов.");
        await this.service.request("send", {
          room: room.id,
          body,
          ...(this.reply ? { reply: this.reply.id } : {}),
        });
        if (this.service.draft(key) === original) {
          this.service.draft(key, "");
          ta.value = "";
        }
        if (this.closed || generation !== this.generation) return;
        this.reply = null;
        this.replyBar.hidden = true;
        update();
        await this.liveRoomReload();
      });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      }
    });
    append(
      this.compose,
      append(
        el("div", "chat-compose-row"),
        ta,
        iconButton("Отправить сообщение", Send, send),
      ),
      count,
      this.error,
    );
    this.view.append(this.compose);
    if (this.route.reply) {
      this.reply = this.route.reply;
      delete this.route.reply;
      this.replyBar.hidden = false;
      this.replyBar.replaceChildren(
        el("span", "", `Ответ ${this.reply.author.nickname}`),
        iconButton("Отменить ответ", X, () => {
          this.reply = null;
          this.replyBar.hidden = true;
        }),
      );
    }
  }
  async liveRoomReload() {
    const room = this.route.room,
      generation = this.generation;
    const d = await this.service.request("history", { room });
    if (this.closed || generation !== this.generation) return;
    this.messages = d.messages;
    this.cursor = d.cursor;
    this.pinned = d.pinned;
    this.renderFeed(true);
    this.markRead();
  }
  renderFeed(bottom = false) {
    if (!this.feed?.isConnected) return;
    const oldHeight = this.feed.scrollHeight,
      oldTop = this.feed.scrollTop,
      near = oldHeight - oldTop - this.feed.clientHeight < 60;
    this.feed.replaceChildren();
    const older = button(
      "Ранние сообщения",
      () =>
        this.act(async () => {
          if (!this.messages.length) return;
          const generation = this.generation;
          const d = await this.service.request("history", {
            room: this.route.room,
            before: this.messages[0].seq,
          });
          if (this.closed || generation !== this.generation) return;
          this.messages = [...d.messages, ...this.messages].slice(0, 150);
          this.renderFeed();
        }),
      { symbol: RefreshCw },
    );
    this.feed.append(older);
    if (!this.messages.length)
      this.feed.append(empty("Здесь ещё тихо. Начните разговор."));
    this.messages.forEach((m) => this.feed.append(this.messageNode(m)));
    if (bottom || near) this.feed.scrollTop = this.feed.scrollHeight;
    else this.feed.scrollTop = oldTop + (this.feed.scrollHeight - oldHeight);
  }
  messageNode(m, { actions = true } = {}) {
    const p = m.author || {
        nickname: "Удалённый игрок",
        roles: [],
        hero: "witch",
        level: 1,
      },
      role = roleOf(p),
      article = el("article", "chat-message");
    article.dataset.messageId = m.id;
    const content = el("div"),
      by = el("div", "chat-byline"),
      name = button(
        p.nickname,
        () => p.ref && this.go({ view: "profile", ref: p.ref }),
        { cls: `chat-name role-${role}` },
      );
    append(
      by,
      name,
      el("span", "sub", `Ур. ${p.level}`),
      role !== "player" ? roleBadge(role) : null,
      p.playerId
        ? el("span", "sub", `ID ${p.playerId}`)
        : null,
    );
    content.append(by);
    if (m.reply)
      content.append(
        el("div", "chat-reply", `${m.reply.nickname}: ${m.reply.body}`),
      );
    append(
      content,
      el(
        "p",
        m.deleted ? "chat-deleted" : `chat-body role-${role}`,
        m.deleted ? "Сообщение удалено" : m.body,
      ),
      el(
        "div",
        "chat-time",
        `${time(m.createdAt)}${m.editedAt ? " · изменено" : ""}`,
      ),
    );
    append(
      article,
      avatar(p),
      content,
      actions
        ? iconButton("Действия с сообщением", MoreHorizontal, () =>
            this.go({ view: "message", message: m, room: this.route.room }),
          )
        : null,
    );
    return article;
  }
  renderDMList(s) {
    const rooms = this.service.data.rooms.filter((r) => r.kind === "dm");
    if (!rooms.length)
      s.append(
        empty(
          "Откройте профиль собеседника в общем чате и нажмите «Написать».",
        ),
      );
    rooms.forEach((r) =>
      s.append(
        append(
          el("div", "chat-card"),
          button(r.title, () => this.go({ view: "room", room: r.id }), {
            symbol: MessageCircle,
          }),
          el("span", "sub", r.unread ? ` · непрочитано ${r.unread}` : ""),
        ),
      ),
    );
    s.append(
      button(
        "Список игнора",
        () =>
          this.go({
            view: "form",
            title: "Список игнора",
            custom: async (c) => {
              const people = await this.service.request("ignored");
              if (!people.length) c.append(empty("Список пуст."));
              people.forEach((p) =>
                c.append(
                  append(
                    el("div", "chat-card"),
                    el("p", "", p.nickname),
                    button("Убрать из игнора", () =>
                      this.act(
                        () =>
                          this.service.request("ignore", {
                            ref: p.ref,
                            ignored: false,
                          }),
                        { after: () => this.load() },
                      ),
                    ),
                  ),
                ),
              );
            },
          }),
        { symbol: Ban },
      ),
    );
  }
  renderMessageActions(m) {
    this.shell("Сообщение", "Выберите действие");
    const s = this.scroll();
    s.append(this.messageNode(m, { actions: false }));
    const a = el("div", "chat-actions");
    const room = this.room(),
      canModerate = isModerator(this.me) && room?.kind !== "dm",
      manageable = m.own || canManage(this.me, m.author);
    if (!m.deleted)
      append(
        a,
        button(
          "Ответить",
          () => {
            const route = this.stack.pop() || {
              view: "room",
              room: this.route.room,
            };
            route.reply = m;
            this.replace(route);
          },
          { symbol: Reply },
        ),
        button(
          "Пожаловаться",
          () =>
            this.textAction("Жалоба", "Причина жалобы", (why) =>
              this.service.request("report", { message: m.id, reason: why }),
            ),
          { symbol: Flag },
        ),
      );
    if (isModerator(this.me) && m.own && !m.deleted && Date.now() - Date.parse(m.createdAt) < 180000)
      a.append(
        button(
          "Изменить",
          () =>
            this.textAction(
              "Изменить сообщение",
              "Новый текст",
              (body) =>
                this.service.request("edit", {
                  message: m.id,
                  revision: m.revision,
                  body,
                }),
              { value: m.body, max: 500 },
            ),
          { symbol: Pencil },
        ),
      );
    if (
      !m.deleted &&
      (canModerate && manageable)
    )
      a.append(
        button(
          "Удалить",
          () =>
            this.textAction("Удалить сообщение", "Причина удаления", (why) =>
              this.service.request("delete", {
                message: m.id,
                revision: m.revision,
                reason: why,
              }),
            ),
          { symbol: Trash2, cls: "chat-button danger" },
        ),
      );
    if (m.deleted && m.restorable && isModerator(this.me))
      a.append(
        button(
          "Восстановить",
          () =>
            this.confirm("Восстановить сообщение?", m.author.nickname, () =>
              this.service.request("restore", {
                message: m.id,
                revision: m.revision,
              }),
            ),
          { symbol: RefreshCw },
        ),
      );
    if (!m.deleted && isAdmin(this.me) && room?.kind !== "dm")
      a.append(
        button(
          "Закрепить / открепить",
          () =>
            this.confirm("Изменить закрепление?", m.body, () =>
              this.service.request("pin", {
                message: m.id,
                revision: m.revision,
              }),
            ),
          { symbol: Pin },
        ),
      );
    append(s, a, this.error);
  }
  textAction(title, label, run, { value = "", max = 300, after } = {}) {
    this.go({ view: "form", title, label, value, max, run, after });
  }
  confirm(title, description, run, after) {
    this.go({ view: "confirm", title, description, run, after });
  }
  renderForm(r) {
    this.shell(r.title);
    const s = this.scroll();
    if (r.custom) {
      r.custom(s);
      return;
    }
    const key = `form:${r.title}:${this.route.ref || ""}`,
      ta = el("textarea");
    ta.value = this.service.draft(key) || r.value || "";
    ta.setAttribute("aria-label", r.label);
    ta.oninput = () => this.service.draft(key, ta.value);
    append(
      s,
      field(r.label, ta),
      el("p", "sub", `До ${r.max || 300} символов`),
      this.error,
      button(
        "Продолжить",
        () => {
          if (!ta.value.trim() || textLength(ta.value) > (r.max || 300)) {
            this.error.textContent = "Проверьте длину текста.";
            return;
          }
          this.confirm(
            r.title,
            ta.value,
            () => r.run(ta.value),
            () => {
              this.service.draft(key, "");
              if (r.after) r.after();
              else this.returnToRoom();
            },
          );
        },
        { cls: "chat-button primary", symbol: Check },
      ),
    );
  }
  renderConfirm(r) {
    this.shell(r.title, "Проверьте перед подтверждением");
    const s = this.scroll();
    append(
      s,
      el("div", "chat-card chat-body", r.description),
      this.error,
      append(
        el("div", "chat-actions"),
        button("Назад", () => this.back()),
        button(
          "Подтвердить",
          () =>
            this.act(r.run, {
              after: async (result) => {
                if (r.after) await r.after(result);
                else this.returnToRoom();
              },
            }),
          { cls: "chat-button primary", symbol: Check },
        ),
      ),
    );
  }
  returnToRoom() {
    const room = [...this.stack].reverse().find((r) => r.view === "room");
    this.stack = [];
    this.route = room || { view: "room" };
    this.load();
  }
  renderProfile(p) {
    this.shell(p.self ? "Мой профиль" : "Профиль игрока");
    const s = this.scroll();
    const card = el("div", "chat-card");
    append(
      card,
      append(
        el("div", "chat-row"),
        avatar(p),
        el("h2", `role-${roleOf(p)}`, p.nickname),
      ),
      el("p", "sub", `Уровень ${p.level}`),
    );
    p.roles.forEach((r) => card.append(roleBadge(r)));
    if (p.playerId) card.append(el("p", "", `ID игрока: ${p.playerId}`));
    s.append(card);
    const a = el("div", "chat-actions");
    if (!p.self && !this.restricted)
      append(
        a,
        button(
          "Написать",
          () =>
            this.act(() => this.service.request("dm_open", { ref: p.ref }), {
              after: (r) =>
                this.service
                  .refresh()
                  .then(() => this.go({ view: "room", room: r.room })),
            }),
          { symbol: MessageCircle },
        ),
        button(
          p.ignored ? "Убрать из игнора" : "Игнорировать",
          () =>
            this.act(
              () =>
                this.service.request("ignore", {
                  ref: p.ref,
                  ignored: !p.ignored,
                }),
              { after: () => this.load() },
            ),
          { symbol: Ban, disabled: p.roles.length > 0 },
        ),
      );
    if (!p.self && isModerator(this.me) && canManage(this.me, p))
      a.append(
        button(
          "Ограничения",
          () =>
            this.go({
              view: "form",
              title: "Модерация",
              custom: (container) => this.renderSanctions(container, p),
            }),
          { symbol: Shield },
        ),
      );
    if (p.self)
      append(
        a,
        button(
          "Мои обращения",
          () => this.go({ view: "tickets", filter: "mine" }),
          { symbol: Headphones },
        ),
        this.onLogout
          ? button(
              "Выйти из аккаунта",
              () =>
                this.confirm("Выйти из аккаунта?", p.nickname, async () => {
                  await this.service.session.logout();
                  this.close();
                  this.onLogout();
                }),
              { cls: "chat-button danger" },
            )
          : null,
      );
    if (policyReady(this.me) && isDeveloper(this.me) && canManage(this.me, p)) a.append(button("Управление игроком", () => this.go({ view: "player", playerId: p.playerId }), { symbol: UserRound }));
    if (isAdmin(this.me))
      a.append(
        button("Роли по ID", () => this.go({ view: "roles" }), {
          symbol: Crown,
        }),
      );
    append(s, a, this.error);
  }
  renderSanctions(s, p) {
    s.append(el("h2", "", p.nickname));
    if (p.playerId) s.append(el("p", "sub", `ID ${p.playerId}`));
    const kinds = {
        warn: "Предупреждение",
        mute: "Запрет писать в чат",
        ...(isSupport(this.me) ? { game: "Блокировка игры" } : {}),
      },
      kind = select(kinds, "mute");
    const durations = {
        10: "10 минут",
        60: "1 час",
        1440: "24 часа",
        ...(policyReady(this.me) || isAdmin(this.me) ? {10080: "7 дней", 43200: "30 дней"} : {}),
        ...(isSupport(this.me) ? { 0: "Бессрочно" } : {}),
      },
      duration = select(durations, "60"),
      why = el("textarea");
    why.setAttribute("aria-label", "Причина ограничения");
    append(
      s,
      field("Мера", kind),
      field("Срок", duration),
      field("Причина, видимая игроку", why),
      this.error,
      button(
        "Проверить ограничение",
        () => {
          if (!why.value.trim()) {
            this.error.textContent = "Укажите причину.";
            return;
          }
          this.confirm(
            "Применить ограничение?",
            `${p.nickname}\n${kinds[kind.value]} · ${durations[duration.value]}\n${why.value}`,
            () =>
              this.service.request("sanction", {
                ref: p.ref,
                kind: kind.value,
                minutes: Number(duration.value),
                reason: why.value,
              }),
            () => {
              this.stack.pop();
              this.back();
            },
          );
        },
        { symbol: Shield, cls: "chat-button danger" },
      ),
    );
    for (const ban of p.sanctions || [])
      append(
        s,
        append(
          el("div", "chat-card"),
          el("p", "", `${kinds[ban.kind] || ban.kind}: ${ban.reason}`),
          el("p", "sub", ban.until ? `До ${time(ban.until)}` : "Бессрочно"),
          ban.canRevoke ? button("Снять ограничение", () =>
            this.textAction("Снять ограничение", "Причина", (reason) =>
              this.service.request("revoke_sanction", {
                ref: p.ref,
                sanction: ban.id,
                reason,
              }),
            ),
          ) : null,
        ),
      );
  }
  renderRoles() {
    if (!isAdmin(this.me)) { this.shell("Нет доступа"); return; }
    this.shell("Роли по ID", "У каждого игрока одна роль");
    const s = this.scroll(), id = input("Например, 1024"), card = el("div");
    id.inputMode = "numeric"; id.setAttribute("aria-label", "ID игрока");
    let found = null;
    id.oninput = () => { found = null; card.replaceChildren(); };
    const find = () => this.act(async () => {
      if (!/^[1-9]\d{0,18}$/.test(id.value)) throw Error("Введите числовой ID игрока.");
      const requested = id.value, p = await this.service.request("roles_lookup", { playerId: requested });
      if (id.value !== requested || !card.isConnected) return;
      found = p; card.replaceChildren();
      append(card, el("h2", `role-${roleOf(p)}`, p.nickname), el("p", "sub", `ID ${p.playerId} · уровень ${p.level}`), el("p", "", `Сейчас: ${ROLES[roleOf(p)][0]}`));
      if (!canManage(this.me, p) || (!policyReady(this.me) && isAdmin(p))) { card.append(empty("Этот аккаунт защищён от изменения вашей ролью.")); return; }
      const values = Object.fromEntries(["player", "moderator", "support", "developer", ...(policyReady(this.me) && isOwner(this.me) ? ["admin"] : [])].map((r) => [r, ROLES[r][0]]));
      const chosen = select(values, roleOf(p)), why = el("textarea");
      chosen.setAttribute("aria-label", "Роль игрока"); why.setAttribute("aria-label", "Причина изменения ролей");
      append(card, field("Новая роль", chosen), field("Причина изменения", why), button("Проверить назначение", () => {
        if (!found || found.playerId !== id.value || !why.value.trim()) { this.error.textContent = "Найдите игрока и укажите причину."; return; }
        const roles = chosen.value === "player" ? [] : [chosen.value];
        this.confirm("Изменить роль?", `${p.nickname} · ID ${p.playerId}\nБыло: ${ROLES[roleOf(p)][0]}\nСтанет: ${values[chosen.value]}\nПричина: ${why.value}`,
          () => this.service.request("roles_set", { playerId: p.playerId, revision: p.revision, roles, reason: why.value }),
          () => { this.stack.pop(); this.replace({ view: "roles" }); });
      }, { cls: "chat-button primary", symbol: Check }));
    });
    append(s, field("ID игрока", id), button("Найти игрока", find, { symbol: UserRound }), this.error, card);
    id.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); find(); } };
  }
  renderPlayer() {
    if (!policyReady(this.me) || !isDeveloper(this.me)) { this.shell("Нет доступа"); return; }
    this.shell("Управление игроком", "Ресурсы и никнейм · по числовому ID");
    const s = this.scroll(), id = input("ID игрока", this.route.playerId || ""), card = el("div");
    id.inputMode = "numeric"; id.setAttribute("aria-label", "ID игрока");
    id.oninput = () => card.replaceChildren();
    const find = () => this.act(async () => {
      if (!/^[1-9]\d{0,18}$/.test(id.value)) throw Error("Введите числовой ID игрока.");
      const requested = id.value, p = await this.service.request("player_lookup", { playerId: requested });
      if (id.value !== requested || !card.isConnected) return;
      card.replaceChildren();
      append(card, el("h2", `role-${roleOf(p)}`, p.nickname), el("p", "sub", `ID ${p.playerId} · уровень ${p.level} · ${ROLES[roleOf(p)][0]}`));
      if (!canManage(this.me, p)) { card.append(empty("Аккаунт защищён от изменения вашей ролью.")); return; }
      const item = select(p.catalog), direction = select({ give: "Выдать", take: "Забрать" }), amount = input("Количество", "1", "number"), why = el("textarea"), current = el("p", "sub");
      amount.min = "1"; amount.max = "999999999"; amount.step = "1";
      item.setAttribute("aria-label", "Ресурс"); direction.setAttribute("aria-label", "Действие с ресурсом"); amount.setAttribute("aria-label", "Количество ресурса"); why.setAttribute("aria-label", "Причина изменения игрока");
      const updateCurrent = () => current.textContent = `У игрока: ${p.inventory[item.value] || 0}`;
      item.onchange = updateCurrent; updateCurrent();
      const done = () => { this.stack.pop(); this.replace({ view: "player", playerId: p.playerId }); };
      append(card, field("Предмет или ресурс", item), current, field("Действие", direction), field("Количество", amount), field("Причина для журнала", why), button("Проверить ресурсы", () => {
        const delta = Number(amount.value) * (direction.value === "take" ? -1 : 1), before = p.inventory[item.value] || 0;
        if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 999999999 || before + delta < 0 || before + delta > 1000000000 || !why.value.trim()) { this.error.textContent = "Проверьте количество и укажите причину."; return; }
        this.confirm("Изменить ресурсы?", `${p.nickname} · ID ${p.playerId}\n${p.catalog[item.value]}: ${before} → ${before + delta}\nПричина: ${why.value}`,
          () => this.service.request("resources", { playerId: p.playerId, revision: p.inventoryRevision, item: item.value, delta, reason: why.value }), done);
      }, { symbol: Check, cls: "chat-button primary" }));
      if (p.registered) {
        const nickname = input("Новый никнейм", p.nickname); nickname.setAttribute("aria-label", "Новый никнейм");
        append(card, field("Новый никнейм", nickname), el("p", "sub", "После переименования вход в игре только по новому нику. Пароль сохраняется."), button("Проверить никнейм", () => {
          if (!nickname.value.trim() || !why.value.trim()) { this.error.textContent = "Введите никнейм и причину."; return; }
          this.confirm("Изменить никнейм?", `ID ${p.playerId}\n${p.nickname} → ${nickname.value.trim()}\nПричина: ${why.value}`,
            () => this.service.request("rename", { playerId: p.playerId, revision: p.staffRevision, nickname: nickname.value.trim(), reason: why.value }), done);
        }, { symbol: Pencil }));
      }
    });
    append(s, field("ID игрока", id), button("Найти игрока", find, { symbol: UserRound }), this.error, card);
    if (id.value) setTimeout(() => { if (card.isConnected) find(); }, 0);
  }
  renderTemplates(templates) {
    this.shell("Шаблоны ответов", "Общие для сотрудников поддержки");
    const s = this.scroll();
    s.append(button("Добавить шаблон", () => this.go({ view: "form", title: "Новый шаблон", custom: (c) => this.renderTemplateForm(c) }), { symbol: Plus }));
    templates.forEach((t) => {
      const card = append(el("div", "chat-card"), el("h3", "", t.title), el("p", "chat-body", t.body));
      append(card, button("Изменить", () => this.go({ view: "form", title: "Изменить шаблон", custom: (c) => this.renderTemplateForm(c, t) }), { symbol: Pencil }),
        button("Убрать шаблон", () => this.confirm("Убрать шаблон?", t.title, () => this.service.request("template_archive", { template: t.id, revision: t.revision }), () => this.back()), { symbol: Trash2 }));
      s.append(card);
    });
    s.append(this.error);
  }
  renderTemplateForm(s, t = {}) {
    const title = input("Название", t.title || ""), body = el("textarea"); body.value = t.body || "";
    title.maxLength = 80; body.maxLength = 2000;
    title.setAttribute("aria-label", "Название шаблона"); body.setAttribute("aria-label", "Текст шаблона");
    append(s, field("Название", title), field("Ответ игроку", body), this.error, button("Сохранить шаблон", () => this.act(async () => {
      if (!title.value.trim() || !body.value.trim()) throw Error("Заполните название и текст.");
      await this.service.request("template_save", { ...(t.id ? { template: t.id, revision: t.revision } : {}), title: title.value, body: body.value });
    }, { after: () => this.back() }), { symbol: Check, cls: "chat-button primary" }));
  }
  renderTickets(tickets) {
    this.shell(
      "Поддержка",
      isSupport(this.me) ? "Очередь обращений" : "Ваши обращения",
    );
    const toolbar = el("div", "chat-toolbar"),
      filter = select(
        {
          all: "Все",
          new: "Новые",
          ...(policyReady(this.me) && isAdmin(this.me) ? { escalated: "Переданы администрации" } : {}),
          mine: "Мои",
          work: "В работе",
          waiting: "Ждём игрока",
          solved: "Решённые",
          closed: "Закрытые",
        },
        this.route.filter || "all",
      );
    filter.setAttribute("aria-label", "Фильтр обращений");
    filter.onchange = () =>
      this.replace({ view: "tickets", filter: filter.value });
    append(
      toolbar,
      filter,
      button("Новое обращение", () => this.go({ view: "ticket_new" }), {
        symbol: Plus,
      }),
    );
    if (policyReady(this.me) && isSupport(this.me)) toolbar.append(button("Шаблоны", () => this.go({ view: "templates" }), { symbol: NotebookPen }));
    this.view.append(toolbar);
    const s = this.scroll();
    if (!tickets.length) s.append(empty("Здесь пока нет обращений."));
    tickets.forEach((t) => {
      const c = el("div", "chat-card");
      append(
        c,
        append(
          el("div", "chat-row spread"),
          el("h3", "", t.subject),
          el("span", "chat-state", STATUSES[t.status]),
        ),
        el(
          "p",
          "sub",
          `${CATEGORIES[t.category]} · ${t.author.nickname}${t.author.playerId ? ` · ID ${t.author.playerId}` : ""} · ${time(t.updatedAt)}`,
        ),
        el(
          "p",
          "sub",
          t.assignee ? `В работе у ${t.assignee.nickname}` : (t.escalated ? "Ожидает администратора" : "Свободно"),
        ),
      );
      const own = t.author.ref === this.me.ref,
        mine = t.assignee?.ref === this.me.ref,
        a = el("div", "chat-actions");
      if (own || mine)
        a.append(
          button("Открыть", () => this.go({ view: "ticket", ticket: t.id }), {
            symbol: MessageCircle,
          }),
        );
      else if (!t.assignee && t.status !== "closed" && isSupport(this.me) && (!t.escalated || isAdmin(this.me)))
        a.append(
          button(
            "Взять в работу",
            () =>
              this.act(
                () =>
                  this.service.request("ticket_take", {
                    ticket: t.id,
                    revision: t.revision,
                  }),
                { after: () => this.go({ view: "ticket", ticket: t.id }) },
              ),
            { symbol: Headphones },
          ),
        );
      if (isAdmin(this.me) && !own)
        a.append(
          button(
            "Назначить",
            () =>
              this.go({
                view: "form",
                title: "Назначить обращение",
                custom: (container) => this.renderAssignment(container, t),
              }),
            { symbol: UserRound },
          ),
        );
      append(c, a);
      s.append(c);
    });
    s.append(this.error);
  }
  async renderAssignment(s, t) {
    try {
      const roster = await this.service.request("roster");
      const values = Object.fromEntries(
        roster
          .filter((p) => isSupport(p) && p.ref !== t.author.ref)
          .map((p) => [p.ref, p.nickname]),
      );
      if (!Object.keys(values).length) {
        s.append(empty("Нет доступных сотрудников поддержки."));
        return;
      }
      const who = select(values);
      append(
        s,
        el("h2", "", t.subject),
        field("Сотрудник", who),
        this.error,
        button(
          "Назначить",
          () =>
            this.act(
              () =>
                this.service.request("ticket_assign", {
                  ticket: t.id,
                  revision: t.revision,
                  ref: who.value,
                }),
              {
                after: () => {
                  this.back();
                },
              },
            ),
          { cls: "chat-button primary" },
        ),
      );
    } catch (e) {
      s.append(empty(e.message));
    }
  }
  renderNewTicket() {
    this.shell("Новое обращение", "Поддержка поможет разобраться");
    const s = this.scroll(),
      category = select(CATEGORIES, this.restricted ? "appeal" : "question"),
      subject = input(
        "Кратко опишите вопрос",
        this.service.draft("ticket:subject"),
      ),
      body = el("textarea");
    body.value = this.service.draft("ticket:body");
    body.placeholder = "Что произошло? Какие шаги это повторяют?";
    body.setAttribute("aria-label", "Описание обращения");
    subject.oninput = () => this.service.draft("ticket:subject", subject.value);
    body.oninput = () => this.service.draft("ticket:body", body.value);
    append(
      s,
      field("Категория", category),
      field("Тема · до 100 символов", subject),
      field("Описание · до 2000 символов", body),
      el(
        "p",
        "sub",
        "Не отправляйте пароль. Версия игры: 0.10.0. История сохраняется в вашем обращении.",
      ),
      this.error,
      button(
        "Отправить обращение",
        () =>
          this.act(
            async () => {
              if (
                textLength(subject.value) > 100 ||
                textLength(body.value) > 2000
              )
                throw Error("Проверьте длину темы и описания.");
              return this.service.request("ticket_create", {
                category: category.value,
                subject: subject.value,
                body: body.value,
              });
            },
            {
              after: (r) => {
                this.service.draft("ticket:subject", "");
                this.service.draft("ticket:body", "");
                this.replace({ view: "ticket", ticket: r.ticket });
              },
            },
          ),
        { cls: "chat-button primary", symbol: Send },
      ),
    );
  }
  renderTicket(t) {
    if (this.ticketReads.get(t.id) !== t.revision) {
      this.service
        .request("ticket_read", { ticket: t.id, revision: t.revision })
        .then(() => this.ticketReads.set(t.id, t.revision))
        .catch(() => {});
    }
    this.ticket = t;
    this.shell(t.subject, `${CATEGORIES[t.category]} · ${STATUSES[t.status]}`);
    const s = this.scroll();
    const info = append(
      el("div", "chat-card"),
      el(
        "p",
        "",
        `${t.author.nickname} · ${t.assignee ? `Сотрудник: ${t.assignee.nickname}` : "Ожидает сотрудника"}`,
      ),
    );
    s.append(info);
    t.replies.forEach((r) => s.append(this.messageNode(r, { actions: false })));
    if (!t.own) {
      (t.notes || []).forEach((n) =>
        s.append(
          append(
            el("div", "chat-card chat-note"),
            el("strong", "", `Внутренняя заметка · ${n.author.nickname}`),
            el("p", "chat-body", n.body),
          ),
        ),
      );
      (t.tasks || []).forEach((task) =>
        s.append(
          append(
            el("div", "chat-card chat-note"),
            el("strong", "", `Разработчик: ${task.developer?.nickname || "—"}`),
            el("p", "chat-body", task.description),
            el("p", "chat-body", task.answer || "Ответ ожидается"),
          ),
        ),
      );
    }
    const a = el("div", "chat-actions");
    const mutate = (op, body, extra = {}) =>
      this.service.request(op, {
        ticket: t.id,
        revision: t.revision,
        ...(body ? { body } : {}),
        ...extra,
      });
    if (t.own && t.status === "solved")
      append(
        a,
        button(
          "Всё решено",
          () =>
            this.act(() => mutate("ticket_close"), {
              after: () => this.load(),
            }),
          { symbol: Check },
        ),
        button(
          "Проблема осталась",
          () =>
            this.act(() => mutate("ticket_reopen"), {
              after: () => this.load(),
            }),
          { symbol: RefreshCw },
        ),
      );
    if (
      t.own &&
      t.status === "closed" &&
      Date.now() - Date.parse(t.closedAt) < 7 * 86400000
    )
      a.append(
        button(
          "Вернуть в работу",
          () =>
            this.act(() => mutate("ticket_reopen"), {
              after: () => this.load(),
            }),
          { symbol: RefreshCw },
        ),
      );
    if (a.children.length) s.append(a);
    if (t.status === "closed") {
      s.append(
        el("p", "sub", "Обращение закрыто. История остаётся доступной."),
      );
      return;
    }
    const compose = el("div", "chat-compose");
    const mode = t.own ? "public" : this.ticketMode,
      ta = el("textarea"),
      key = `ticket:${t.id}:${mode}`;
    ta.value = this.service.draft(key);
    ta.placeholder =
      mode === "note" ? "Видно только сотруднику поддержки" : "Ответ игроку";
    ta.setAttribute(
      "aria-label",
      mode === "note" ? "Внутренняя заметка" : "Ответ в поддержку",
    );
    ta.oninput = () => this.service.draft(key, ta.value);
    if (!t.own) {
      const tabs = el("div", "chat-row");
      ["public", "note"].forEach((m) =>
        tabs.append(
          button(
            m === "public" ? "Ответ игроку" : "Внутренняя заметка",
            () => {
              this.ticketMode = m;
              this.renderTicket(t);
            },
            {
              symbol: m === "public" ? MessageCircle : NotebookPen,
              cls: `chat-button${mode === m ? " primary" : ""}`,
            },
          ),
        ),
      );
      compose.append(tabs);
      if (mode === "public") {
        const choices = el("div", "chat-row"); compose.append(choices);
        (policyReady(this.me) ? this.service.request("templates") : Promise.resolve([
          {id:"steps",title:"Шаги воспроизведения",body:"Опишите, пожалуйста, шаги, после которых появляется проблема. Что ожидали увидеть и что произошло?"},
          {id:"device",title:"Устройство",body:"Подскажите, пожалуйста, модель устройства, браузер и версию игры."}
        ])).then((templates) => {
          if (!choices.isConnected) return;
          const pick = select({ "": "Выбрать шаблон", ...Object.fromEntries(templates.map((t) => [t.id, t.title])) });
          pick.setAttribute("aria-label", "Шаблон ответа");
          pick.onchange = () => { const t = templates.find((t) => t.id === pick.value); if (t) { ta.value = t.body; ta.oninput(); } };
          append(choices, pick, policyReady(this.me) ? button("Шаблоны", () => this.go({ view: "templates" }), { symbol: NotebookPen }) : null);
        }).catch((e) => { if (choices.isConnected) choices.append(el("p", "sub", e.message)); });
      }
    }
    const send = (op) =>
      this.act(
        async () => {
          const original = ta.value;
          if (!original.trim() || textLength(original) > 2000)
            throw Error("Введите текст до 2000 символов.");
          await mutate(op, original);
          if (this.service.draft(key) === original) this.service.draft(key, "");
        },
        { after: () => this.load() },
      );
    append(
      compose,
      field(
        mode === "note" ? "Заметка · игрок её не увидит" : "Публичный ответ",
        ta,
      ),
      this.error,
      button(
        mode === "note" ? "Сохранить заметку" : "Отправить ответ",
        () => send(mode === "note" ? "ticket_note" : "ticket_reply"),
        { symbol: Send, cls: "chat-button primary" },
      ),
    );
    if (!t.own && mode === "public")
      compose.append(
        button("Ответить и решить", () => send("ticket_solve"), {
          symbol: Check,
        }),
      );
    if (!t.own)
      compose.append(
        button(
          "Передать разработчику",
          () =>
            this.go({
              view: "form",
              title: "Техническая задача",
              custom: (container) => this.renderTransfer(container, t),
            }),
          { symbol: CodeXml },
        ),
      );
    if (policyReady(this.me) && !t.own && !isAdmin(this.me)) compose.append(button("Передать администратору", () =>
      this.textAction("Передать администратору", "Причина передачи · внутренняя заметка", (body) => this.service.request("ticket_escalate", { ticket: t.id, revision: t.revision, body }),
        { max: 2000, after: () => { this.stack = this.stack.filter((r) => r.view === "room"); this.replace({ view: "tickets" }); } }), { symbol: Crown }));
    if (mode === "note") compose.classList.add("chat-note");
    this.view.append(compose);
    s.scrollTop = s.scrollHeight;
  }
  async renderTransfer(s, t) {
    try {
      const roster = await this.service.request("roster"),
        values = Object.fromEntries(
          roster
            .filter((p) => isDeveloper(p))
            .map((p) => [p.ref, p.nickname]),
        );
      if (!Object.keys(values).length) {
        s.append(empty("Разработчик ещё не назначен."));
        return;
      }
      const who = select(values),
        body = el("textarea");
      body.setAttribute("aria-label", "Техническое описание");
      append(
        s,
        el(
          "p",
          "sub",
          "Проверьте текст перед отправкой. Разработчик получит только это описание. Не включайте личную переписку и данные игрока.",
        ),
        field("Разработчик", who),
        field("Шаги, результат и версия игры", body),
        this.error,
        button(
          "Проверить задачу",
          () =>
            this.confirm(
              "Передать разработчику?",
              body.value,
              () =>
                this.service.request("ticket_transfer", {
                  ticket: t.id,
                  revision: t.revision,
                  ref: who.value,
                  body: body.value,
                }),
              () => {
                this.stack.pop();
                this.back();
              },
            ),
          { symbol: CodeXml, cls: "chat-button primary" },
        ),
      );
    } catch (e) {
      s.append(empty(e.message));
    }
  }
  renderTasks(tasks) {
    this.shell("Технические задачи", "Проверенное описание от поддержки");
    const s = this.scroll();
    if (!tasks.length) s.append(empty("Назначенных задач нет."));
    tasks.forEach((t) => {
      const body = el("textarea");
      body.value = this.service.draft("task:" + t.id) || t.answer || "";
      body.setAttribute("aria-label", "Ответ разработчика");
      body.oninput = () => this.service.draft("task:" + t.id, body.value);
      append(
        s,
        append(
          el("div", "chat-card"),
          el("p", "chat-body", t.description),
          field("Ответ поддержке", body),
          button(
            "Передать ответ",
            () =>
              this.act(
                () =>
                  this.service.request("task_answer", {
                    task: t.id,
                    revision: t.revision,
                    body: body.value,
                  }),
                { after: () => this.load() },
              ),
            { symbol: Send },
          ),
        ),
      );
    });
    s.append(this.error);
  }
  renderReports(reports) {
    this.shell("Жалобы", "Ограниченный контекст сообщения");
    const s = this.scroll();
    if (!reports.length) s.append(empty("Открытых жалоб нет."));
    reports.forEach((r) => {
      const c = el("div", "chat-card");
      c.append(el("h3", "", r.reason));
      r.evidence.forEach((m) =>
        append(
          c,
          button(m.nickname, () => this.go({ view: "profile", ref: m.ref }), {
            cls: "chat-name",
          }),
          el("p", "chat-body", m.body),
        ),
      );
      c.append(
        button("Закрыть жалобу", () =>
          this.go({
            view: "form",
            title: "Решение по жалобе",
            label: "Причина решения",
            run: (why) =>
              this.service.request("report_close", {
                report: r.id,
                reason: why,
              }),
            max: 300,
          }),
        ),
      );
      s.append(c);
    });
    s.append(this.error);
  }
  renderAudit(entries) {
    this.shell("Журнал действий", "Серверная история модерации");
    const s = this.scroll();
    if (!entries.length) s.append(empty("Действий пока нет."));
    entries.forEach((e) =>
      s.append(
        append(
          el("div", "chat-card"),
          el(
            "p",
            "",
            `${e.actor?.nickname || "Система"} → ${e.target?.nickname || "—"}`,
          ),
          el("p", "sub", `${e.action} · ${time(e.createdAt)}`),
          e.reason ? el("p", "chat-body", e.reason) : null,
          e.detail?.before !== undefined ? el("p", "sub", `${e.detail.item ? e.detail.item + ": " : ""}${Array.isArray(e.detail.before) ? e.detail.before.join(", ") || "Игрок" : e.detail.before} → ${Array.isArray(e.detail.after) ? e.detail.after.join(", ") || "Игрок" : e.detail.after}`) : null,
        ),
      ),
    );
  }
  renderRestricted() {
    this.shell("Доступ к игре ограничен", "Обращение в поддержку доступно");
    const s = this.scroll();
    append(
      s,
      empty("Вы можете прочитать причину ограничения и отправить обжалование."),
      button("Открыть поддержку", () => this.go({ view: "tickets" }), {
        symbol: Headphones,
        cls: "chat-button primary",
      }),
      button(
        "Мой профиль",
        () => this.go({ view: "profile", ref: this.me.ref }),
        { symbol: UserRound },
      ),
    );
  }
}

export const showChat = (service, options) => new ChatWindow(service, options);
