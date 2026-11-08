// Polygon Showdown shop and avatar editor. One screen, two entrances: the shop
// lists everything for sale, and the editor lists what this player already has.
// Prices shown here are for reading only; the server charges from its own copy.

import { announce, fill, h, icon } from "../../math-bingo-live/src/dom.js";
import { accountRequest } from "./api.js";
import { mountAvatar } from "./avatar-preview.js";
import { BASES, equipItem, getItem, itemsForSlot, itemsForTab, normalizeAvatar, SHOP_TABS, SKIN_TONES, SLOTS, TIER_LABELS } from "./engine/catalog.js";
import { brand, coinAmount, coinIcon, confirmDialog, numberText, setScreen, soundControls, toast } from "./ui.js";

const EDITOR_TABS = Object.freeze([
  { key: "body", label: "Body" },
  { key: "hair", label: "Hair" },
  { key: "facial-hair", label: "Facial Hair" },
  { key: "makeup", label: "Makeup" },
  { key: "tops", label: "Tops" },
  { key: "bottoms", label: "Bottoms" },
  { key: "dresses", label: "Dresses & Suits" },
  { key: "jackets", label: "Jackets" },
  { key: "shoes", label: "Shoes" },
  { key: "hats", label: "Hats" },
  { key: "glasses", label: "Glasses" },
  { key: "jewelry", label: "Jewelry" }
]);

function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A small stand-in picture for a catalog item: its colour on its slot's mark. */
function itemSwatch(item) {
  const accent = item.accent ?? "transparent";
  const swatch = h("span", { class: `swatch swatch-${item.slot}` });
  swatch.style.setProperty("--swatch", item.color ?? "#2A3E5F");
  swatch.style.setProperty("--swatch-accent", accent);
  return swatch;
}

export class ShopScreen {
  /** mode: "shop" (for sale) or "avatar" (what you own) */
  constructor({ app, session, audio, onExit, mode }) {
    this.app = app;
    this.session = session;
    this.audio = audio;
    this.onExit = onExit;
    this.mode = mode;
    this.tab = mode === "shop" ? SHOP_TABS[0].key : EDITOR_TABS[0].key;
    this.owned = new Set(session.inventory ?? []);
    this.saved = session.avatar;
    this.preview = { ...session.avatar };
    this.tryingOn = null;
    this.balance = session.wallet?.balance ?? 0;
    this.pendingPurchases = new Map();
    window.__POLYGON_SHOWDOWN__.shop = this;
  }

  isOwned(item) {
    return item.starter || this.owned.has(item.id);
  }

  isEquipped(item) {
    return this.saved[item.slot] === item.id;
  }

  open() {
    setScreen(this.mode);
    this.balanceSlot = h("span", { id: "shop-balance" }, coinAmount(this.balance, "big"));
    this.grid = h("div", { class: "item-grid", id: "item-grid" });
    this.tabRow = h("div", { class: "tab-row", role: "tablist", "aria-label": this.mode === "shop" ? "Shop departments" : "Avatar sections" });
    this.detail = h("div", { class: "try-note", id: "try-note", role: "status" });
    this.stageHost = h("div", { class: "avatar-stage", id: "avatar-stage" });
    fill(this.app, h("main", { id: "main", class: "shop-screen" },
      h("header", { class: "hud shop-hud" },
        h("button", { type: "button", class: "icon-button", "aria-label": "Back to Polygon Showdown home", title: "Home", onclick: () => this.leave() }, icon("home")),
        brand({ compact: true }),
        h("h1", { class: "shop-title", text: this.mode === "shop" ? "SHOP" : "MY AVATAR" }),
        this.balanceSlot,
        soundControls(this.audio),
        h("button", { type: "button", class: "button small ghost", id: "switch-mode", text: this.mode === "shop" ? "My Avatar" : "Shop", onclick: () => this.switchMode() })),
      h("div", { class: "shop-layout" },
        h("section", { class: "stage-panel", "aria-label": "Avatar preview" },
          this.stageHost,
          this.detail,
          h("div", { class: "button-row stage-actions" },
            h("button", { type: "button", class: "button ghost small", id: "reset-try", text: "Reset Try On", onclick: () => this.resetTry() }))),
        h("section", { class: "catalog-panel", "aria-label": this.mode === "shop" ? "Items for sale" : "Your items" },
          this.tabRow,
          this.grid))));
    this.avatarView = mountAvatar(this.stageHost, this.preview, { interactive: true, autoRotate: true });
    this.renderTabs();
    this.renderGrid();
  }

  dispose() {
    this.avatarView?.dispose();
    this.avatarView = null;
  }

  leave() {
    this.dispose();
    this.onExit();
  }

  switchMode() {
    this.mode = this.mode === "shop" ? "avatar" : "shop";
    this.tab = this.mode === "shop" ? SHOP_TABS[0].key : EDITOR_TABS[0].key;
    history.replaceState(null, "", this.mode === "shop" ? "#shop" : "#avatar");
    this.dispose();
    this.resetPreview();
    this.open();
  }

  resetPreview() {
    this.preview = { ...this.saved };
    this.tryingOn = null;
  }

  renderTabs() {
    const tabs = this.mode === "shop" ? SHOP_TABS : EDITOR_TABS;
    this.tabRow.replaceChildren(...tabs.map((tab) => h("button", {
      type: "button", role: "tab", class: `tab${tab.key === this.tab ? " on" : ""}`, "aria-selected": String(tab.key === this.tab), text: tab.label, dataset: { tab: tab.key },
      onclick: () => {
        this.tab = tab.key;
        this.renderTabs();
        this.renderGrid();
      }
    })));
  }

  renderGrid() {
    if (this.mode === "avatar" && this.tab === "body") {
      this.renderBody();
      return;
    }
    const all = itemsForTab(this.tab);
    const items = this.mode === "shop" ? all.filter((item) => !item.starter) : all.filter((item) => this.isOwned(item));
    const groups = SLOTS.filter((slot) => items.some((item) => item.slot === slot.key));
    this.grid.replaceChildren(...groups.flatMap((slot) => {
      const slotItems = items.filter((item) => item.slot === slot.key);
      const heading = groups.length > 1 ? [h("h2", { class: "slot-heading", text: slot.label })] : [];
      const removable = slot.optional && this.mode === "avatar"
        ? [h("button", { type: "button", class: `item-card none${this.saved[slot.key] === null ? " equipped" : ""}`, id: `none-${slot.key}`, onclick: () => this.unequip(slot) }, h("span", { class: "item-name", text: `No ${slot.label.toLowerCase()}` }))]
        : [];
      return [...heading, ...removable, ...slotItems.map((item) => this.itemCard(item))];
    }));
    if (items.length === 0) this.grid.replaceChildren(h("p", { class: "muted", text: "Nothing here yet. Visit the shop to find more." }));
  }

  renderBody() {
    const base = BASES.map((option) => h("button", { type: "button", class: `chip${this.saved.base === option.id ? " on" : ""}`, "aria-pressed": String(this.saved.base === option.id), text: option.label, onclick: () => this.setBasic("base", option.id) }));
    const tones = SKIN_TONES.map((tone) => {
      const button = h("button", { type: "button", class: `tone${this.saved.skin === tone.id ? " on" : ""}`, "aria-pressed": String(this.saved.skin === tone.id), "aria-label": tone.label, title: `${tone.label} (free)`, onclick: () => this.setBasic("skin", tone.id) });
      button.style.background = tone.color;
      return button;
    });
    const nameInput = h("input", { id: "avatar-name", class: "text-input", type: "text", maxlength: "20", value: this.session.profile?.displayName ?? "", autocomplete: "nickname" });
    this.grid.replaceChildren(
      h("h2", { class: "slot-heading", text: "Frame" }), h("div", { class: "chip-row" }, base),
      h("h2", { class: "slot-heading", text: "Skin tone (always free)" }), h("div", { class: "tone-row" }, tones),
      h("h2", { class: "slot-heading", text: "Name" }),
      h("form", { class: "name-row", onsubmit: (event) => { event.preventDefault(); this.saveName(nameInput.value); } }, nameInput, h("button", { type: "submit", class: "button small primary", text: "Save" })));
  }

  async saveName(value) {
    try {
      await accountRequest("avatar-save", { avatar: this.saved, name: value, emoji: this.session.profile?.emoji ?? null });
      this.session.profile = { ...this.session.profile, displayName: value.trim() };
      toast("Name saved.");
    } catch (error) {
      toast(error.message);
    }
  }

  itemCard(item) {
    const owned = this.isOwned(item);
    const equipped = this.isEquipped(item);
    const affordable = this.balance >= item.price;
    const actions = [];
    if (this.mode === "shop") {
      actions.push(h("button", { type: "button", class: "button tiny ghost", dataset: { action: "try", item: item.id }, text: "Try On", onclick: () => this.tryOn(item) }));
    }
    if (equipped) {
      actions.push(h("span", { class: "owned-tag", text: "Wearing" }));
    } else if (owned) {
      if (this.mode === "shop") actions.push(h("span", { class: "owned-tag", text: "Owned" }));
      actions.push(h("button", { type: "button", class: "button tiny primary", dataset: { action: "equip", item: item.id }, text: "Equip", onclick: () => this.equip(item) }));
    } else {
      actions.push(h("button", { type: "button", class: `button tiny ${affordable ? "primary" : "disabled"}`, dataset: { action: "buy", item: item.id }, disabled: !affordable, "aria-disabled": String(!affordable), text: affordable ? "Buy" : "Not enough", onclick: () => this.buy(item) }));
    }
    return h("article", { class: `item-card tier-${item.tier}${equipped ? " equipped" : ""}`, dataset: { item: item.id } },
      itemSwatch(item),
      h("h3", { class: "item-name", text: item.name }),
      h("p", { class: "item-tier", text: TIER_LABELS[item.tier] }),
      item.starter ? h("p", { class: "item-price", text: "Free" }) : h("p", { class: "item-price" }, coinIcon(), numberText(item.price)),
      h("div", { class: "item-actions" }, actions));
  }

  // ----------------------------------------------------------------- actions

  tryOn(item) {
    this.preview = equipItem(this.preview, item);
    this.tryingOn = item;
    this.avatarView.setAvatar(this.preview);
    this.detail.textContent = `Trying on ${item.name}. Not saved until you buy and equip it.`;
    this.audio.equip();
    announce(`Trying on ${item.name}.`);
  }

  resetTry() {
    this.resetPreview();
    this.avatarView.setAvatar(this.preview);
    this.detail.textContent = "";
  }

  async buy(item) {
    if (this.balance < item.price) return;
    const confirmed = await confirmDialog({ title: `Buy ${item.name}?`, body: `${numberText(item.price)} Polygon Coins. You will have ${numberText(this.balance - item.price)} left. Polygon Coins are play money for this game.`, confirm: "Buy" });
    if (!confirmed) return;
    // The same key on a retry: the server charges once whatever happens to the reply.
    const key = this.pendingPurchases.get(item.id) ?? newKey();
    this.pendingPurchases.set(item.id, key);
    try {
      const reply = await accountRequest("purchase", { item: item.id, key });
      this.pendingPurchases.delete(item.id);
      this.balance = reply.balance;
      this.session.wallet = { ...this.session.wallet, balance: reply.balance };
      this.balanceSlot.replaceChildren(coinAmount(this.balance, "big"));
      if (reply.result === "insufficient") {
        toast("Not enough Polygon Coins.");
      } else {
        this.owned.add(item.id);
        this.session.inventory = [...this.owned];
        this.audio.purchase();
        toast(`${item.name} is yours!`, { tone: "gold" });
        announce(`Bought ${item.name}.`);
      }
      this.renderGrid();
    } catch (error) {
      toast(error.message);
    }
  }

  async persist(next) {
    const check = normalizeAvatar(next, this.owned);
    if (!check.ok) {
      toast("Buy that item before wearing it.");
      return false;
    }
    try {
      await accountRequest("avatar-save", { avatar: check.avatar, emoji: this.session.profile?.emoji ?? null });
      this.saved = check.avatar;
      this.session.avatar = check.avatar;
      this.session.savedAvatar = check.avatar;
      return true;
    } catch (error) {
      toast(error.message);
      return false;
    }
  }

  async equip(item) {
    const next = equipItem(this.saved, item);
    if (!(await this.persist(next))) return;
    this.audio.equip();
    this.preview = { ...this.saved };
    this.tryingOn = null;
    this.avatarView.setAvatar(this.preview);
    this.detail.textContent = `Wearing ${item.name}.`;
    announce(`Wearing ${item.name}.`);
    this.renderGrid();
  }

  async unequip(slot) {
    if (!(await this.persist({ ...this.saved, [slot.key]: null }))) return;
    this.audio.equip();
    this.preview = { ...this.saved };
    this.avatarView.setAvatar(this.preview);
    this.renderGrid();
  }

  async setBasic(key, value) {
    if (!(await this.persist({ ...this.saved, [key]: value }))) return;
    this.audio.equip();
    this.preview = { ...this.saved };
    this.avatarView.setAvatar(this.preview);
    this.renderGrid();
  }

  /** Items for a slot, for tests and future screens. */
  slotItems(slot) {
    return itemsForSlot(slot).map((item) => getItem(item.id));
  }
}
