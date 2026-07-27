import { evaluatePhase5Readiness, formatPhase5Readiness } from "./phase5-readiness-contract.mjs";

const result = evaluatePhase5Readiness(process.env);
console.log(formatPhase5Readiness(result));
if (result.status === "blocked") process.exitCode = 1;
