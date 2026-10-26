import type { ReactNode } from "react";

import styles from "./home.module.css";
import type { PrepFlowStepKey } from "./home-copy";

/**
 * Hand-drawn homepage illustrations. Original SVG, drawn for MathNexa: no
 * stock imagery, no photographs, no faces. People appear from behind, at the
 * table and in class, so the scenes stay about the work rather than about a
 * particular child. Strokes marked `data-draw` draw once when their section
 * scrolls into view (see InView); their resting style is fully drawn only
 * when motion is reduced, so nothing depends on the animation.
 */

/**
 * A marker underline under a few words of a heading: a background stroke, so
 * it follows the words onto a second line instead of forcing them onto one.
 */
export function Marked({ children }: Readonly<{ children: ReactNode }>) {
  return <span className={styles.marked}>{children}</span>;
}

export function StepIcon({ kind }: Readonly<{ kind: PrepFlowStepKey }>) {
  return <svg className={styles.stepIcon} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    {kind === "learn" ? <>
      <rect className={styles.iconPaper} x="8" y="14" width="48" height="36" rx="4" />
      <rect className={styles.iconFill} x="14" y="24" width="12" height="14" />
      <path className={styles.iconInk} d="M14 24 H50 V38 H14 Z M26 24 V38 M38 24 V38" />
      <path data-draw pathLength="1" className={styles.iconPen} d="M16 45 C 24 43, 34 44, 48 44" />
    </> : null}
    {kind === "practice" ? <>
      <rect className={styles.iconPaper} x="10" y="8" width="38" height="48" rx="4" />
      <path className={styles.iconRule} d="M16 20 H42 M16 29 H42 M16 38 H34" />
      <path data-draw pathLength="1" className={styles.iconPen} d="M18 47 L23 52 L33 42" />
      <path className={styles.iconPencil} d="M54 14 L58 18 L40 40 L34 42 L36 36 Z" />
    </> : null}
    {kind === "review" ? <>
      <path className={styles.iconInk} d="M32 10 A22 22 0 1 1 12.5 21.5" />
      <path className={styles.iconInk} d="M11 12 L12.5 21.5 L22 20" />
      <path className={styles.iconFill} d="M32 22 L35 29 L42.5 29.5 L36.8 34.3 L38.6 41.5 L32 37.5 L25.4 41.5 L27.2 34.3 L21.5 29.5 L29 29 Z" />
      <path data-draw pathLength="1" className={styles.iconPen} d="M20 50 C 28 53, 38 53, 46 49" />
    </> : null}
    {kind === "worksheet" ? <>
      <rect className={styles.iconPaper} x="18" y="6" width="28" height="22" rx="2" />
      <rect className={styles.iconInkFill} x="8" y="26" width="48" height="20" rx="5" />
      <rect className={styles.iconPaper} x="16" y="40" width="32" height="18" rx="2" />
      <path className={styles.iconRule} d="M21 47 H43 M21 52 H36" />
      <circle className={styles.iconFill} cx="48" cy="33" r="2.5" />
      <path data-draw pathLength="1" className={styles.iconPen} d="M23 13 H41 M23 19 H35" />
    </> : null}
  </svg>;
}


type HairStyle = "short" | "ponytail" | "bun" | "curly";

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * One person seen from behind: shoulders, a little neck, two ears and a full
 * head of hair. Reads as "someone at work" without a face to get wrong.
 */
function BackOfHead({ x, y, r, skin, hair, shirt, style = "short" }: Readonly<{ x: number; y: number; r: number; skin: string; hair: string; shirt: string; style?: HairStyle }>) {
  const collar = y + r * 1.32;
  const neckWidth = r * 0.62;
  const curls = style === "curly" ? Array.from({ length: 10 }, (_, index) => (index / 10) * Math.PI * 2) : [];
  return <g>
    <rect className={skin} x={round(x - neckWidth / 2)} y={round(y + r * 0.55)} width={round(neckWidth)} height={round(r * 0.95)} rx={round(r * 0.2)} />
    <path className={shirt} d={`M${round(x - r * 2.3)} 220 C ${round(x - r * 2.2)} ${round(y + r * 1.75)}, ${round(x - r * 1.2)} ${round(collar)}, ${x} ${round(collar)} C ${round(x + r * 1.2)} ${round(collar)}, ${round(x + r * 2.2)} ${round(y + r * 1.75)}, ${round(x + r * 2.3)} 220 Z`} />
    <ellipse className={skin} cx={round(x - r * 0.97)} cy={round(y + r * 0.12)} rx={round(r * 0.2)} ry={round(r * 0.28)} />
    <ellipse className={skin} cx={round(x + r * 0.97)} cy={round(y + r * 0.12)} rx={round(r * 0.2)} ry={round(r * 0.28)} />
    {style === "bun" ? <circle className={hair} cx={x} cy={round(y - r * 0.92)} r={round(r * 0.42)} /> : null}
    {curls.map((angle) => <circle key={angle} className={hair} cx={round(x + Math.cos(angle) * r * 0.9)} cy={round(y + Math.sin(angle) * r * 0.85 - r * 0.05)} r={round(r * 0.34)} />)}
    <circle className={hair} cx={x} cy={y} r={r} />
    {style === "ponytail" ? <path className={hair} d={`M${round(x - r * 0.22)} ${round(y + r * 0.6)} C ${round(x - r * 0.4)} ${round(y + r * 1.4)}, ${round(x + r * 0.05)} ${round(y + r * 1.9)}, ${round(x + r * 0.05)} ${round(y + r * 2.1)} C ${round(x + r * 0.5)} ${round(y + r * 1.7)}, ${round(x + r * 0.42)} ${round(y + r * 1.1)}, ${round(x + r * 0.26)} ${round(y + r * 0.6)} Z`} /> : null}
  </g>;
}

/** After school: a grown-up and a child, from behind, over a notebook at the kitchen table. */
export function KitchenTableScene() {
  return <svg className={styles.scene} viewBox="0 0 360 220" aria-hidden="true" focusable="false">
    <rect className={styles.sceneWallWarm} x="0" y="0" width="360" height="220" />
    <rect className={styles.sceneWindow} x="236" y="16" width="92" height="66" rx="6" />
    <path className={styles.sceneWindowBars} d="M282 16 V82 M236 49 H328" />
    <path className={styles.scenePlant} d="M44 96 C 40 76, 30 66, 22 62 C 34 64, 42 72, 46 84 C 46 70, 52 58, 62 52 C 56 64, 52 76, 50 96 Z" />
    <rect className={styles.scenePot} x="34" y="94" width="26" height="18" rx="4" />
    <rect className={styles.sceneTable} x="0" y="112" width="360" height="108" />
    <path className={styles.sceneTableEdge} d="M0 112 H360" />
    <g className={styles.sceneNotebook}>
      <path d="M116 120 L250 116 L260 166 L108 172 Z" />
      <path className={styles.sceneNotebookSpine} d="M184 118 L186 169" />
      <path className={styles.sceneRule} d="M122 134 L178 132 M124 146 L179 144 M126 158 L180 156 M194 131 L250 129 M196 143 L253 141" />
    </g>
    <text className={styles.sceneHand} x="128" y="141" transform="rotate(-2 128 141)">¾ = 6⁄8</text>
    <path data-draw pathLength="1" className={styles.scenePen} d="M196 155 C 204 150, 211 159, 219 153 C 226 149, 231 157, 238 152" />
    <rect className={styles.sceneSticky} x="20" y="126" width="42" height="34" rx="2" transform="rotate(-6 41 143)" />
    <text className={styles.sceneStickyText} x="25" y="147" transform="rotate(-6 41 143)">Fri: quiz</text>
    <g className={styles.sceneMug}>
      <path d="M304 124 H332 V154 C 332 160, 328 162, 322 162 H314 C 308 162, 304 160, 304 154 Z" />
      <path d="M332 131 C 344 131, 344 149, 332 149" />
    </g>
    <path className={styles.sceneSteam} d="M313 116 C 309 108, 319 104, 315 94 M323 116 C 319 108, 329 104, 325 96" />
    <BackOfHead x={92} y={170} r={21} skin={styles.sceneSkinB} hair={styles.sceneHairDark} shirt={styles.sceneShirtTeal} style="ponytail" />
    <BackOfHead x={262} y={158} r={26} skin={styles.sceneSkinA} hair={styles.sceneHairBrown} shirt={styles.sceneShirtCoral} style="bun" />
  </svg>;
}

/** In class: a number line on the board, the teacher pointing at it, three students from behind. */
export function ClassroomScene() {
  return <svg className={styles.scene} viewBox="0 0 360 220" aria-hidden="true" focusable="false">
    <rect className={styles.sceneWallCool} x="0" y="0" width="360" height="220" />
    <rect className={styles.sceneBoardFrame} x="24" y="16" width="236" height="112" rx="6" />
    <rect className={styles.sceneBoard} x="30" y="22" width="224" height="100" rx="3" />
    <path className={styles.sceneMarkerInk} d="M56 92 H232 M56 86 V98 M144 86 V98 M232 86 V98 M100 88 V96 M188 88 V96" />
    <text className={styles.sceneMarkerText} x="52" y="114">0</text>
    <text className={styles.sceneMarkerText} x="137" y="114">½</text>
    <text className={styles.sceneMarkerText} x="228" y="114">1</text>
    <path data-draw pathLength="1" className={styles.sceneMarkerArc} d="M56 84 C 74 58, 126 58, 144 84" />
    <path data-draw pathLength="1" className={styles.sceneMarkerArcAlt} d="M144 84 C 162 58, 214 58, 232 84" />
    <text className={styles.sceneMarkerWord} x="62" y="48">½ = 2⁄4</text>
    <g>
      <rect className={styles.sceneShirtNavy} x="292" y="74" width="46" height="66" rx="16" />
      <path className={styles.sceneArm} d="M298 88 L 262 70" />
      <rect className={styles.sceneSkinC} x="309" y="60" width="12" height="16" rx="3" />
      <ellipse className={styles.sceneSkinC} cx="302" cy="52" rx="3" ry="4" />
      <ellipse className={styles.sceneSkinC} cx="328" cy="52" rx="3" ry="4" />
      <circle className={styles.sceneHairBlack} cx="315" cy="50" r="13.5" />
    </g>
    <rect className={styles.sceneQuizStack} x="282" y="108" width="56" height="9" rx="2" />
    <rect className={styles.sceneQuizStack} x="286" y="101" width="50" height="9" rx="2" />
    <rect className={styles.sceneDesk} x="270" y="116" width="84" height="12" rx="3" />
    <rect className={styles.sceneFloor} x="0" y="150" width="360" height="70" />
    <path className={styles.sceneDeskRow} d="M0 168 H360" />
    <BackOfHead x={70} y={176} r={18} skin={styles.sceneSkinA} hair={styles.sceneHairBrown} shirt={styles.sceneShirtYellow} />
    <BackOfHead x={182} y={172} r={18} skin={styles.sceneSkinC} hair={styles.sceneHairDark} shirt={styles.sceneShirtTeal} style="curly" />
    <BackOfHead x={292} y={176} r={18} skin={styles.sceneSkinB} hair={styles.sceneHairBlack} shirt={styles.sceneShirtPink} style="ponytail" />
  </svg>;
}
