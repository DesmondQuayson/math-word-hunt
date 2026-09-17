import { describe, expect, it } from "vitest";

import { destinationLabel } from "@/lib/auth/access-intent";
import {
  MISSOURI_ALIGNMENT_NOTE,
  PLATFORM_HERO_AUDIENCE,
  PLATFORM_HERO_DESCRIPTION,
  PLATFORM_HERO_EYEBROW,
  PLATFORM_HERO_HEADLINE,
  PLATFORM_HOMEPAGE_DESCRIPTION,
  PLATFORM_HOMEPAGE_TITLE,
  PLATFORM_PRODUCTS,
  PRAXIS_NON_AFFILIATION,
  ROADMAP_MIDDLE_SCHOOL_REVIEW,
  platformProductLabel
} from "./platform-positioning";

const OLD_HERO_PHRASE = "Games, Missouri MAP Prep, image-rich homework, and topic quizzes";
const OLD_TITLE = "MathNexa | Math Games, MAP Prep, Homework and Quizzes";

describe("MathNexa homepage positioning and SEO metadata", () => {
  it("publishes the approved Google-facing title and description", () => {
    expect(PLATFORM_HOMEPAGE_TITLE).toBe("MathNexa | Online Math Prep, Homework PDFs, Quiz PDFs & Worksheets");
    expect(PLATFORM_HOMEPAGE_DESCRIPTION).toBe(
      "MathNexa offers math games, online math prep for Grades 3–8, printable homework and quiz PDFs, and a worksheet generator for teachers and families."
    );
    expect(PLATFORM_HOMEPAGE_TITLE).not.toBe(OLD_TITLE);
    // Meta descriptions beyond ~160 characters are truncated in search results.
    expect(PLATFORM_HOMEPAGE_DESCRIPTION.length).toBeLessThanOrEqual(160);
    // The description and the visible hero make the same factual claims, so
    // Google has consistent snippet material.
    for (const concept of ["math games", "online math prep for Grades 3–8", "worksheet generator"]) {
      expect(PLATFORM_HOMEPAGE_DESCRIPTION.toLowerCase()).toContain(concept.toLowerCase());
      expect(PLATFORM_HERO_DESCRIPTION.toLowerCase()).toContain(concept.toLowerCase());
    }
  });

  it("uses the approved homepage hierarchy exactly", () => {
    expect(PLATFORM_HERO_EYEBROW).toBe("Teacher-led math resources");
    expect(PLATFORM_HERO_HEADLINE).toBe("Make every math lesson clearer, more engaging, and ready to teach.");
    expect(PLATFORM_HERO_DESCRIPTION).toBe(
      "Math games, online math prep for Grades 3–8, Homework PDFs, Quiz PDFs, and a worksheet generator—all in one teacher-friendly platform."
    );
    expect(PLATFORM_HERO_AUDIENCE).toBe(
      "Built for teachers. Useful for families. Designed for classroom instruction, extra practice, and middle school math review."
    );
    expect(PLATFORM_HERO_DESCRIPTION).not.toContain(OLD_HERO_PHRASE);
  });

  it("renames the products for people while keeping every route path exactly as indexed", () => {
    expect(PLATFORM_PRODUCTS.map((product) => [product.href, product.label])).toEqual([
      ["/games", "Math Games"],
      ["/map-prep", "Online Math Prep"],
      ["/homework", "Homework PDFs"],
      ["/quizzes", "Quiz PDFs"]
    ]);
    expect(PLATFORM_PRODUCTS.map((product) => product.cardTitle)).toEqual([
      "Math Games",
      "Online Math Prep (Grades 3–8)",
      "Homework PDFs",
      "Quiz PDFs"
    ]);
    expect(PLATFORM_PRODUCTS.map((product) => product.features)).toEqual([
      "Engage · Practice",
      "Learn · Practice · Review · Worksheet Generator",
      "Practice · Print",
      "Assess · Print"
    ]);
    // Natural English plurals, never "Homework PDF" / "Quizzes PDF".
    expect(PLATFORM_PRODUCTS.map((product) => product.label)).not.toContain("Homework PDF");
    expect(PLATFORM_PRODUCTS.map((product) => product.label)).not.toContain("Quizzes PDF");
  });

  it("keeps the access flow heading consistent with the navigation label", () => {
    // Clicking "Online Math Prep" must not land on "Continue to MAP Prep".
    for (const product of PLATFORM_PRODUCTS) {
      expect(destinationLabel(product.href)).toBe(product.label);
      expect(platformProductLabel(product.href)).toBe(product.label);
    }
    expect(destinationLabel("/map-prep")).toBe("Online Math Prep");
  });

  it("keeps Missouri as a supported alignment claim without official affiliation", () => {
    expect(MISSOURI_ALIGNMENT_NOTE).toBe(
      "Includes practice aligned to Missouri MAP-style Grades 3–8 mathematics while also covering broadly useful grade-level math skills."
    );
    expect(MISSOURI_ALIGNMENT_NOTE).not.toMatch(/official|endorsed|DESE/i);
  });

  it("states the middle-school review plan as future work with the Praxis non-affiliation clarification", () => {
    expect(ROADMAP_MIDDLE_SCHOOL_REVIEW).toBe(
      "Middle School Math Review resources for educators, including content review useful when preparing for Praxis® Mathematics (5164)."
    );
    expect(ROADMAP_MIDDLE_SCHOOL_REVIEW).not.toMatch(/prep course|endorsed|official Praxis/i);
    expect(PRAXIS_NON_AFFILIATION).toContain("Praxis® is a registered trademark of ETS.");
    expect(PRAXIS_NON_AFFILIATION).toContain("not affiliated with, sponsored by, or endorsed by ETS");
    expect(PRAXIS_NON_AFFILIATION).toContain("does not offer a Praxis preparation course");
  });
});
