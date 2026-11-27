import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Evidence accounting only. This does not call a model or simulate an answer.
export function summarize(panel, observations, now = new Date()) {
  const questions = new Map(panel.questions.map(q => [q.id, q]));
  const groups = new Map();
  const seen = new Set();
  for (const o of observations) {
    const question = questions.get(o.questionId);
    if (!question || o.exactQuestion !== question.question) throw new Error('Question differs from fixed panel');
    if (!['completed', 'unavailable', 'not-tested'].includes(o.status)) throw new Error('Unknown observation status');
    if (!['consumer-ai', 'model-api', 'web-search'].includes(o.surface)) throw new Error('Surface must distinguish consumer AI, API and web search');
    for (const field of ['provider', 'visibleModelOrVersion', 'locale', 'mode']) {
      if (typeof o[field] !== 'string' || !o[field].trim() || o[field].length > 160) throw new Error('Missing measurement context');
    }
    const date = new Date(o.observedAtUtc);
    if (!Number.isFinite(date.valueOf()) || date > now || !/Z$/.test(o.observedAtUtc)) throw new Error('Observation needs an actual UTC timestamp');
    const groupKey = JSON.stringify([o.observedAtUtc.slice(0, 7), o.provider, o.surface, o.visibleModelOrVersion, o.locale, o.mode, question.branded]);
    const sampleKey = `${groupKey}:${o.questionId}`;
    if (seen.has(sampleKey)) throw new Error('Duplicate monthly question: do not inflate the sample with reruns');
    seen.add(sampleKey);
    if (!groups.has(groupKey)) groups.set(groupKey, { month: o.observedAtUtc.slice(0, 7), provider: o.provider, surface: o.surface, model: o.visibleModelOrVersion, locale: o.locale, mode: o.mode, branded: question.branded, completed: 0, unavailable: 0, notTested: 0, mentions: 0, linkedCitations: 0, verifiedRelevantCitations: 0 });
    const group = groups.get(groupKey);
    if (o.status !== 'completed') {
      if (o.mathnexaMention != null || o.linkedCitation != null) throw new Error('Unavailable answers cannot supply measurements');
      group[o.status === 'unavailable' ? 'unavailable' : 'notTested']++;
      continue;
    }
    if (typeof o.mathnexaMention !== 'boolean' || !o.minimalEvidenceReference || !Array.isArray(o.citedCompetitors)) throw new Error('Completed answer needs evidence and explicit coding');
    if (o.linkedCitation != null) {
      let url;
      try { url = new URL(o.linkedCitation); } catch { throw new Error('Invalid citation URL'); }
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || !['mathnexa.com', 'www.mathnexa.com', 'showme.mathnexa.com'].includes(url.hostname)) throw new Error('Citation must link to a MathNexa URL without private parameters');
      group.linkedCitations++;
      if (o.sourceRelevanceVerified === true) group.verifiedRelevantCitations++;
    }
    group.completed++;
    if (o.mathnexaMention) group.mentions++;
  }
  const results = [...groups.values()].map(g => ({ ...g, planned: panel.questions.filter(q => q.branded === g.branded).length, attempted: g.completed + g.unavailable, mentionRate: g.completed ? g.mentions / g.completed : null, citationRate: g.completed ? g.linkedCitations / g.completed : null, verifiedCitationRate: g.completed ? g.verifiedRelevantCitations / g.completed : null }));
  return { panelVersion: panel.version, plannedQuestionsPerSurface: questions.size, completedObservations: results.reduce((s, g) => s + g.completed, 0), status: results.some(g => g.completed) ? 'sampled' : 'not-measured', groups: results, note: 'Rates describe these observations only. Keep surfaces, branded prompts, model versions and modes separate. Missing evidence is not zero visibility.' };
}

async function main() {
  const panel = JSON.parse(await readFile('docs/seo/geo-panel.json', 'utf8'));
  const input = process.argv[2];
  const observations = input ? JSON.parse(await readFile(input, 'utf8')) : panel.observations;
  const result = summarize(panel, observations);
  const output = resolve('.seo-output/geo-summary.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`AI-visibility accounting: ${result.status}; ${result.completedObservations} completed observations. Local summary saved.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('GEO evidence validation failed; no measurements published.'); process.exitCode = 1; });
}
