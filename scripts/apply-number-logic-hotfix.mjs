import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimePath = resolve(
  repositoryRoot,
  "apps/platform-web/public/internal-games/number-logic/assets/index-DXexJzA-.js",
);

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) {
    if (source.includes(after)) return source;
    throw new Error(`Number Logic hotfix could not find ${label}.`);
  }
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Number Logic hotfix found duplicate ${label} markers.`);
  }
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
}

function replaceSection(source, start, end, replacement, expected, label) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    if (source.includes(replacement)) return source;
    throw new Error(`Number Logic hotfix could not locate ${label}.`);
  }
  const current = source.slice(startIndex, endIndex);
  const knownTutorialHotfix = label === "Lines of 3 tutorial" && current.includes("nl-tutorial-shell");
  if (!current.includes(expected) && !knownTutorialHotfix) {
    if (current.trim() === replacement.trim()) return source;
    throw new Error(`Number Logic hotfix rejected unexpected ${label} source.`);
  }
  return `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
}

// This is the reviewed React runtime emitted for the platform-owned tutorial override.
// It uses the approved Lines of 3 fixture: 4 / 7-2-3 / 1-6-5; every route totals 12.
const tutorial = String.raw`function Wt({onDone:e,onSkip:t}) {
  let [n,r]=(0,l.useState)(0),
    i=[
      {eyebrow:"The goal",title:"Make every line match.",copy:"Each connected line contains three numbers. Every line must total the target.",label:"Worked Lines of 3 example. The middle row is 7 plus a blank plus 3 and must equal 12, so the blank is 2."},
      {eyebrow:"Your move",title:"Place each number once.",copy:"Choose a number from the tray, then choose an empty circle. You can move it again.",label:"An actual Lines of 3 board with fixed clues 4, 7, 3, and 1, three empty circles, and the remaining number tiles 2, 5, and 6."},
      {eyebrow:"How you know",title:"Five green lines means solved.",copy:"When all five routes reach 12, the board is correct.",label:"Completed Lines of 3 board. Top 4; middle row 7, 2, 3; bottom row 1, 6, 5. All five lines total 12."}
    ],
    a=i[n],
    o=n===1?["4","7",null,"3","1",null,null]:["4","7","2","3","1","6","5"],
    s=["t","ml","mc","mr","bl","bc","br"];
  return (0,T.jsxs)("main",{id:"main-content",className:W.tutorial+" nl-tutorial-shell",children:[
    (0,T.jsxs)("header",{className:"nl-tutorial-heading",children:[
      (0,T.jsx)("p",{className:W.eyebrow,children:"MathNexa presents"}),
      (0,T.jsx)("strong",{children:"Number Logic"}),
      (0,T.jsx)("button",{className:W.textButton,type:"button",onClick:t,children:"Skip tutorial"})
    ]}),
    (0,T.jsx)("p",{className:"nl-tutorial-step",children:"Lines of 3 · "+(n+1)+" of 3"}),
    (0,T.jsx)("p",{className:W.eyebrow,children:a.eyebrow}),
    (0,T.jsx)("h1",{children:a.title}),
    (0,T.jsx)("p",{className:"nl-tutorial-copy",children:a.copy}),
    (0,T.jsxs)("div",{className:W.tutorialDiagram+" nl-tutorial-visual","data-step":n+1,role:"img","aria-label":a.label,children:[
      (0,T.jsxs)("div",{className:"nl-tutorial-target",children:[
        (0,T.jsx)("small",{children:"Every line"}),
        (0,T.jsx)("strong",{children:"= 12"})
      ]}),
      (0,T.jsxs)("div",{className:"nl-tutorial-board",children:[
        (0,T.jsxs)("svg",{className:"nl-tutorial-rails",viewBox:"0 0 100 100","aria-hidden":"true",children:[
          (0,T.jsx)("path",{d:"M50 9 L17 48 L17 87 L50 87 M50 9 L50 48 L50 87 M50 9 L83 48 L83 87 M17 48 H83 M17 87 H83"}),
          (0,T.jsx)("path",{className:"nl-tutorial-focus",d:"M17 48 H83"})
        ]}),
        o.map((e,t)=>(0,T.jsx)("span",{className:"nl-tutorial-node nl-tutorial-node-"+s[t],"data-empty":e===null,children:e??"?"},s[t]))
      ]}),
      n===0
        ? (0,T.jsxs)("div",{className:"nl-tutorial-proof",children:[
            (0,T.jsx)("span",{children:"7 + ? + 3 = 12"}),
            (0,T.jsx)("strong",{children:"? = 2"})
          ]})
        : n===1
          ? (0,T.jsxs)("div",{className:"nl-tutorial-tray",children:[
              (0,T.jsx)("small",{children:"Numbers left"}),
              (0,T.jsx)("span",{children:"2"}),(0,T.jsx)("span",{children:"5"}),(0,T.jsx)("span",{children:"6"})
            ]})
          : (0,T.jsx)("div",{className:"nl-tutorial-proof nl-tutorial-proof-complete",children:(0,T.jsx)("strong",{children:"✓ All five routes = 12"})})
    ]}),
    (0,T.jsxs)("div",{className:W.tutorialActions+" nl-tutorial-actions",children:[
      n>0&&(0,T.jsx)("button",{className:W.secondaryButton,type:"button",onClick:()=>r(e=>e-1),children:"Back"}),
      (0,T.jsx)("div",{className:"nl-tutorial-dots",role:"progressbar","aria-label":"Tutorial progress","aria-valuemin":1,"aria-valuemax":3,"aria-valuenow":n+1,"aria-valuetext":"Step "+(n+1)+" of 3",children:[0,1,2].map(e=>(0,T.jsx)("span",{"data-current":e===n,"aria-hidden":"true"},e))}),
      (0,T.jsx)("button",{className:W.primaryButton,type:"button",onClick:()=>n===2?e():r(e=>e+1),children:n===2?"Choose a puzzle":"Next"})
    ]})
  ]})
}`;

export function applyNumberLogicHotfix(input) {
  let output = input;
  output = replaceOnce(output, "lines-of-3/tutorial-v1", "lines-of-3/tutorial-v2", "tutorial version");
  output = replaceSection(
    output,
    "function Wt({onDone:e,onSkip:t})",
    "function Gt(",
    tutorial,
    "One shared total",
    "Lines of 3 tutorial",
  );
  output = replaceOnce(
    output,
    ".then(()=>`UNLOCKED`,e=>",
    ".then(()=>t.state===`running`?`UNLOCKED`:`BLOCKED`,e=>",
    "AudioContext running-state check",
  );
  output = replaceSection(
    output,
    "initialize(){",
    "async activate(){",
    "initialize(){return Promise.resolve()}",
    "unlockAndReconcile(!1)",
    "pre-gesture audio initialization",
  );
  return output;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const before = readFileSync(runtimePath, "utf8");
  const after = applyNumberLogicHotfix(before);
  if (after !== before) writeFileSync(runtimePath, after);
  console.log(after === before ? "Number Logic hotfix already applied." : "Number Logic hotfix applied.");
}
