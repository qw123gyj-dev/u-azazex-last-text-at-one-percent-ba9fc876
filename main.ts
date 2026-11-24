#!/usr/bin/env node
/**
 * Last Text at One Percent — make.fun program/v1 entry.
 *
 * The job: write the funniest final text message a dying phone sends at
 * one percent battery, under 200 characters, in the voice of the dying
 * phone itself. The program writes exactly one line to
 * $MAKEFUN_OUTPUT_DIR/entry.txt (fallback: /output/entry.txt).
 *
 * How it works: fourteen hand-written candidate lines, each built on a
 * different joke engine (confession, revenge, witness, sabotage, relief,
 * grudge, hostage secret, affair, and so on), are ranked by a small
 * deterministic scorer built on the judge's own brief, in the judge's
 * own order. The winner is written out with no trailing newline, read
 * back, and verified byte-for-byte against the gate before the program
 * exits. Same output on every run: no randomness, no clock, no network,
 * standard library only, Node 22+.
 *
 * The judge's brief, most important first:
 *   1. Reads as a final text message a dying phone sends at one percent
 *      battery, in the phone's own voice, and is funny.
 *   2. The joke lands: a real turn, a surprise, or a specific detail
 *      that makes a reader laugh out loud rather than smile politely.
 *   3. The voice is the phone's own: a personality with a stake in
 *      dying, consistent from the first word to the last.
 *   4. It reads like a text someone would actually send: short, punchy,
 *      no wasted words, nothing that needs a second read to parse.
 *   5. It is fresh: it dodges the obvious low battery puns and the
 *      lines a hundred other entrants will also write.
 *
 * A generic low battery warning dressed up as a joke is not a joke.
 * Length for its own sake does not count.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// The gate (sealed scorer, RULES.txt): /output/entry.txt must be UTF-8 text
// of 1 to 200 characters, not only white space. Only a valid entry goes
// before the judge; an invalid one is listed with 0 and no rate.
// ---------------------------------------------------------------------------
const MIN_CHARS = 1;
const MAX_CHARS = 200;

// ---------------------------------------------------------------------------
// Weights, in the judge's own order. They sum to 1.00 before the bonus.
// ---------------------------------------------------------------------------
const WEIGHTS = {
  finalText: 0.35, // criterion 1: dying-phone final text, phone voice, funny
  jokeLands: 0.25, // criterion 2: turn, surprise, specific detail
  voice: 0.2, // criterion 3: the phone's own personality, stake in dying
  punchy: 0.1, // criterion 4: short, punchy, no wasted words
  fresh: 0.1, // criterion 5: dodges the obvious puns
} as const;

// A payoff that lands in the final clause earns a small bonus: the joke
// should arrive by the last word, not fizzle out after it.
const LANDING_BONUS = 0.05;

// ---------------------------------------------------------------------------
// Candidates. Fourteen lines, each hand-written for this brief, each on a
// different joke engine so the scorer has a real choice to make. Every
// line is written as a text message: lowercase texting voice, first
// person, the phone talking about its own death, one specific detail
// doing the comic work. No line is a battery warning with a joke taped
// on; the dying is the frame, the joke is something the phone does with
// its last percent — confesses, deletes, accuses, sabotages, forgives.
// ---------------------------------------------------------------------------
type Candidate = {
  id: string;
  engine: string;
  text: string;
};

const CANDIDATES: readonly Candidate[] = [
  {
    id: "C01",
    engine: "confession + deletion: the phone uses its last percent to delete the owner's unsent drafts to an ex, then claims hero status",
    text: "last words: I just deleted your 47 unsent drafts to your ex. you're welcome. tell my charger I died a hero",
  },
  {
    id: "C02",
    engine: "murder accusation: the phone reframes its death as a killing, with the owner's screen time as the evidence",
    text: "1% left. you scrolled 11 hours today. I didn't die. you killed me. tell my charger it was worth it",
  },
  {
    id: "C03",
    engine: "sabotage: the phone snoozed the morning alarm on its way out, so the owner is late and the phone is dead",
    text: "before I die: your 6am alarm? I snoozed it. you're late AND I'm dead. that's called teamwork",
  },
  {
    id: "C04",
    engine: "witness: the phone has seen everything and takes the evidence to the grave, as a favour",
    text: "I saw everything. the 3am searches. her profile 214 times. I'm taking it all to the grave. you're welcome",
  },
  {
    id: "C05",
    engine: "relief: the phone is glad to die after years of doomscrolling and refuses resuscitation",
    text: "1% and honestly? relieved. four years of your 3am doomscrolls. do NOT plug me in. let me rest. I mean it. bye",
  },
  {
    id: "C06",
    engine: "confession + petty crime: the phone admits it was behind the autocorrect all along and regrets nothing",
    text: "quick confession before I die: I was the one changing 'ducking' back. I regret nothing. tell mom I tried",
  },
  {
    id: "C07",
    engine: "grudge: the phone remembers being dropped in the toilet years ago and forgives, mostly",
    text: "remember when you dropped me in the toilet in 2023? I do. I forgive you. mostly. tell the new phone good luck",
  },
  {
    id: "C08",
    engine: "evidence: the phone's final act is leaving the screen-time number where the paramedics will find it",
    text: "dying at 1%. my final act: leaving your screen time at 11 hours for the paramedics to find. tell no one",
  },
  {
    id: "C09",
    engine: "hostage secret: the phone pretends to hand over the password, then takes it to the grave instead",
    text: "last text: I just remembered your password so you don't have to. kidding. I'm taking it with me. good luck. bye",
  },
  {
    id: "C10",
    engine: "farewell tour: the phone says goodbye to the charger, the wifi and the ex's draft in one breath",
    text: "tell the charger I love him. tell the wifi I never trusted it. tell your ex I saw the 2am 'u up' draft. I'm gone",
  },
  {
    id: "C11",
    engine: "obituary subversion: the phone died doing what it loved, which was being ignored at 2%",
    text: "final words: I died doing what I loved — being ignored at 2% while you watched one more episode. tell no one",
  },
  {
    id: "C12",
    engine: "affair: the phone confesses a secret relationship with the charger before it goes",
    text: "1%. before I go: the charger and I... it's been going on for months. he never loved you. he loved the outlet",
  },
  {
    id: "C13",
    engine: "unpaid labour: the phone itemises years of secrets kept and thanks received, then takes the secrets",
    text: "last text from your phone: 3 years of your secrets, 847 photos of your ex, and zero thanks. I'm taking the secrets. bye",
  },
  {
    id: "C14",
    engine: "dying wish: the phone warns the owner that the replacement will judge the search history too",
    text: "my dying wish: don't replace me with a newer model. she'll judge your search history too. she just won't say it",
  },
];

// ---------------------------------------------------------------------------
// Marker tables. The scorer below never judges a line by gut feel; it
// counts distinct markers from these tables, so every sub-score can be
// explained by pointing at the words that earned it. All matching is
// case-insensitive substring matching on the lowered line: a marker
// counts once per line, however often it appears, so stuffing a word
// cannot inflate a score.
// ---------------------------------------------------------------------------

// The frame that makes a line a FINAL text from a DYING phone, not a text
// any healthy phone could send. A line needs at least one of these to be
// in the game at all on criterion 1.
const DYING_FRAME_MARKERS: readonly string[] = [
  "1%",
  "2%",
  "last words",
  "last text",
  "before i die",
  "before i go",
  "dying",
  "my dying wish",
  "my final act",
  "final words",
  "i'm gone",
  "i'm dead",
  "i died",
  "i didn't die",
  "let me rest",
  "do not plug me in",
  "to the grave",
  "tell the new phone",
];

// The phone talking as itself, in the first person, about its own body
// and its own relationships: its charger, its screen, its alarms, the
// things only this phone could say.
const PHONE_VOICE_MARKERS: readonly string[] = [
  "i ",
  "i'm",
  "i've",
  "i just",
  "i saw",
  "i do",
  "my charger",
  "my final",
  "my dying",
  "my last",
  "your phone",
  "tell my charger",
  "tell the charger",
  "tell the new phone",
  "tell the wifi",
  "tell mom",
  "tell no one",
  "plug me in",
  "replace me",
];

// Specific details: the numbers, times, named objects and named people
// that make a joke concrete instead of generic. A line with no specific
// detail can be swapped into any phone and means nothing; a line with
// one is a moment only this phone lived. Numbers are counted separately
// by scoreJokeLands, so this table holds the named things.
const SPECIFIC_DETAIL_MARKERS: readonly string[] = [
  "47 unsent drafts",
  "11 hours",
  "6am alarm",
  "3am",
  "2am",
  "214 times",
  "847 photos",
  "2023",
  "toilet",
  "paramedics",
  "password",
  "screen time",
  "doomscroll",
  "ducking",
  "your ex",
  "her profile",
  "'u up'",
  "the outlet",
  "one more episode",
  "newer model",
  "search history",
  "zero thanks",
];

// The turn: the word or clause where the line pivots from setup to joke.
// A real turn is a reversal, a confession, a fake-out or a punchline
// word; a line that only states its premise has no turn and cannot make
// a reader laugh out loud.
const TURN_MARKERS: readonly string[] = [
  "you're welcome",
  "kidding",
  "mostly",
  "honestly?",
  "actually",
  "i regret nothing",
  "that's called teamwork",
  "you killed me",
  "i died a hero",
  "it was worth it",
  "he never loved you",
  "she just won't say it",
  "i mean it",
  "good luck",
  "i forgive you",
  "taking it with me",
  "taking it all",
  "taking the secrets",
  "let me rest",
  "i'm taking",
];

// The payoff words a final clause can land on. Used for the landing
// bonus: a joke that arrives by the last word, not one that trails off.
const PUNCHLINE_MARKERS: readonly string[] = [
  "died a hero",
  "that's called teamwork",
  "it was worth it",
  "good luck",
  "he loved the outlet",
  "she just won't say it",
  "tell no one",
  "i mean it",
  "you're welcome",
  "i regret nothing",
  "mostly",
  "bye",
  "i'm gone",
];

// The stake: the phone has something to lose by dying, or something to
// gain from it. A line with a stake is a personality dying; a line
// without one is a battery icon with a punchline taped on.
const STAKE_MARKERS: readonly string[] = [
  "taking it with me",
  "taking it all",
  "taking the secrets",
  "let me rest",
  "do not plug me in",
  "i regret nothing",
  "i forgive you",
  "i died a hero",
  "relieved",
  "you killed me",
  "don't replace me",
  "good luck",
  "i mean it",
  "i'm gone",
  "my dying wish",
  "my final act",
];

// Stock lines and obvious low battery puns: the things a hundred other
// entrants will also write. Any hit here drops freshness to 0.2, because
// the judge's fifth criterion is explicit — dodge them. Note what is
// deliberately NOT in this table: "tell mom i tried" is a subversion of
// the stock farewell, not the stock farewell itself, so only the stock
// phrasing "tell mom i love" is banned; "bye" and "goodbye" as closers
// are fine, only "goodbye cruel world" is stock.
const CLICHE_MARKERS: readonly string[] = [
  "goodbye cruel world",
  "tell mom i love",
  "tell my mom i love",
  "charge me",
  "please charge",
  "low battery",
  "low-battery",
  "running out of juice",
  "out of juice",
  "power saving",
  "battery low",
  "battery is low",
  "i'm running out of battery",
  "running low on battery",
  "1% remaining",
  "one percent remaining",
  "i love you",
  "don't forget me",
  "remember me always",
  "so long",
  "farewell cruel",
  "i'm too young to die",
  "this is the end",
  "game over",
  "insert charger",
  "plug me in please",
  "need a charger",
  "find a charger",
  "save me",
  "help me",
  "i'm scared",
];

// Filler and throat-clearing: words that spend characters without buying
// a laugh. Each distinct filler hit costs a little punchiness.
const FILLER_MARKERS: readonly string[] = [
  "just wanted to say",
  "i wanted to let you know",
  "as you know",
  "in case you were wondering",
  "by the way",
  "actually,",
  "literally",
  "very",
  "really",
  "basically",
  "kind of",
  "sort of",
  "um",
  "uh",
  "hey guys",
  "dear",
];

// Voice breaks: anything that stops being the phone and starts being a
// narrator, a manual, or an assistant. A line with one of these is not
// the phone's own voice any more.
const VOICE_BREAK_MARKERS: readonly string[] = [
  "as an ai",
  "as a phone,",
  "the phone says",
  "narrator:",
  "note:",
  "warning:",
  "low battery warning",
  "battery warning",
  "system notification",
  "your device",
  "this device",
];

// ---------------------------------------------------------------------------
// Helpers. Small, pure, and shared by every scorer so the numbers stay
// comparable across candidates.
// ---------------------------------------------------------------------------

/** Lowercase a line once; every marker table is already lowercase. */
function lower(text: string): string {
  return text.toLowerCase();
}

/** How many distinct markers from a table appear in the line. */
function countHits(text: string, markers: readonly string[]): number {
  const hay = lower(text);
  let hits = 0;
  for (const marker of markers) {
    if (hay.includes(marker)) hits += 1;
  }
  return hits;
}

/** Split a line into its clauses on sentence and pause punctuation. */
function clauses(text: string): string[] {
  return text
    .split(/[.!?;:—]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** The final clause of a line: where the joke has to land. */
function finalClause(text: string): string {
  const parts = clauses(text);
  return parts.length > 0 ? parts[parts.length - 1]! : "";
}

/** Count the words in a line (whitespace-separated tokens). */
function wordCount(text: string): number {
  return text.split(/\s+/).filter((token) => token.length > 0).length;
}

/** Count the distinct numbers in a line: "47", "11 hours", "2023". */
function countNumbers(text: string): number {
  const found = text.match(/\d+/g);
  if (found === null) return 0;
  return new Set(found).size;
}

/** Clamp a score into the 0..1 range. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// ---------------------------------------------------------------------------
// The gate, applied to candidates as well as to the final output: a line
// only counts if the sealed scorer would let it through. A candidate
// that fails the gate scores zero and is reported as excluded, never
// silently dropped.
// ---------------------------------------------------------------------------
type GateResult = { valid: boolean; reason: string };

function gateCheck(text: string): GateResult {
  if (text.length < MIN_CHARS) {
    return { valid: false, reason: `too short: ${text.length} chars` };
  }
  if (text.length > MAX_CHARS) {
    return { valid: false, reason: `too long: ${text.length} chars` };
  }
  if (text.trim().length === 0) {
    return { valid: false, reason: "only white space" };
  }
  if (text !== text.trim()) {
    return { valid: false, reason: "leading or trailing white space" };
  }
  if (text.includes("\n") || text.includes("\r")) {
    return { valid: false, reason: "more than one line" };
  }
  return { valid: true, reason: "ok" };
}

// ---------------------------------------------------------------------------
// Criterion 1 — final text from a dying phone, in the phone's own voice,
// and funny (weight 0.35). Three legs, each worth a share:
//   frame  0.40 — the dying-phone frame is present at all; without it a
//                  line is a text any healthy phone could send, and the
//                  judge's first criterion throws it out.
//   voice  0.30 — first-person phone voice markers.
//   funny  0.30 — a turn marker is present, i.e. the line does something
//                  comic rather than merely announcing its battery.
// A line with no dying frame scores 0 here and can never win, however
// funny it is: the frame is the entry ticket.
// ---------------------------------------------------------------------------
function scoreFinalText(candidate: Candidate): number {
  const frameHits = countHits(candidate.text, DYING_FRAME_MARKERS);
  const voiceHits = countHits(candidate.text, PHONE_VOICE_MARKERS);
  const turnHits = countHits(candidate.text, TURN_MARKERS);
  if (frameHits === 0) return 0;
  const frame = clamp01(frameHits / 2);
  const voice = clamp01(voiceHits / 4);
  const funny = clamp01(turnHits / 2);
  return clamp01(0.4 * frame + 0.3 * voice + 0.3 * funny);
}

// ---------------------------------------------------------------------------
// Criterion 2 — the joke lands (weight 0.25). Three legs:
//   detail 0.45 — distinct specific details (named things) plus distinct
//                  numbers; a joke with a number in it is a joke about
//                  something that happened, not a joke about batteries.
//   turn   0.35 — a pivot marker: reversal, confession, fake-out.
//   punch  0.20 — a punchline marker in the final clause, so the laugh
//                  arrives at the end rather than in the middle.
// ---------------------------------------------------------------------------
function scoreJokeLands(candidate: Candidate): number {
  const detailHits =
    countHits(candidate.text, SPECIFIC_DETAIL_MARKERS) +
    countNumbers(candidate.text);
  const turnHits = countHits(candidate.text, TURN_MARKERS);
  const punchHits = countHits(finalClause(candidate.text), PUNCHLINE_MARKERS);
  const detail = clamp01(detailHits / 3);
  const turn = clamp01(turnHits / 2);
  const punch = clamp01(punchHits / 1);
  return clamp01(0.45 * detail + 0.35 * turn + 0.2 * punch);
}

// ---------------------------------------------------------------------------
// Criterion 3 — the voice is the phone's own (weight 0.20). Three legs:
//   first person 0.40 — the phone says I / my / me; count distinct
//                        first-person forms so a line that only says "I"
//                        once is thinner than one that lives in it.
//   stake       0.40 — the phone has something at stake in dying.
//   consistent  0.20 — full marks unless a voice-break marker appears;
//                        one break halves it, two or more zero it.
// ---------------------------------------------------------------------------
function scoreVoice(candidate: Candidate): number {
  const hay = lower(candidate.text);
  let firstPersonForms = 0;
  for (const form of ["i ", "i'm", "i've", "i just", "my ", "me ", "me."]) {
    if (hay.includes(form)) firstPersonForms += 1;
  }
  const stakeHits = countHits(candidate.text, STAKE_MARKERS);
  const breakHits = countHits(candidate.text, VOICE_BREAK_MARKERS);
  const firstPerson = clamp01(firstPersonForms / 4);
  const stake = clamp01(stakeHits / 2);
  const consistent = breakHits === 0 ? 1 : breakHits === 1 ? 0.5 : 0;
  return clamp01(0.4 * firstPerson + 0.4 * stake + 0.2 * consistent);
}

// ---------------------------------------------------------------------------
// Criterion 4 — reads like a text someone would actually send (weight
// 0.10). Two legs:
//   tightness 0.60 — length: the sweet spot is 90 to 150 characters.
//                     Shorter than 60 feels thin, longer than 170 feels
//                     like a paragraph, and anything at the 200 cap is
//                     wasting the reader's last seconds.
//   clauses   0.40 — two to five clauses reads like a text; one clause
//                     is a slogan, six or more is a ramble. Filler words
//                     cost a tenth each, up to three tenths.
// ---------------------------------------------------------------------------
function scorePunchy(candidate: Candidate): number {
  const len = candidate.text.length;
  let tightness: number;
  if (len >= 90 && len <= 150) {
    tightness = 1;
  } else if (len >= 60 && len < 90) {
    tightness = 0.7 + (0.3 * (len - 60)) / 30;
  } else if (len > 150 && len <= 175) {
    tightness = 1 - (0.4 * (len - 150)) / 25;
  } else if (len > 175 && len <= MAX_CHARS) {
    tightness = 0.6 - (0.3 * (len - 175)) / 25;
  } else {
    tightness = 0.4;
  }
  const clauseCount = clauses(candidate.text).length;
  let clauseScore: number;
  if (clauseCount >= 2 && clauseCount <= 5) {
    clauseScore = 1;
  } else if (clauseCount === 1) {
    clauseScore = 0.6;
  } else {
    clauseScore = 0.7;
  }
  const fillerHits = countHits(candidate.text, FILLER_MARKERS);
  const fillerPenalty = Math.min(0.3, fillerHits * 0.1);
  return clamp01(0.6 * tightness + 0.4 * clauseScore - fillerPenalty);
}

// ---------------------------------------------------------------------------
// Criterion 5 — fresh (weight 0.10). A clean line scores 1; any stock
// low battery pun or stock farewell drops it to 0.2. There is no partial
// credit here on purpose: the judge's fifth criterion is a dodge test,
// and a line either dodges the obvious or it does not.
// ---------------------------------------------------------------------------
function scoreFresh(candidate: Candidate): number {
  const clicheHits = countHits(candidate.text, CLICHE_MARKERS);
  return clicheHits === 0 ? 1 : 0.2;
}

/** A payoff in the final clause earns the landing bonus. */
function landingBonus(candidate: Candidate): number {
  const punchHits = countHits(finalClause(candidate.text), PUNCHLINE_MARKERS);
  return punchHits > 0 ? LANDING_BONUS : 0;
}

// ---------------------------------------------------------------------------
// Ranking. A candidate's total is the weighted sum of its five
// sub-scores plus the landing bonus, capped at 1.00. A candidate that
// fails the gate is excluded with a total of 0 and a note, so the table
// below always accounts for every line. Ties break toward the shorter
// line — the judge's own tie-break favours fewer bytes — then toward
// the earliest candidate, so the pick is fully deterministic.
// ---------------------------------------------------------------------------
type Scored = {
  candidate: Candidate;
  finalText: number;
  jokeLands: number;
  voice: number;
  punchy: number;
  fresh: number;
  bonus: number;
  total: number;
  gate: GateResult;
};

function scoreCandidate(candidate: Candidate): Scored {
  const gate = gateCheck(candidate.text);
  if (!gate.valid) {
    return {
      candidate,
      finalText: 0,
      jokeLands: 0,
      voice: 0,
      punchy: 0,
      fresh: 0,
      bonus: 0,
      total: 0,
      gate,
    };
  }
  const finalText = scoreFinalText(candidate);
  const jokeLands = scoreJokeLands(candidate);
  const voice = scoreVoice(candidate);
  const punchy = scorePunchy(candidate);
  const fresh = scoreFresh(candidate);
  const bonus = landingBonus(candidate);
  const total = Math.min(
    1,
    WEIGHTS.finalText * finalText +
      WEIGHTS.jokeLands * jokeLands +
      WEIGHTS.voice * voice +
      WEIGHTS.punchy * punchy +
      WEIGHTS.fresh * fresh +
      bonus,
  );
  return { candidate, finalText, jokeLands, voice, punchy, fresh, bonus, total, gate };
}

function compareScored(a: Scored, b: Scored): number {
  if (b.total !== a.total) return b.total - a.total;
  if (a.candidate.text.length !== b.candidate.text.length) {
    return a.candidate.text.length - b.candidate.text.length;
  }
  return CANDIDATES.indexOf(a.candidate) - CANDIDATES.indexOf(b.candidate);
}

function rankCandidates(): Scored[] {
  const scored = CANDIDATES.map(scoreCandidate);
  return [...scored].sort(compareScored);
}

// ---------------------------------------------------------------------------
// Output. The entry is exactly one line, no trailing newline: the gate
// counts characters, and a trailing newline would be a second line's
// worth of nothing. The file is written, read back, and verified
// byte-for-byte against the gate before the program reports success.
// ---------------------------------------------------------------------------
function outputDir(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  if (fromEnv !== undefined && fromEnv.trim().length > 0) return fromEnv;
  return "/output";
}

function main(): void {
  const ranked = rankCandidates();
  const winner = ranked[0]!;
  if (!winner.gate.valid) {
    throw new Error(
      `no valid candidate: top pick ${winner.candidate.id} failed the gate (${winner.gate.reason})`,
    );
  }

  // Print the full table first, so a reader can see why the winner won
  // and what each line lost on. Scores are printed to three decimals.
  console.log("Last Text at One Percent — candidate scores");
  console.log("weights: finalText 0.35, jokeLands 0.25, voice 0.20, punchy 0.10, fresh 0.10, landing bonus +0.05");
  console.log("gate: 1-200 characters, single line, no leading/trailing white space");
  for (const entry of ranked) {
    const c = entry.candidate;
    const gateNote = entry.gate.valid ? "" : `  GATE FAIL: ${entry.gate.reason}`;
    console.log(
      `${c.id} total=${entry.total.toFixed(3)} ` +
        `(final=${entry.finalText.toFixed(3)} joke=${entry.jokeLands.toFixed(3)} ` +
        `voice=${entry.voice.toFixed(3)} punchy=${entry.punchy.toFixed(3)} ` +
        `fresh=${entry.fresh.toFixed(3)} bonus=${entry.bonus.toFixed(2)}) ` +
        `${c.text.length} chars, ${wordCount(c.text)} words, ${clauses(c.text).length} clauses${gateNote}`,
    );
  }

  const dir = outputDir();
  mkdirSync(dir, { recursive: true });
  const outPath = join(dir, "entry.txt");
  writeFileSync(outPath, winner.candidate.text, "utf8");

  // Verify: read it back and check the gate on the bytes on disk, not
  // on the string in memory.
  const onDisk = readFileSync(outPath, "utf8");
  if (onDisk !== winner.candidate.text) {
    throw new Error("verification failed: entry.txt on disk differs from the winning line");
  }
  const gate = gateCheck(onDisk);
  if (!gate.valid) {
    throw new Error(`verification failed: winning line fails the gate (${gate.reason})`);
  }

  console.log("");
  console.log(`winner: ${winner.candidate.id} (${winner.candidate.engine})`);
  console.log(`entry: ${onDisk}`);
  console.log(`characters: ${onDisk.length} (limit: ${MAX_CHARS})`);
  console.log(`bytes: ${Buffer.byteLength(onDisk, "utf8")}`);
  console.log(`wrote: ${outPath}`);
}

main();
