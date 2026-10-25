import { PLAYER_START, type EvidenceId, type EvidenceStatus } from "./content.ts";
import { emptyEvidence, seen } from "./evidenceGate.ts";
import { createPlay, type PlayState } from "./logic.ts";

export const SAVE_KEY = "cronicas-chilango-v1";
export const SETTINGS_KEY = "cronicas-chilango-settings-v1";

export type KeyBindings = {
  left: string;
  right: string;
  interact: string;
  inventory: string;
  evidence: string;
  map: string;
  vision: string;
  pause: string;
};

export type Settings = {
  textSpeed: "lenta" | "media" | "rapida";
  music: number;
  sfx: number;
  reduceMotion: boolean;
  keys: KeyBindings;
};

export const DEFAULT_KEYS: KeyBindings = {
  left: "KeyA",
  right: "KeyD",
  interact: "KeyE",
  inventory: "KeyI",
  evidence: "KeyF",
  map: "KeyM",
  vision: "KeyV",
  pause: "Escape",
};

export const DEFAULT_SETTINGS: Settings = {
  textSpeed: "media",
  music: 0.6,
  sfx: 0.8,
  reduceMotion: false,
  keys: { ...DEFAULT_KEYS },
};

const STATUSES: EvidenceStatus[] = ["PENDIENTE", "OBSERVADA", "INCOMPLETA", "CONTRADICTORIA"];
const KEY_FIELDS: (keyof KeyBindings)[] = [
  "left",
  "right",
  "interact",
  "inventory",
  "evidence",
  "map",
  "vision",
  "pause",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeSettings(raw: unknown): Settings {
  const o = isRecord(raw) ? raw : {};
  const keysIn = isRecord(o.keys) ? o.keys : {};
  const keys = { ...DEFAULT_KEYS };
  for (const field of KEY_FIELDS) {
    const value = keysIn[field];
    if (typeof value === "string" && value.length > 0 && value.length < 32) keys[field] = value;
  }
  const speed = o.textSpeed;
  return {
    textSpeed: speed === "lenta" || speed === "rapida" || speed === "media" ? speed : "media",
    music: clamp01(o.music, DEFAULT_SETTINGS.music),
    sfx: clamp01(o.sfx, DEFAULT_SETTINGS.sfx),
    reduceMotion: o.reduceMotion === true,
    keys,
  };
}

function clamp01(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

export type SaveData = {
  version: 1;
  play: PlayState;
  atEnding: boolean;
};

export function serializePlay(play: PlayState, atEnding: boolean): SaveData {
  return { version: 1, play, atEnding };
}

export function parseSave(raw: unknown): SaveData | null {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.play)) return null;
  const play = raw.play;
  const flags: Record<string, boolean> = {};
  if (isRecord(play.flags)) {
    for (const [key, value] of Object.entries(play.flags)) {
      if (value === true) flags[key] = true;
    }
  }
  const evidences = emptyEvidence();
  if (isRecord(play.evidences)) {
    const bag = play.evidences;
    (Object.keys(evidences) as EvidenceId[]).forEach((id) => {
      const value = bag[id];
      if (typeof value === "string" && STATUSES.includes(value as EvidenceStatus)) {
        evidences[id] = value as EvidenceStatus;
      }
    });
  }
  const player = typeof play.player === "number" && Number.isFinite(play.player) ? play.player : PLAYER_START;
  const decisionCount = play.decisionCount === 1 || flags.decision_final ? 1 : 0;
  const verdict = play.verdict === "REVIEW" || play.verdict === "ALLOW" || play.verdict === "DENY" ? play.verdict : null;
  const next: PlayState = {
    player: Math.min(0.93, Math.max(0.07, player)),
    facing: play.facing === -1 ? -1 : 1,
    vx: 0,
    flags,
    evidences,
    visionOn: play.visionOn === true && !flags.decision_final,
    decisionCount: flags.decision_final ? 1 : decisionCount,
    verdict: flags.decision_final ? "REVIEW" : verdict,
  };
  if (flags.decision_final) next.flags.decision_final = true;
  return { version: 1, play: next, atEnding: raw.atEnding === true || Boolean(flags.decision_final) };
}

export function hasProgress(save: SaveData | null): boolean {
  if (!save) return false;
  if (save.atEnding || save.play.flags.decision_final) return true;
  if (Object.keys(save.play.flags).length > 0) return true;
  return (Object.values(save.play.evidences) as EvidenceStatus[]).some(seen);
}

export function readStorage(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSave(): SaveData | null {
  return parseSave(readStorage(SAVE_KEY));
}

export function loadSettings(): Settings {
  return sanitizeSettings(readStorage(SETTINGS_KEY));
}

export function storeSave(save: SaveData): boolean {
  return writeStorage(SAVE_KEY, save);
}

export function storeSettings(settings: Settings): boolean {
  return writeStorage(SETTINGS_KEY, settings);
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function freshPlay(): PlayState {
  return createPlay();
}
