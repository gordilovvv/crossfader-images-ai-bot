import { Gemma } from '../../src/AI/Gemma4.ts';

const start = process.hrtime();
const text = await new Gemma().ask('Ответь одним словом: столица Франции?');
const [s, ns] = process.hrtime(start);
console.log(`[probe] gemma-ask "${text.trim()}" ${s}s ${Math.round(ns / 1e6)}ms`);
