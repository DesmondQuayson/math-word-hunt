/**
 * Math Vocabulary Hunt natural-voice generator.
 *
 * Pre-generates every phrase the canonical game can speak as first-party MP3s
 * using Google Cloud TTS (Chirp 3: HD, en-US-Chirp3-HD-Aoede — the voice
 * class already approved for ShowMe Math), and writes the manifest the
 * browser adapter reads.
 *
 * SERVER-SIDE TOOLING ONLY. Reads the service-account file named by
 * GOOGLE_TTS_CREDENTIALS (git-ignored); no credential ever reaches the
 * repository, the bundle, or the browser — the shipped artifacts are plain
 * MP3s plus a JSON manifest.
 *
 * Corpus = every TERMS display name from docs/vocab.js + the fixed praise
 * and completion phrases in docs/index.html. Incremental: existing clips
 * whose phrase is unchanged are reused, so re-runs cost nothing.
 *
 *   GOOGLE_TTS_CREDENTIALS=<path> node scripts/generate-mvh-voice.mjs
 */
import { createSign, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const OUT_DIR = join(root, "apps", "platform-web", "public", "game-suite", "voice");
const MANIFEST = join(OUT_DIR, "manifest.json");
const REPORT = join(root, "tests", "reports", "math-vocabulary-hunt-natural-voice.json");
const VOICE = "en-US-Chirp3-HD-Aoede";
const ENGINE = "chirp3-hd";

// ---- corpus ---------------------------------------------------------------
function loadCorpus() {
  const vocabSource = readFileSync(join(root, "docs", "vocab.js"), "utf8");
  const sandboxModule = { exports: {} };
  new Function("module", "exports", vocabSource)(sandboxModule, sandboxModule.exports);
  const { TERMS, resolveGridWords } = sandboxModule.exports;
  const displays = [...new Set(resolveGridWords(Object.keys(TERMS)).map((t) => t.display))];
  // The fixed spoken phrases in docs/index.html (PRAISE + completion).
  const phrases = [
    "Good job, Chief!",
    "Nice find, Chief!",
    "That's it, Chief!",
    "Sharp eyes!",
    "You got it!",
    "Way to go, Chief!",
    "Puzzle complete! Great teamwork!"
  ];
  return { displays, phrases };
}

const normalize = (text) => String(text).replace(/\s+/g, " ").trim();
const fileFor = (phrase) => createHash("sha256").update(phrase).digest("hex").slice(0, 20) + ".mp3";

// ---- auth -----------------------------------------------------------------
async function accessToken() {
  const credentialPath = process.env.GOOGLE_TTS_CREDENTIALS;
  if (!credentialPath) throw new Error("GOOGLE_TTS_CREDENTIALS is not set.");
  const credential = JSON.parse(readFileSync(credentialPath, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: credential.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: credential.token_uri,
    iat: now,
    exp: now + 3600
  })).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(credential.private_key).toString("base64url");
  const response = await fetch(credential.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${header}.${claims}.${signature}`
  });
  if (!response.ok) throw new Error(`token ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return (await response.json()).access_token;
}

async function synthesize(token, phrase) {
  const response = await fetch("https://texttospeech.googleapis.com/v1beta1/text:synthesize", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text: phrase },
      voice: { languageCode: "en-US", name: VOICE },
      audioConfig: { audioEncoding: "MP3" }
    })
  });
  if (!response.ok) throw new Error(`synthesize ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return Buffer.from((await response.json()).audioContent, "base64");
}

// ---- main -----------------------------------------------------------------
const { displays, phrases } = loadCorpus();
const corpus = [...new Set([...displays, ...phrases].map(normalize))];
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(dirname(REPORT), { recursive: true });

const existing = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { clips: {} };
const clips = {};
let reused = 0;
const pending = [];
for (const phrase of corpus) {
  const file = fileFor(phrase);
  if (existing.clips?.[phrase] === file && existsSync(join(OUT_DIR, file))) {
    clips[phrase] = file;
    reused += 1;
  } else {
    pending.push({ phrase, file });
  }
}

console.log(`corpus ${corpus.length} phrases (${displays.length} terms + ${phrases.length} game phrases); reused ${reused}, to synthesize ${pending.length}`);

if (pending.length > 0) {
  const token = await accessToken();
  let done = 0;
  const failures = [];
  const CONCURRENCY = 2;
  async function worker() {
    for (;;) {
      const job = pending.shift();
      if (!job) return;
      let audio = null;
      for (let attempt = 1; attempt <= 4 && !audio; attempt += 1) {
        try {
          audio = await synthesize(token, job.phrase);
        } catch (error) {
          const message = String(error);
          const rateLimited = /\b(429|RESOURCE_EXHAUSTED|quota)\b/i.test(message);
          if (attempt === 4) {
            failures.push({ phrase: job.phrase, error: message.slice(0, 160) });
          } else {
            await new Promise((r) => setTimeout(r, rateLimited ? 15000 * attempt : 1500 * attempt));
          }
        }
      }
      if (!audio) continue;
      writeFileSync(join(OUT_DIR, job.file), audio);
      clips[job.phrase] = job.file;
      done += 1;
      if (done % 50 === 0) console.log(`  ${done} synthesized...`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`synthesized ${done}, failed ${failures.length}`);
  failures.slice(0, 3).forEach((f) => console.log("  FAIL", JSON.stringify(f)));
}

const preload = phrases.map((p) => clips[normalize(p)]).filter(Boolean);
writeFileSync(MANIFEST, JSON.stringify({ version: 1, engine: ENGINE, voice: VOICE, preload, clips }, null, 2) + "\n");

const missing = corpus.filter((p) => !clips[p]);
let totalBytes = 0;
for (const file of Object.values(clips)) totalBytes += statSync(join(OUT_DIR, file)).size;
const report = {
  generatedAt: new Date().toISOString(),
  provider: "google-cloud-tts",
  engine: ENGINE,
  voice: VOICE,
  vocabularyTerms: displays.length,
  termsRequiringPronunciation: displays.length,
  definitionsRequiringNarration: 0,
  generalGamePhrases: phrases.length,
  totalClips: Object.keys(clips).length,
  missingClips: missing.length,
  missing,
  staleClips: 0,
  totalAudioBytes: totalBytes,
  totalAudioMB: Number((totalBytes / 1024 / 1024).toFixed(2))
};
writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
console.log(`manifest ${Object.keys(clips).length} clips, missing ${missing.length}, total ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
if (missing.length > 0) process.exitCode = 1;
