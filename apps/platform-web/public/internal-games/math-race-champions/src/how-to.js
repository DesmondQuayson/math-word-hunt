// How to Play: the rules of all three experiences, in plain words.

import { CATEGORIES } from "./engine/questions.js";
import { h, icon } from "./dom.js";

const SECTIONS = Object.freeze([
  {
    title: "Every question",
    items: [
      "Each question shows two answers. Exactly one is correct. Press it.",
      "You choose the skills: one, several, or Mixed Skills (all seven), and one of five difficulties.",
      "Opponents always get the same skills and the same difficulty."
    ]
  },
  {
    title: "Classroom Competition",
    items: [
      "Two teams share one Smart Board. Team Turquoise plays on the left, Team Pink on the right.",
      "Both teams play at the same time, each with its own questions. Nobody waits for a turn.",
      "A correct answer moves your football exactly one space. A wrong answer moves nothing, and you never go backwards.",
      "The first football to reach space 62 wins. If both land within a tenth of a second, it is a tie.",
      "With a keyboard: Turquoise uses A and S, Pink uses K and L."
    ]
  },
  {
    title: "Race Computer",
    items: [
      "Ten stages, each a little harder. Correct answers make your car accelerate; wrong answers give no boost.",
      "Every race needs at least 30 correct answers to finish, whichever car you drive.",
      "Win a stage for the first time to earn Race Dollars: 500 for Stage 1, then 100 more each stage.",
      "Spend Race Dollars in the garage on three faster cars. The free starter car can win every stage.",
      "Race Dollars are play money inside this game. They cannot be bought, sold or exchanged."
    ]
  },
  {
    title: "Online Race",
    items: [
      "Anyone can create a room. Share the six-digit code, the QR code or the link.",
      "The creator races too. Everyone drives the same car with the same performance; garage cars are not used here.",
      "Every racer needs at least 30 correct answers to cross the finish line. First across wins."
    ]
  }
]);

/** "This screen: 1920 × 1080, Chrome 96." Nothing is sent anywhere; it is only shown. */
export function describeScreen() {
  const agent = navigator.userAgent;
  const match = /(Edg|OPR|SamsungBrowser|Firefox|Chrome|CriOS|Version)\/(\d+)/.exec(agent);
  const names = { Edg: "Edge", OPR: "Opera", SamsungBrowser: "Samsung Internet", Firefox: "Firefox", Chrome: "Chrome", CriOS: "Chrome", Version: "Safari" };
  const browser = match ? `${names[match[1]]} ${match[2]}` : "an unrecognised browser";
  const system = /Android (\d+)/.exec(agent)?.[0] ?? (/iPhone|iPad/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Mac OS X/.test(agent) ? "macOS" : /CrOS/.test(agent) ? "ChromeOS" : /Linux/.test(agent) ? "Linux" : "");
  return `This screen: ${window.innerWidth} × ${window.innerHeight}, ${browser}${system ? ` on ${system}` : ""}.`;
}

export function mount(root, context) {
  root.replaceChildren(
    h(
      "main",
      { id: "main", class: "page" },
      h(
        "header",
        { class: "page-head" },
        h("button", { type: "button", class: "icon-button", "aria-label": "Back to the game menu", onclick: () => context.navigate("hub") }, icon("back")),
        h("div", null, h("p", { class: "eyebrow", text: "Math Race Champions" }), h("h1", { text: "How to Play" }))
      ),
      h(
        "div",
        { class: "how" },
        SECTIONS.map(section => h("section", { class: "panel" }, h("h2", { text: section.title }), h("ul", null, section.items.map(text => h("li", { text }))))),
        h(
          "section",
          { class: "panel" },
          h("h2", { text: "The seven skills" }),
          h("ul", { class: "skill-list" }, CATEGORIES.map(category => h("li", null, h("strong", { text: category.title }), h("span", { class: "skill-example", text: category.example }))))
        )
      ),
      // Useful when a board or tablet shows the game differently: says what this screen is.
      h("p", { class: "fine-print", id: "this-screen", text: describeScreen() })
    )
  );
  return { destroy() {} };
}
