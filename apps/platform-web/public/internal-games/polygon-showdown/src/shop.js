// Polygon Showdown shop and avatar editor. One screen, two entrances: the shop
// lists everything for sale, and the editor lists what this player already has.
// Prices shown here are for reading only; the server charges from its own copy.

import { announce, fill, h, icon } from "../../math-bingo-live/src/dom.js";
import { accountRequest } from "./api.js";
import { mountAvatar } from "./avatar-preview.js";
import { framingForSlot } from "./avatar/product.js";
import { productPicture } from "./product-picture.js";
import { BASES, equipItem, getItem, itemsForSlot, itemsForTab, normalizeAvatar, SHOP_TABS, SKIN_TONES, SLOTS, TIER_LABELS } from "./engine/catalog.js";
import { brand, coinAmount, coinIcon, confirmDialog, numberText, setScreen, soundControls, toast } from "./ui.js";

const FRAMINGS = Object.freeze([
  { key: "full", label: "Full" },
  { key: "upper", label: "Upper" },
  { key: "face", label: "Face" }
]);
const ROTATE_STEP = Math.PI / 4;

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
    this.selected = null;
    this.stageView = "avatar";
    this.framing = "full";
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
    this.frameRow = h("div", { class: "frame-chips", role: "group", "aria-label": "Camera" });
    this.stageControls = h("div", { class: "stage-controls", id: "stage-controls", hidden: true },
      h("button", { type: "button", class: "rotate-button", id: "rotate-left", "aria-label": "Rotate left", onclick: () => this.rotate(-1) }, "← ", h("span", { class: "rotate-word", text: "Rotate" })),
      this.frameRow,
      h("button", { type: "button", class: "rotate-button", id: "rotate-right", "aria-label": "Rotate right", onclick: () => this.rotate(1) }, h("span", { class: "rotate-word", text: "Rotate" }), " →"));
    this.stageFrame = h("div", { class: "stage-frame", id: "stage-frame" }, this.stageHost);
    this.detailPanel = h("section", { class: "product-detail", id: "product-detail", "aria-label": "Product details", hidden: true });
    this.stagePanel = h("section", { class: "stage-panel", "aria-label": "Avatar preview" },
      this.stageFrame,
      this.stageControls,
      this.detailPanel,
      this.detail,
      h("div", { class: "button-row stage-actions" },
        h("button", { type: "button", class: "button ghost small", id: "reset-try", text: "Reset Try On", onclick: () => this.resetTry() })));
    fill(this.app, h("main", { id: "main", class: "shop-screen" },
      h("header", { class: "hud shop-hud" },
        h("button", { type: "button", class: "icon-button", "aria-label": "Back to Polygon Showdown home", title: "Home", onclick: () => this.leave() }, icon("home")),
        brand({ compact: true }),
        h("h1", { class: "shop-title", text: this.mode === "shop" ? "SHOP" : "MY AVATAR" }),
        this.balanceSlot,
        soundControls(this.audio),
        h("button", { type: "button", class: "button small ghost", id: "switch-mode", text: this.mode === "shop" ? "My Avatar" : "Shop", onclick: () => this.switchMode() })),
      h("div", { class: "shop-layout" },
        this.stagePanel,
        h("section", { class: "catalog-panel", "aria-label": this.mode === "shop" ? "Items for sale" : "Your items" },
          this.tabRow,
          this.grid))));
    this.selected = null;
    this.stageView = "avatar";
    this.framing = "full";
    this.avatarView = mountAvatar(this.stageHost, this.preview, { interactive: true, autoRotate: true, onReady: () => (this.stageControls.hidden = false) });
    this.renderFramings();
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
        this.closeDetail();
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

  /** BUY, OWNED or EQUIPPED, for a card and its screen-reader name. */
  stateOf(item) {
    if (this.isEquipped(item)) return { key: "equipped", label: "Equipped" };
    return this.isOwned(item) ? { key: "owned", label: "Owned" } : { key: "buy", label: "Buy" };
  }

  itemCard(item) {
    const state = this.stateOf(item);
    const price = item.starter ? "Free" : `${numberText(item.price)} coins`;
    return h("button", {
      type: "button", class: `item-card product-card tier-${item.tier}${state.key === "equipped" ? " equipped" : ""}`, dataset: { item: item.id },
      "aria-label": `${item.name}. ${TIER_LABELS[item.tier]}. ${price}. ${state.label}.`,
      onclick: () => this.selectItem(item)
    },
      h("span", { class: "product-shot" }, productPicture(item)),
      h("span", { class: "item-name", text: item.name }),
      h("span", { class: "item-meta" },
        item.starter ? h("span", { class: "item-price", text: "Free" }) : h("span", { class: "item-price" }, coinIcon(), numberText(item.price)),
        item.starter ? null : h("span", { class: "item-tier", text: TIER_LABELS[item.tier] })),
      h("span", { class: `state-tag state-${state.key}`, text: state.label.toUpperCase() }));
  }

  /** Brings every card up to date without reloading a single picture. */
  syncCards() {
    for (const card of this.grid.querySelectorAll(".product-card")) {
      const item = getItem(card.dataset.item);
      const state = this.stateOf(item);
      const price = item.starter ? "Free" : `${numberText(item.price)} coins`;
      card.classList.toggle("equipped", state.key === "equipped");
      card.setAttribute("aria-label", `${item.name}. ${TIER_LABELS[item.tier]}. ${price}. ${state.label}.`);
      const tag = card.querySelector(".state-tag");
      tag.className = `state-tag state-${state.key}`;
      tag.textContent = state.label.toUpperCase();
    }
  }

  renderFramings() {
    this.frameRow.hidden = this.stageView !== "avatar";
    this.frameRow.replaceChildren(...FRAMINGS.map((option) => h("button", {
      type: "button", class: `frame-chip${option.key === this.framing ? " on" : ""}`, "aria-pressed": String(option.key === this.framing), text: option.label, dataset: { framing: option.key },
      onclick: () => this.setFraming(option.key)
    })));
  }

  setFraming(key) {
    this.framing = key;
    this.avatarView.setFraming(key);
    this.renderFramings();
  }

  rotate(direction) {
    this.avatarView.rotateBy(direction * ROTATE_STEP);
  }

  // ------------------------------------------------------------ product view

  selectItem(item) {
    this.selected = item;
    this.stagePanel.classList.add("detail-open");
    if (this.mode === "shop") {
      this.showProduct(item);
      this.detail.textContent = "";
    } else {
      // In the editor the avatar is the point: put it straight on.
      this.tryOn(item);
    }
    this.renderDetail();
    announce(`${item.name}. ${this.stateOf(item).label}.`);
  }

  showProduct(item) {
    this.stageView = "product";
    this.stageFrame.classList.add("product");
    this.avatarView.showProduct(item);
    this.renderFramings();
  }

  showAvatar(framing = this.framing) {
    this.stageView = "avatar";
    this.framing = framing;
    this.stageFrame.classList.remove("product");
    this.avatarView.showAvatar(this.preview, framing);
    this.renderFramings();
  }

  closeDetail() {
    if (!this.selected && this.stageView === "avatar") return;
    this.selected = null;
    this.stagePanel.classList.remove("detail-open");
    this.detailPanel.hidden = true;
    this.showAvatar();
  }

  renderDetail() {
    const item = this.selected;
    if (!item) return;
    const owned = this.isOwned(item);
    const equipped = this.isEquipped(item);
    const affordable = this.balance >= item.price;
    const actions = [];
    if (this.stageView === "product") {
      actions.push(h("button", { type: "button", class: "button small ghost", id: "detail-try", dataset: { action: "try", item: item.id }, text: "Try On", onclick: () => this.tryOn(item) }));
    } else if (this.mode === "shop") {
      actions.push(h("button", { type: "button", class: "button small ghost", id: "detail-view", dataset: { action: "view", item: item.id }, text: "View Item", onclick: () => { this.showProduct(item); this.renderDetail(); } }));
    }
    if (equipped) {
      actions.push(h("span", { class: "state-tag state-equipped", id: "detail-state", text: "EQUIPPED" }));
    } else if (owned) {
      actions.push(h("button", { type: "button", class: "button small primary", id: "detail-equip", dataset: { action: "equip", item: item.id }, text: "Equip", onclick: () => this.equip(item) }));
    } else {
      actions.push(h("button", { type: "button", class: `button small ${affordable ? "primary" : "disabled"}`, id: "detail-buy", dataset: { action: "buy", item: item.id }, disabled: !affordable, "aria-disabled": String(!affordable), text: affordable ? "Buy" : "Not enough coins", onclick: () => this.buy(item) }));
    }
    this.detailPanel.hidden = false;
    this.detailPanel.replaceChildren(
      h("div", { class: "detail-head" },
        h("div", {},
          h("h2", { class: "detail-name", id: "detail-name", text: item.name }),
          item.starter ? null : h("p", { class: "item-tier", text: TIER_LABELS[item.tier] })),
        h("button", { type: "button", class: "icon-button", id: "detail-close", "aria-label": "Close product", title: "Close", onclick: () => this.closeDetail() }, icon("close"))),
      h("div", { class: "detail-prices" },
        item.starter ? h("p", { class: "item-price", id: "detail-price", text: "Free" }) : h("p", { class: "item-price", id: "detail-price" }, coinIcon(), numberText(item.price)),
        h("p", { class: "detail-balance", id: "detail-balance" }, "You have ", coinAmount(this.balance))),
      h("div", { class: "detail-actions" }, actions));
  }

  // ----------------------------------------------------------------- actions

  tryOn(item) {
    this.preview = equipItem(this.preview, item);
    this.tryingOn = item;
    this.showAvatar(framingForSlot(item.slot));
    this.detail.textContent = this.isEquipped(item) ? `Wearing ${item.name}.` : `Trying on ${item.name}. Not saved until you equip it.`;
    this.audio.equip();
    announce(`Trying on ${item.name}.`);
    this.renderDetail();
  }

  resetTry() {
    this.resetPreview();
    this.selected = null;
    this.stagePanel.classList.remove("detail-open");
    this.detailPanel.hidden = true;
    this.showAvatar("full");
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
      this.syncCards();
      this.renderDetail();
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
    this.showAvatar(framingForSlot(item.slot));
    this.detail.textContent = `Wearing ${item.name}.`;
    announce(`Wearing ${item.name}.`);
    this.syncCards();
    this.renderDetail();
  }

  async unequip(slot) {
    if (!(await this.persist({ ...this.saved, [slot.key]: null }))) return;
    this.audio.equip();
    this.preview = { ...this.saved };
    this.closeDetail();
    this.showAvatar();
    this.renderGrid();
  }

  async setBasic(key, value) {
    if (!(await this.persist({ ...this.saved, [key]: value }))) return;
    this.audio.equip();
    this.preview = { ...this.saved };
    this.showAvatar();
    this.renderGrid();
  }

  /** Items for a slot, for tests and future screens. */
  slotItems(slot) {
    return itemsForSlot(slot).map((item) => getItem(item.id));
  }
}
