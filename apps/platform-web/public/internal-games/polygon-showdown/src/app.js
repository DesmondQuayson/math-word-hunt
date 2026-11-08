// Polygon Showdown for a signed-in session: the hub, Solo, the shop and avatar,
// and Create Showdown. Each screen is reachable by its own address (#solo,
// #continue, #create, #showdown, #shop, #avatar), so it can be linked to and
// survives a refresh.

import { fill, h } from "../../math-bingo-live/src/dom.js";
import { EMOJI_CHOICES, isAllowedEmoji } from "../../math-bingo-live/src/engine/emoji.js";
import { NAME_MAX } from "../../math-bingo-live/src/engine/settings.js";
import { accountRequest, GameError, playRequest } from "./api.js";
import { attachAudioLifecycle, GameAudio, readPreferences } from "./audio.js";
import { avatarDescription, mountAvatar } from "./avatar-preview.js";
import { DEFAULT_AVATAR, normalizeAvatar } from "./engine/catalog.js";
import { CURRENCY_NAME } from "./engine/economy.js";
import { ShopScreen } from "./shop.js";
import { readSeat, saveSeat, ShowdownScreen } from "./showdown.js";
import { SoloScreen } from "./solo.js";
import { brand, coinAmount, confirmDialog, errorNote, musicCredit, numberText, setScreen, soundControls } from "./ui.js";

const app = document.getElementById("app");
const preferences = readPreferences();
const audio = new GameAudio(preferences, () => preferences.music);
attachAudioLifecycle(audio);
window.__POLYGON_SHOWDOWN__ = { audio };

const DURATIONS = Object.freeze([5, 7, 10, 15, 20, 30]);

let session = null;
let current = null;
let hubAvatar = null;

function teardown() {
  hubAvatar?.dispose();
  hubAvatar = null;
  current?.cleanup?.();
  current?.dispose?.();
  current?.stop?.();
  current = null;
}

function goHome() {
  if (location.hash && location.hash !== "#home") history.replaceState(null, "", "#home");
  route();
}

async function refreshSession() {
  const data = await accountRequest("bootstrap");
  const savedAvatar = data.guest ? null : data.profile?.avatar ?? null;
  const parsed = savedAvatar ? normalizeAvatar(savedAvatar) : { ok: false };
  session = {
    guest: data.guest,
    kind: data.kind ?? "consumer",
    wallet: data.wallet ?? null,
    profile: data.profile ?? null,
    inventory: data.inventory ?? [],
    activeRun: data.activeRun ?? null,
    avatar: parsed.ok ? parsed.avatar : { ...DEFAULT_AVATAR },
    savedAvatar: parsed.ok ? parsed.avatar : null
  };
  window.__POLYGON_SHOWDOWN__.session = session;
}

function hasProgress() {
  if (!session || session.guest) return false;
  return Boolean(session.activeRun) || (session.wallet?.lifetimeEarned ?? 0) > 0 || (session.inventory?.length ?? 0) > 0 || Boolean(session.savedAvatar);
}

function renderHub() {
  setScreen("hub");
  const returning = hasProgress();
  const name = session.profile?.displayName;
  const heading = returning
    ? h("h1", { class: "hub-title", id: "hub-title", text: name ? `WELCOME BACK, ${name.toUpperCase()}` : "WELCOME BACK" })
    : h("h1", { class: "hub-title", id: "hub-title", text: "MATCH. BREAK. EARN." });
  const button = (id, text, hash, kind = "ghost") => h("button", { type: "button", class: `button ${kind}`, id, text, onclick: () => navigate(hash) });
  const actions = session.guest
    ? [button("play-solo", "PLAY SOLO", "#solo", "primary"), button("create-showdown", "CREATE SHOWDOWN", "#create")]
    : returning
      ? [
          session.activeRun ? button("continue-solo", "CONTINUE SOLO", "#continue", "primary") : button("play-solo", "PLAY SOLO", "#solo", "primary"),
          session.activeRun ? h("button", { type: "button", class: "button ghost", id: "new-run", text: "NEW RUN", onclick: () => confirmNewRun() }) : null,
          button("open-shop", "SHOP", "#shop"),
          button("create-showdown", "CREATE SHOWDOWN", "#create")
        ]
      : [button("play-solo", "PLAY SOLO", "#solo", "primary"), button("create-showdown", "CREATE SHOWDOWN", "#create")];
  const stats = session.guest ? null : h("dl", { class: "hub-stats" },
    h("div", null, h("dt", { text: CURRENCY_NAME }), h("dd", { id: "hub-coins" }, coinAmount(session.wallet.balance, "big"))),
    h("div", null, h("dt", { text: "Best Combo" }), h("dd", { id: "hub-combo", text: `×${session.profile.bestCombo}` })),
    h("div", null, h("dt", { text: "Best Score" }), h("dd", { id: "hub-score", text: numberText(session.profile.bestScore) })));
  const avatarHost = h("div", { class: "hub-avatar", id: "hub-avatar" });
  const live = readSeat();
  fill(app, h("main", { id: "main", class: "hub-screen" },
    h("header", { class: "hub-header" },
      h("a", { class: "exit-link", href: document.body.dataset.exitHref, text: `← ${document.body.dataset.exitLabel}` }),
      soundControls(audio)),
    h("section", { class: "hub-card", "aria-labelledby": "hub-title" },
      h("div", { class: "hub-copy" },
        brand(),
        heading,
        session.guest ? h("p", { class: "guest-note", text: "You are on a school access session, so progress here is not saved. Sign in to a MathNexa account before playing to save coins, purchases and avatar progress." }) : null,
        stats,
        live ? h("button", { type: "button", class: "button gold", id: "back-to-showdown", text: "BACK TO YOUR SHOWDOWN", onclick: () => navigate("#showdown") }) : null,
        h("div", { class: "hub-actions" }, actions),
        session.guest ? null : h("button", { type: "button", class: "link-button", id: "open-avatar", text: "Customize Avatar", onclick: () => navigate("#avatar") })),
      session.guest ? null : avatarHost),
    musicCredit()));
  if (!session.guest) hubAvatar = mountAvatar(avatarHost, session.avatar, { interactive: false, autoRotate: false, defer: true });
}

async function confirmNewRun() {
  const confirmed = await confirmDialog({ title: "Start a new run?", body: "Your unfinished run will end. Its coins are already yours.", confirm: "New Run" });
  if (confirmed) navigate("#solo-new");
}

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function renderCreate(message = "") {
  setScreen("create");
  let minutes = 5;
  let chosen = isAllowedEmoji(session.profile?.emoji) ? session.profile.emoji : "🦁";
  const nameInput = h("input", { id: "creator-name", class: "text-input", type: "text", autocomplete: "nickname", maxlength: String(NAME_MAX), required: true, value: session.profile?.displayName ?? "" });
  const durationButtons = DURATIONS.map((value) => h("button", { type: "button", class: `chip${value === minutes ? " on" : ""}`, "aria-pressed": String(value === minutes), dataset: { minutes: String(value) }, text: `${value} min`, onclick: (event) => {
    minutes = value;
    durationButtons.forEach((button) => {
      const on = button === event.currentTarget;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    });
  } }));
  const emojiButtons = EMOJI_CHOICES.map(({ emoji, name }) => h("button", { type: "button", class: `emoji-choice${emoji === chosen ? " on" : ""}`, "aria-pressed": String(emoji === chosen), "aria-label": name, text: emoji, onclick: (event) => {
    chosen = emoji;
    emojiButtons.forEach((button) => {
      const on = button === event.currentTarget;
      button.classList.toggle("on", on);
      button.setAttribute("aria-pressed", String(on));
    });
  } }));
  const submit = h("button", { type: "submit", class: "button primary huge", id: "create-game", text: "CREATE GAME" });
  const form = h("form", { class: "card create-form", novalidate: true },
    h("h1", { text: "CREATE SHOWDOWN" }),
    h("p", { class: "muted", text: "You play too, from this screen, by the same rules as everyone else." }),
    h("h2", { class: "slot-heading", text: "How long?" }),
    h("div", { class: "chip-row" }, durationButtons),
    h("label", { for: "creator-name", class: "slot-heading", text: "Your name" }), nameInput,
    h("h2", { class: "slot-heading", text: "Your emoji" }),
    h("div", { class: "emoji-grid", role: "group", "aria-label": "Emoji" }, emojiButtons),
    message ? errorNote(message) : null,
    submit,
    h("button", { type: "button", class: "button ghost", text: "Back", onclick: () => goHome() }));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    audio.activate();
    submit.disabled = true;
    submit.textContent = "Creating…";
    try {
      const reply = await accountRequest("create-room", { durationSeconds: minutes * 60, name: nameInput.value, emoji: chosen });
      const seat = { token: reply.token, hostToken: reply.hostToken, code: reply.room.code, name: reply.room.me.name, emoji: reply.room.me.emoji };
      saveSeat(seat);
      history.replaceState(null, "", "#showdown");
      openRoom(seat, reply.room);
    } catch (failure) {
      renderCreate(failure.message);
    }
  });
  fill(app, h("main", { id: "main", class: "center-screen" }, brand(), form));
}

function openRoom(seat, room) {
  teardown();
  current = new ShowdownScreen({
    app, audio, seat, room,
    exitLabel: "Back to Polygon Showdown",
    onExit: () => {
      current = null;
      history.replaceState(null, "", "#home");
      refreshSession().catch(() => undefined).then(route);
    }
  });
  current.start();
}

async function openShowdown() {
  const seat = readSeat();
  try {
    if (seat?.hostToken) {
      const payload = await playRequest("state", { token: seat.token });
      openRoom(seat, payload.room);
      return;
    }
  } catch {
    saveSeat(null);
  }
  try {
    // A new window or device, signed in to the creator's account.
    const reply = await accountRequest("resume-room");
    const resumed = { token: reply.token, hostToken: reply.hostToken, code: reply.room.code, name: reply.room.me.name, emoji: reply.room.me.emoji };
    saveSeat(resumed);
    openRoom(resumed, reply.room);
  } catch (error) {
    if (!(error instanceof GameError) || error.code !== "no-live-room") throw error;
    history.replaceState(null, "", "#home");
    route();
  }
}

async function openSolo(mode) {
  teardown();
  const screen = new SoloScreen({ app, session, audio, onExit: () => {
    current = null;
    history.replaceState(null, "", "#home");
    refreshSession().catch(() => undefined).then(route);
  } });
  current = screen;
  await screen.open(mode);
}

function openShop(mode) {
  teardown();
  if (session.guest) {
    history.replaceState(null, "", "#home");
    route();
    return;
  }
  const screen = new ShopScreen({ app, session, audio, mode, onExit: () => {
    current = null;
    history.replaceState(null, "", "#home");
    refreshSession().catch(() => undefined).then(route);
  } });
  current = screen;
  screen.open();
}

async function renderCatalogPreview() {
  setScreen("catalog");
  const { entry } = await accountRequest("catalog-preview");
  fill(app, h("main", { id: "main", class: "center-screen" }, brand(),
    h("p", { class: "status-tag", id: "catalog-status", text: entry.status.toUpperCase() }),
    h("article", { class: "catalog-card", id: "catalog-card" },
      h("img", { src: "/media/games/polygon-showdown.webp", alt: `${entry.title} gameplay artwork` }),
      h("div", { class: "catalog-card-body" },
        h("p", { class: "catalog-meta" }, h("span", { class: "free-tag", text: "Free to play" }), `${entry.category} · Grades ${entry.gradeMin}–${entry.gradeMax}`),
        h("h2", { text: entry.title }),
        h("p", { text: entry.description }))),
    h("p", { class: "muted small", text: "Local owner review. A draft is never listed in the catalog." }),
    h("button", { type: "button", class: "button ghost", text: "Back", onclick: () => goHome() })));
}

async function route() {
  const hash = location.hash.slice(1) || "home";
  try {
    if (hash === "solo") await openSolo(session.activeRun ? "continue" : "new");
    else if (hash === "continue") await openSolo("continue");
    else if (hash === "solo-new") await openSolo("new");
    else if (hash === "create") {
      teardown();
      renderCreate();
    } else if (hash === "showdown" || hash === "lobby") await openShowdown();
    else if (hash === "shop") openShop("shop");
    else if (hash === "avatar") openShop("avatar");
    else if (hash === "catalog") {
      teardown();
      await renderCatalogPreview();
    }
    else {
      teardown();
      renderHub();
    }
  } catch (error) {
    setScreen("error");
    fill(app, h("main", { id: "main", class: "center-screen" }, brand(),
      h("p", { class: "status-text", role: "alert", text: error instanceof GameError ? error.message : "Something went wrong." }),
      h("button", { type: "button", class: "button primary", text: "Try Again", onclick: () => boot() })));
  }
}

async function boot() {
  setScreen("loading");
  fill(app, h("main", { id: "main", class: "center-screen" }, brand(), h("p", { class: "status-text", role: "status", text: "Loading…" })));
  try {
    await refreshSession();
  } catch (error) {
    if (error instanceof GameError && error.status === 401) {
      location.assign(`/sign-in?next=${encodeURIComponent("/games/polygon-showdown/play")}`);
      return;
    }
    setScreen("error");
    fill(app, h("main", { id: "main", class: "center-screen" }, brand(),
      h("p", { class: "status-text", role: "alert", text: error instanceof GameError ? error.message : "Polygon Showdown could not load." }),
      h("button", { type: "button", class: "button primary", text: "Try Again", onclick: () => boot() })));
    return;
  }
  route();
}

window.addEventListener("hashchange", route);
boot();

export { avatarDescription };
