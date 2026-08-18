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
  output = replaceOnce(
    output,
    "The verified MP3 derivative is self-hosted and looped with a local in-memory seam crossfade.",
    "The verified MP3 derivative is self-hosted and loops through the browser's native audio player.",
    "native music credit wording",
  );
  output = replaceOnce(output, "lines-of-3/tutorial-v1", "lines-of-3/tutorial-v2", "tutorial version");
  output = replaceSection(
    output,
    "function Wt({onDone:e,onSkip:t})",
    "function Gt(",
    tutorial,
    "One shared total",
    "Lines of 3 tutorial",
  );
  // A fulfilled Web Audio resume() is the platform contract. Reading state in
  // the same fulfillment callback races Safari's observable state transition
  // and incorrectly forces a second gesture even though resume succeeded.
  output = replaceOnce(
    output,
    ".then(()=>t.state===`running`?`UNLOCKED`:`BLOCKED`,e=>",
    ".then(()=>`UNLOCKED`,e=>",
    "AudioContext resume contract",
  );
  output = replaceSection(
    output,
    "initialize(){",
    "async activate(){",
    "initialize(){return Promise.resolve()}",
    "unlockAndReconcile(!1)",
    "pre-gesture audio initialization",
  );
  if (!output.includes("ensureMusicElement(e){")) {
    output = replaceOnce(
      output,
      "constructor(e=globalThis.AudioContext,t=globalThis.fetch?.bind(globalThis)){this.AudioContextClass=e,this.fetcher=t}unlock(e=!1){",
      "constructor(e=globalThis.AudioContext,t=globalThis.fetch?.bind(globalThis)){this.AudioContextClass=e,this.fetcher=t}ensureMusicElement(e){if(typeof globalThis.Audio!=`function`)return null;if(this.musicUrl=e,!this.musicElement){let e=new globalThis.Audio;e.loop=!0,e.preload=`none`,e.playsInline=!0,e.volume=this.musicVolume*so,e.muted=this.masterMuted,e.addEventListener(`error`,()=>{this.mediaError=e.error?`MediaError ${e.error.code}: ${e.error.message||`Music unavailable`}`:`Music unavailable`}),this.musicElement=e}return this.musicElement}primeMusic(e){let t=this.ensureMusicElement(e);if(!t)return Promise.resolve(!1);if(!t.src&&(t.src=e),!t.paused)return this.mediaError=null,Promise.resolve(!0);if(this.mediaPlayPromise)return this.mediaPlayPromise;this.musicRequestId=(this.musicRequestId??0)+1,this.musicPlayAttempts=(this.musicPlayAttempts??0)+1;let n=this.musicRequestId;try{let e=t.play(),r=Promise.resolve(e).then(()=>n!==this.musicRequestId?(t.pause(),!1):(this.mediaError=null,!t.paused),e=>(this.mediaError=e&&e.name?`${e.name}: ${e.message||`Music could not start`}`:`Music could not start`,!1));return this.mediaPlayPromise=r,r.finally(()=>{this.mediaPlayPromise===r&&(this.mediaPlayPromise=null)}),r}catch(e){return this.mediaError=e&&e.name?`${e.name}: ${e.message||`Music could not start`}`:`Music could not start`,Promise.resolve(!1)}}musicStatus(){let e=this.musicElement;return Object.freeze({paused:e?.paused??!0,loop:e?.loop??!0,currentTime:Number.isFinite(e?.currentTime)?e.currentTime:0,activeSources:e&&!e.paused?1:0,mediaElements:e?1:0,playAttempts:this.musicPlayAttempts??0,playPending:!!this.mediaPlayPromise,hasSource:!!e?.src,error:this.mediaError??null,disposed:this.mediaDisposed??!1})}unlock(e=!1){",
      "HTMLMedia music constructor",
    );
  }
  output = replaceOnce(
    output,
    "constructor(e=globalThis.AudioContext,t=globalThis.fetch?.bind(globalThis)){this.AudioContextClass=e,this.fetcher=t}",
    "constructor(e=globalThis.AudioContext??globalThis.webkitAudioContext,t=globalThis.fetch?.bind(globalThis)){this.AudioContextClass=e,this.fetcher=t}",
    "Safari Web Audio constructor alias",
  );
  output = replaceOnce(
    output,
    "ensureMusicElement(e){if(typeof globalThis.Audio!=`function`)return null;if(this.musicUrl=e,!this.musicElement){let e=new globalThis.Audio;e.loop=!0,e.preload=`none`,e.playsInline=!0,e.volume=this.musicVolume*so,e.muted=this.masterMuted,e.addEventListener(`error`,()=>{this.mediaError=e.error?`MediaError ${e.error.code}: ${e.error.message||`Music unavailable`}`:`Music unavailable`}),this.musicElement=e}return this.musicElement}",
    "ensureMusicElement(e){if(this.mediaDisposed||typeof globalThis.Audio!=`function`)return null;if(this.musicUrl=e,!this.musicElement){let e=new globalThis.Audio;e.loop=!0,e.preload=`none`,e.playsInline=!0,e.volume=this.musicVolume*so,e.muted=this.masterMuted,this.mediaErrorListener=()=>{let t=e.error;e.pause(),this.mediaFatal=!0,this.mediaGestureBlocked=!1,this.mediaError=t?`MediaError ${t.code}: ${t.message||`Music unavailable`}`:`Music unavailable`,this.onStatusChange?.()},e.addEventListener(`error`,this.mediaErrorListener),this.musicElement=e}return this.musicElement}",
    "fatal HTMLMedia error handling",
  );
  output = replaceSection(
    output,
    "primeMusic(e){",
    "musicStatus(){",
    "primeMusic(e,t=!1){let n=this.ensureMusicElement(e);if(!n)return Promise.resolve(!1);if(t&&(this.mediaGestureBlocked=!1),this.mediaFatal||this.mediaGestureBlocked&&!t)return Promise.resolve(!1);if(!n.src&&(n.src=e),!n.paused)return this.mediaError=null,this.mediaGestureBlocked=!1,Promise.resolve(!0);if(this.mediaPlayPromise)return this.mediaPlayPromise;this.musicRequestId=(this.musicRequestId??0)+1,this.musicPlayAttempts=(this.musicPlayAttempts??0)+1;let r=this.musicRequestId,i=e=>{if(r!==this.musicRequestId)return!1;let t=this.isAutoplayBlock(e);return this.mediaError=e&&e.name?`${e.name}: ${e.message||`Music could not start`}`:`Music could not start`,this.mediaGestureBlocked=t,t||(n.pause(),this.mediaFatal=!0,this.onStatusChange?.()),!1};try{let e=n.play(),t=Promise.resolve(e).then(()=>r!==this.musicRequestId?!1:(this.mediaError=null,this.mediaGestureBlocked=!1,this.onStatusChange?.(),!n.paused),i);return this.mediaPlayPromise=t,t.finally(()=>{this.mediaPlayPromise===t&&(this.mediaPlayPromise=null)}),t}catch(e){return Promise.resolve(i(e))}}",
    "this.mediaPlayPromise",
    "single-source HTMLMedia activation",
  );
  output = replaceOnce(
    output,
    "catch(e){return Promise.resolve(i(e))}}}musicStatus(){",
    "catch(e){return Promise.resolve(i(e))}}musicStatus(){",
    "legacy HTMLMedia method boundary",
  );
  output = replaceSection(
    output,
    "musicStatus(){",
    "unlock(e=!1){",
    "musicStatus(){let e=this.musicElement;return Object.freeze({paused:e?.paused??!0,loop:e?.loop??!0,currentTime:Number.isFinite(e?.currentTime)?e.currentTime:0,activeSources:e&&!e.paused?1:0,mediaElements:e?1:0,playAttempts:this.musicPlayAttempts??0,playPending:!!this.mediaPlayPromise,hasSource:!!e?.src,muted:e?.muted??this.masterMuted,volume:e?.volume??this.musicVolume*so,blocked:this.mediaGestureBlocked??!1,fatal:this.mediaFatal??!1,error:this.mediaError??null,disposed:this.mediaDisposed??!1})}",
    "activeSources",
    "honest HTMLMedia diagnostic",
  );
  output = replaceOnce(
    output,
    "unlock(e=!1){let t=this.ensureContext();",
    "unlock(e=!1){if(!this.AudioContextClass)return Promise.resolve(`UNLOCKED`);let t=this.ensureContext();",
    "no-Web-Audio music support",
  );
  output = replaceOnce(
    output,
    "async loadTrack(e){this.buffer||(this.loadPromise||=this.loadAndPrepare(e),await this.loadPromise)}",
    "async loadTrack(e){this.musicUrl=e,this.buffer||={duration:1}}",
    "HTMLMedia music load",
  );
  output = replaceOnce(
    output,
    "async resumeMusic(){if(!this.buffer)throw Error(`Music is not loaded.`);let e=this.ensureContext();if(await this.unlock()===`BLOCKED`)return!1;if(this.source)return!0;let t=e.createBufferSource();t.buffer=this.buffer,t.loop=!0,t.loopStart=q,t.loopEnd=this.buffer.duration,t.connect(this.musicGain);let n=this.normalizeOffset(this.offset);return t.start(0,n),this.offset=n,this.sourceStartedAt=e.currentTime,this.source=t,!0}",
    "async resumeMusic(){if(!this.musicUrl)throw Error(`Music is not loaded.`);return this.primeMusic(this.musicUrl)}",
    "HTMLMedia music resume",
  );
  output = replaceOnce(
    output,
    "pauseMusic(){if(!this.source||!this.context||!this.buffer)return;let e=Math.max(0,this.context.currentTime-this.sourceStartedAt);this.offset=this.normalizeOffset(this.offset+e);let t=this.source;this.source=null;try{t.stop()}catch{}t.disconnect()}",
    "pauseMusic(){this.musicRequestId=(this.musicRequestId??0)+1,this.mediaPlayPromise=null,this.musicElement?.pause()}",
    "HTMLMedia music pause",
  );
  output = replaceOnce(
    output,
    "setLevels(e,t,n){if(this.masterMuted=e,this.musicVolume=t,this.effectsVolume=n,!this.context||!this.masterGain||!this.musicGain||!this.effectsGain)return;let r=this.context.currentTime;this.masterGain.gain.setValueAtTime(+!e,r),this.musicGain.gain.setValueAtTime(t*so,r),this.effectsGain.gain.setValueAtTime(n,r)}",
    "setLevels(e,t,n){if(this.masterMuted=e,this.musicVolume=t,this.effectsVolume=n,this.musicElement&&(this.musicElement.muted=e,this.musicElement.volume=t*so),!this.context||!this.masterGain||!this.musicGain||!this.effectsGain)return;let r=this.context.currentTime;this.masterGain.gain.setValueAtTime(+!e,r),this.musicGain.gain.setValueAtTime(0,r),this.effectsGain.gain.setValueAtTime(n,r)}",
    "HTMLMedia music levels",
  );
  output = replaceOnce(
    output,
    "resetTrack(){this.pauseMusic(),this.buffer=null,this.loadPromise=null,this.unlockPromise=null,this.unlockAttempt=null,this.offset=q}",
    "resetTrack(){this.pauseMusic(),this.musicElement&&(this.mediaErrorListener&&this.musicElement.removeEventListener(`error`,this.mediaErrorListener),this.musicElement.removeAttribute(`src`),this.musicElement.load(),this.mediaErrorListener&&this.musicElement.addEventListener(`error`,this.mediaErrorListener)),this.musicUrl=null,this.buffer=null,this.loadPromise=null,this.unlockPromise=null,this.unlockAttempt=null,this.offset=q,this.mediaError=null,this.mediaFatal=!1,this.mediaGestureBlocked=!1}",
    "HTMLMedia music reset",
  );
  output = replaceOnce(
    output,
    "resetTrack(){this.pauseMusic(),this.musicElement&&(this.musicElement.removeAttribute(`src`),this.musicElement.load()),this.musicUrl=null,this.buffer=null,this.loadPromise=null,this.unlockPromise=null,this.unlockAttempt=null,this.offset=q,this.mediaError=null}",
    "resetTrack(){this.pauseMusic(),this.musicElement&&(this.mediaErrorListener&&this.musicElement.removeEventListener(`error`,this.mediaErrorListener),this.musicElement.removeAttribute(`src`),this.musicElement.load(),this.mediaErrorListener&&this.musicElement.addEventListener(`error`,this.mediaErrorListener)),this.musicUrl=null,this.buffer=null,this.loadPromise=null,this.unlockPromise=null,this.unlockAttempt=null,this.offset=q,this.mediaError=null,this.mediaFatal=!1,this.mediaGestureBlocked=!1}",
    "HTMLMedia retry reset",
  );
  output = replaceOnce(
    output,
    "status(){return{activeMusicSources:+!!this.source,activeEffects:this.activeEffects.size,contextState:this.context?.state??`uninitialized`,trackDecoded:this.buffer!==null}}",
    "status(){let e=this.musicStatus();return{activeMusicSources:e.activeSources,activeEffects:this.activeEffects.size,contextState:this.context?.state??(e.activeSources?`running`:`uninitialized`),trackDecoded:e.hasSource}}",
    "HTMLMedia music status",
  );
  output = replaceOnce(
    output,
    "async dispose(){this.pauseMusic();for(let e of this.activeEffects)try{e.stop()}catch{}this.activeEffects.clear(),this.context&&await this.context.close().catch(()=>void 0),this.context=null,this.masterGain=null,this.musicGain=null,this.effectsGain=null,this.buffer=null,this.loadPromise=null}",
    "async dispose(){if(this.mediaDisposed)return;this.pauseMusic();for(let e of this.activeEffects)try{e.stop()}catch{}this.activeEffects.clear(),this.musicElement&&(this.mediaErrorListener&&this.musicElement.removeEventListener(`error`,this.mediaErrorListener),this.musicElement.removeAttribute(`src`),this.musicElement.load()),this.mediaDisposed=!0,this.onStatusChange=null,this.context&&await this.context.close().catch(()=>void 0),this.context=null,this.masterGain=null,this.musicGain=null,this.effectsGain=null,this.musicElement=null,this.buffer=null,this.loadPromise=null}",
    "HTMLMedia music disposal",
  );
  output = replaceOnce(
    output,
    "async dispose(){this.pauseMusic();for(let e of this.activeEffects)try{e.stop()}catch{}this.activeEffects.clear(),this.musicElement&&(this.musicElement.removeAttribute(`src`),this.musicElement.load()),this.mediaDisposed=!0,this.context&&await this.context.close().catch(()=>void 0),this.context=null,this.masterGain=null,this.musicGain=null,this.effectsGain=null,this.musicElement=null,this.buffer=null,this.loadPromise=null}",
    "async dispose(){if(this.mediaDisposed)return;this.pauseMusic();for(let e of this.activeEffects)try{e.stop()}catch{}this.activeEffects.clear(),this.musicElement&&(this.mediaErrorListener&&this.musicElement.removeEventListener(`error`,this.mediaErrorListener),this.musicElement.removeAttribute(`src`),this.musicElement.load()),this.mediaDisposed=!0,this.onStatusChange=null,this.context&&await this.context.close().catch(()=>void 0),this.context=null,this.masterGain=null,this.musicGain=null,this.effectsGain=null,this.musicElement=null,this.buffer=null,this.loadPromise=null}",
    "idempotent HTMLMedia disposal",
  );
  output = replaceOnce(
    output,
    "async playEffect(e){let t=this.ensureContext();",
    "async playEffect(e){if(!this.AudioContextClass)return;let t=this.ensureContext();",
    "no-Web-Audio sound-effect degradation",
  );
  output = replaceOnce(
    output,
    "async activate(){this.disposed||(this.activated=!0,this.playback!==`UNAVAILABLE`&&await this.unlockAndReconcile(!0))}",
    "async activate(){this.disposed||(this.activated=!0,this.settings.musicEnabled&&!this.settings.masterMuted&&!this.explicitPaused&&!this.visibilityPaused&&this.backend.primeMusic(this.assetUrl,!0),this.playback!==`UNAVAILABLE`&&await this.unlockAndReconcile(!0))}",
    "gesture-synchronous music prime",
  );
  output = replaceOnce(
    output,
    "this.backend.primeMusic(this.assetUrl),this.playback!==`UNAVAILABLE`",
    "this.backend.primeMusic(this.assetUrl,!0),this.playback!==`UNAVAILABLE`",
    "gesture retry marker",
  );
  output = replaceOnce(
    output,
    "constructor(e,t,n){this.assetUrl=e,this.storage=t,this.backend=n,this.settings=t.load().settings,this.backend.setLevels(this.settings.masterMuted,this.settings.musicVolume,this.settings.soundEffectsVolume)}",
    "constructor(e,t,n){this.assetUrl=e,this.storage=t,this.backend=n,this.settings=t.load().settings,this.backend.onStatusChange=()=>{if(this.disposed)return;let e=this.backend.musicStatus();e.fatal?(this.permission=`UNAVAILABLE`,this.playback=`UNAVAILABLE`,this.error=e.error??`Music is unavailable.`):e.activeSources&&this.settings.musicEnabled&&!this.settings.masterMuted&&!this.explicitPaused&&!this.visibilityPaused&&(this.playback=`PLAYING`,this.error=null),this.emit()},this.backend.setLevels(this.settings.masterMuted,this.settings.musicVolume,this.settings.soundEffectsVolume)}",
    "manager HTMLMedia status bridge",
  );
  output = replaceOnce(
    output,
    "await this.backend.resumeMusic()?this.playback=`PLAYING`:(this.permission=`LOCKED`,this.playback=`IDLE`)",
    "await this.backend.resumeMusic()?this.playback=`PLAYING`:this.backend.musicStatus().fatal?(this.permission=`UNAVAILABLE`,this.playback=`UNAVAILABLE`,this.error=this.backend.musicStatus().error??`Music is unavailable.`):(this.permission=`LOCKED`,this.playback=`IDLE`)",
    "fatal-versus-blocked playback state",
  );
  output = replaceOnce(
    output,
    "this.playback!==`PLAYING`&&(this.playback=`IDLE`),this.emit();return",
    "this.playback=this.backend.musicStatus().activeSources?`PLAYING`:`IDLE`,this.emit();return",
    "independent music and sound-effect permission",
  );
  output = replaceOnce(
    output,
    "async dispose(){this.disposed=!0,this.listeners.clear(),await this.backend.dispose()}",
    "async dispose(){if(this.disposed)return;this.disposed=!0,this.listeners.clear(),await this.backend.dispose()}",
    "idempotent manager disposal",
  );
  output = replaceOnce(
    output,
    "setDocumentHidden(e){this.visibilityPaused=e,e?(this.backend.pauseMusic(),this.playback=`PAUSED`,this.emit()):this.reconcile()}",
    "setDocumentHidden(e){this.visibilityPaused=e,e?(this.backend.pauseMusic(),this.playback=`PAUSED`,this.emit()):this.reconcilePromise?this.reconcilePromise.finally(()=>{!this.visibilityPaused&&this.reconcile()}):this.reconcile()}",
    "visibility resume reconciliation",
  );
  output = replaceOnce(
    output,
    "e.emitApprovedGameEvent({type:`mode_preview_opened`,mode:t}),D.activate(),window.scrollTo",
    "e.emitApprovedGameEvent({type:`mode_preview_opened`,mode:t}),window.scrollTo",
    "single root activation path",
  );
  output = replaceOnce(
    output,
    "return document.addEventListener(`visibilitychange`,t),e.initialize(),()=>{document.removeEventListener(`visibilitychange`,t),e.dispose()}",
    "let n=t=>{t.persisted?e.setDocumentHidden(!0):e.dispose()},r=t=>{t.persisted&&e.setDocumentHidden(document.hidden)};return document.addEventListener(`visibilitychange`,t),window.addEventListener(`pagehide`,n),window.addEventListener(`pageshow`,r),e.initialize(),()=>{document.removeEventListener(`visibilitychange`,t),window.removeEventListener(`pagehide`,n),window.removeEventListener(`pageshow`,r),e.dispose()}",
    "pagehide audio cleanup",
  );
  output = replaceOnce(
    output,
    "let n=t=>{t.persisted?e.setDocumentHidden(!0):e.dispose()};return document.addEventListener(`visibilitychange`,t),window.addEventListener(`pagehide`,n),e.initialize(),()=>{document.removeEventListener(`visibilitychange`,t),window.removeEventListener(`pagehide`,n),e.dispose()}",
    "let n=t=>{t.persisted?e.setDocumentHidden(!0):e.dispose()},r=t=>{t.persisted&&e.setDocumentHidden(document.hidden)};return document.addEventListener(`visibilitychange`,t),window.addEventListener(`pagehide`,n),window.addEventListener(`pageshow`,r),e.initialize(),()=>{document.removeEventListener(`visibilitychange`,t),window.removeEventListener(`pagehide`,n),window.removeEventListener(`pageshow`,r),e.dispose()}",
    "BFCache pageshow recovery",
  );
  output = replaceOnce(
    output,
    "function xo(){return new _o(bo,typeof localStorage>`u`?new yo:new vo(localStorage),new lo)}",
    "function xo(){let e=new lo;return globalThis.__MATHNEXA_NUMBER_LOGIC_MUSIC__=Object.freeze({source:bo,snapshot:()=>e.musicStatus()}),new _o(bo,typeof localStorage>`u`?new yo:new vo(localStorage),e)}",
    "Number Logic music diagnostic",
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
