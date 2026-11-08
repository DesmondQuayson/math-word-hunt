import { expect, test, type Page } from "@playwright/test";

import { adminClient, newPage, PLAY_ROUTE, resetAccount, setBalance, SHOPPER, signIn, waitForScreen } from "./helpers";

const card = (page: Page, item: string) => page.locator(`article[data-item="${item}"]`);

async function openTab(page: Page, tab: string): Promise<void> {
  await page.locator(`.tab[data-tab="${tab}"]`).click();
}

async function buy(page: Page, item: string): Promise<void> {
  await card(page, item).locator('[data-action="buy"]').click();
  await page.getByRole("button", { name: "Buy", exact: true }).last().click();
}

test.describe("shop and avatar", () => {
  test("buy, try on, equip, keep on refresh, and follow the account to another device", async ({ browser }) => {
    const admin = adminClient();
    const id = await resetAccount(admin, SHOPPER.email);
    await setBalance(admin, id, 425);

    const laptop = await newPage(browser);
    await signIn(laptop.page, SHOPPER);
    await laptop.page.goto(`${PLAY_ROUTE}#shop`);
    await waitForScreen(laptop.page, "shop");
    await expect(laptop.page.locator("#shop-balance")).toContainText("425");

    // Try On changes the preview only: nothing owned, nothing charged.
    await openTab(laptop.page, "shoes");
    await card(laptop.page, "shoes-nova-high").locator('[data-action="try"]').click();
    await expect(laptop.page.locator("#try-note")).toContainText("Trying on Nova High-Top Sneakers");
    let wallet = await admin.from("polygon_wallets").select("balance").eq("user_id", id).single();
    expect(wallet.data?.balance).toBe(425);

    // A cheap item.
    await openTab(laptop.page, "tops");
    await buy(laptop.page, "top-sunrise");
    await expect(laptop.page.locator("#shop-balance")).toContainText("400");
    await expect(card(laptop.page, "top-sunrise").locator(".owned-tag")).toHaveText("Owned");

    // The owner's example: 400 less 350 leaves 50.
    await openTab(laptop.page, "shoes");
    await buy(laptop.page, "shoes-nova-high");
    await expect(laptop.page.locator("#shop-balance")).toContainText("50");

    // An expensive item says so and cannot be bought.
    await openTab(laptop.page, "jackets");
    await expect(card(laptop.page, "jacket-phoenix").locator('[data-action="buy"]')).toBeDisabled();
    await expect(card(laptop.page, "jacket-phoenix").locator('[data-action="buy"]')).toHaveText("Not enough");

    // Exactly the balance is enough, and leaves zero.
    await openTab(laptop.page, "bottoms");
    await setBalance(admin, id, 30);
    await laptop.page.reload();
    await waitForScreen(laptop.page, "shop");
    await openTab(laptop.page, "bottoms");
    await buy(laptop.page, "bottom-trail-shorts");
    await expect(laptop.page.locator("#shop-balance")).toContainText("0");

    // A purchase retried with the same key charges once.
    const replies = await laptop.page.evaluate(async () => {
      const send = async () => {
        const response = await fetch("/api/games/polygon-showdown/account", {
          method: "POST", credentials: "same-origin", referrerPolicy: "same-origin",
          headers: { "Content-Type": "application/json", "X-MathNexa-Game": "polygon-showdown" },
          body: JSON.stringify({ action: "purchase", item: "hat-beanie", key: "retry-key-0001" })
        });
        return response.json();
      };
      return [await send(), await send()];
    });
    expect(replies[0].result).toBe("insufficient");
    expect(replies[1].result).toBe("insufficient");

    await setBalance(admin, id, 200);
    const paid = await laptop.page.evaluate(async () => {
      const send = async () => {
        const response = await fetch("/api/games/polygon-showdown/account", {
          method: "POST", credentials: "same-origin", referrerPolicy: "same-origin",
          headers: { "Content-Type": "application/json", "X-MathNexa-Game": "polygon-showdown" },
          body: JSON.stringify({ action: "purchase", item: "hat-beanie", key: "retry-key-0002" })
        });
        return response.json();
      };
      return Promise.all([send(), send(), send()]);
    });
    expect(paid.filter((reply) => reply.result === "ok").length).toBe(3);
    wallet = await admin.from("polygon_wallets").select("balance").eq("user_id", id).single();
    expect(wallet.data?.balance).toBe(140);
    const lines = await admin.from("polygon_ledger").select("id").eq("user_id", id).eq("item_key", "hat-beanie");
    expect(lines.data).toHaveLength(1);

    // Wearing something you do not own is refused by the server.
    const refused = await laptop.page.evaluate(async () => {
      const response = await fetch("/api/games/polygon-showdown/account", {
        method: "POST", credentials: "same-origin", referrerPolicy: "same-origin",
        headers: { "Content-Type": "application/json", "X-MathNexa-Game": "polygon-showdown" },
        body: JSON.stringify({ action: "avatar-save", avatar: { base: "base-a", skin: "skin-3", hair: "hair-short", hairColor: "hc-black", facialHair: "fh-none", lipstick: "lip-none", eyeShadow: "shadow-none", blush: "blush-none", eyeliner: "liner-none", top: "top-everyday", bottom: "bottom-jeans", shoes: "shoes-golden-apex" } })
      });
      return { status: response.status, body: await response.json() };
    });
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe("item-not-owned");

    // Equip the sneakers and keep them through a refresh.
    await laptop.page.goto(`${PLAY_ROUTE}#avatar`);
    await waitForScreen(laptop.page, "avatar");
    await laptop.page.reload();
    await waitForScreen(laptop.page, "avatar");
    await openTab(laptop.page, "shoes");
    await card(laptop.page, "shoes-nova-high").locator('[data-action="equip"]').click();
    await expect(card(laptop.page, "shoes-nova-high").locator(".owned-tag")).toHaveText("Wearing");
    await openTab(laptop.page, "body");
    await laptop.page.locator(".tone").nth(7).click();
    await expect(laptop.page.locator(".tone").nth(7)).toHaveAttribute("aria-pressed", "true");

    await laptop.page.reload();
    await waitForScreen(laptop.page, "avatar");
    await openTab(laptop.page, "shoes");
    await expect(card(laptop.page, "shoes-nova-high").locator(".owned-tag")).toHaveText("Wearing");

    // A different device, the same account.
    const tablet = await newPage(browser, { viewport: { width: 1024, height: 768 } });
    await signIn(tablet.page, SHOPPER);
    await waitForScreen(tablet.page, "hub");
    await expect(tablet.page.locator("#hub-title")).toContainText("WELCOME BACK");
    await expect(tablet.page.locator("#hub-coins")).toContainText("140");
    await tablet.page.goto(`${PLAY_ROUTE}#shop`);
    await waitForScreen(tablet.page, "shop");
    await openTab(tablet.page, "shoes");
    await expect(card(tablet.page, "shoes-nova-high").locator(".owned-tag")).toHaveText("Wearing");
    await openTab(tablet.page, "hats");
    await expect(card(tablet.page, "hat-beanie").locator(".owned-tag")).toHaveText("Owned");
    const avatar = await tablet.page.evaluate(() => (window as unknown as { __POLYGON_SHOWDOWN__: { session: { avatar: { skin: string; shoes: string } } } }).__POLYGON_SHOWDOWN__.session.avatar);
    expect(avatar.shoes).toBe("shoes-nova-high");
    expect(avatar.skin).toBe("skin-8");

    await laptop.context.close();
    await tablet.context.close();
  });

  test("every required slot has free choices, and the avatar editor needs no purchase", async ({ browser }) => {
    const admin = adminClient();
    await resetAccount(admin, SHOPPER.email);
    const { context, page } = await newPage(browser);
    await signIn(page, SHOPPER);
    await page.goto(`${PLAY_ROUTE}#avatar`);
    await waitForScreen(page, "avatar");
    await expect(page.locator(".tone")).toHaveCount(10);
    for (const tab of ["hair", "facial-hair", "makeup", "tops", "bottoms", "shoes"]) {
      await openTab(page, tab);
      await expect(page.locator("article.item-card").first(), tab).toBeVisible();
    }
    await openTab(page, "hair");
    for (const name of ["Short Crop", "Long Layers", "Natural Curls", "Straight Cut", "Braids", "Locs", "Afro", "Fade", "Top Bun", "Ponytail"]) {
      await expect(page.getByRole("heading", { name, exact: true }), name).toBeVisible();
    }
    await context.close();
  });
});
