import {
  INTERACT_RANGE,
  PLAYER_START,
  WALL_MAX,
  WALL_MIN,
  WALK_SPEED,
  type ChapterContent,
  type EvidenceId,
  type HotspotDef,
  type HotspotId,
  dialogueOf,
} from "./content.ts";
import {
  allSeen,
  emptyEvidence,
  evaluateProposal,
  seen,
  statusAfterVision,
  statusOnDiscover,
  type EvidenceMap,
  type GateResult,
  type Proposal,
} from "./evidenceGate.ts";

export type PlayState = {
  player: number;
  facing: 1 | -1;
  vx: number;
  flags: Record<string, boolean>;
  evidences: EvidenceMap;
  visionOn: boolean;
  /** Counts how many times a mission completion was applied. Must stay 0 or 1. */
  decisionCount: number;
  verdict: GateResult["verdict"] | null;
};

export type MoveInput = { left: boolean; right: boolean };

export function createPlay(): PlayState {
  return {
    player: PLAYER_START,
    facing: 1,
    vx: 0,
    flags: {},
    evidences: emptyEvidence(),
    visionOn: false,
    decisionCount: 0,
    verdict: null,
  };
}

export function stepPlayer(state: PlayState, input: MoveInput, dt: number): PlayState {
  const capped = Math.min(Math.max(dt, 0), 0.1);
  let dir = 0;
  if (input.left) dir -= 1;
  if (input.right) dir += 1;
  const vx = dir * WALK_SPEED;
  let player = state.player + vx * capped;
  if (player < WALL_MIN) player = WALL_MIN;
  if (player > WALL_MAX) player = WALL_MAX;
  const facing = dir < 0 ? -1 : dir > 0 ? 1 : state.facing;
  return { ...state, player, vx: player === state.player ? 0 : vx, facing };
}

export function hotspotVisible(state: PlayState, spot: HotspotDef): boolean {
  if (!spot.requires) return true;
  return Boolean(state.flags[spot.requires]);
}

export function nearestHotspot(
  content: ChapterContent,
  state: PlayState,
): HotspotDef | null {
  let best: HotspotDef | null = null;
  let bestDist = INTERACT_RANGE;
  for (const spot of content.hotspots) {
    if (!hotspotVisible(state, spot)) continue;
    const dist = Math.abs(spot.fx - state.player);
    if (dist <= bestDist) {
      best = spot;
      bestDist = dist;
    }
  }
  return best;
}

function withFlag(state: PlayState, flag: string): PlayState {
  if (state.flags[flag]) return state;
  return { ...state, flags: { ...state.flags, [flag]: true } };
}

function discover(state: PlayState, id: EvidenceId): PlayState {
  if (seen(state.evidences[id])) return state;
  return {
    ...state,
    evidences: { ...state.evidences, [id]: statusOnDiscover(id, state.flags.vision_opened === true) },
  };
}

export function applyDialogueAction(state: PlayState, action: string | undefined): PlayState {
  if (!action) return state;
  if (action === "reveal_message") return withFlag(state, "laptop_read");
  if (action === "discover_mensaje") return discover(withFlag(state, "laptop_read"), "mensaje");
  if (action === "discover_registro") return discover(state, "registro");
  if (action === "discover_atlalilco") return discover(state, "atlalilco");
  if (action === "heard_radio") return withFlag(state, "radio_heard");
  if (action === "open_vision") return openVision(state);
  return state;
}

export function openVision(state: PlayState): PlayState {
  const evidences: EvidenceMap = { ...state.evidences };
  (Object.keys(evidences) as EvidenceId[]).forEach((id) => {
    evidences[id] = statusAfterVision(id, evidences[id]);
  });
  return {
    ...state,
    evidences,
    visionOn: true,
    flags: { ...state.flags, vision_opened: true },
  };
}

export function toggleVision(content: ChapterContent, state: PlayState): {
  state: PlayState;
  dialogue: string | null;
  toast?: string;
} {
  if (!state.flags.vision_opened) {
    const any = (Object.values(state.evidences) as EvidenceMap[EvidenceId][]).some(seen);
    if (!any) {
      return { state, dialogue: dialogueOf(content, "vision_empty").text ? "vision_empty" : null };
    }
    return { state, dialogue: "vision_1" };
  }
  return { state: { ...state, visionOn: !state.visionOn }, dialogue: null };
}

export type InteractEffect = {
  state: PlayState;
  dialogue: string | null;
  openDecision?: boolean;
};

export function interact(content: ChapterContent, state: PlayState, id: HotspotId): InteractEffect {
  if (state.flags.decision_final) {
    return { state, dialogue: null };
  }
  if (id === "laptop") {
    if (state.flags.laptop_read) return { state, dialogue: "laptop_again" };
    return { state: withFlag(state, "laptop_read"), dialogue: "laptop_1" };
  }
  if (id === "mensaje") {
    if (!state.flags.laptop_read) return { state, dialogue: null };
    if (seen(state.evidences.mensaje)) return { state, dialogue: "message_again" };
    return { state, dialogue: "message_1" };
  }
  if (id === "registro") {
    if (seen(state.evidences.registro)) return { state, dialogue: "registro_again" };
    return { state, dialogue: "registro_1" };
  }
  if (id === "atlalilco") {
    if (seen(state.evidences.atlalilco)) return { state, dialogue: "atl_again" };
    return { state, dialogue: "atl_1" };
  }
  if (id === "radio") {
    if (state.flags.radio_heard) return { state, dialogue: "radio_again" };
    return { state, dialogue: "radio_1" };
  }
  if (id === "salida") {
    if (!readyToDecide(state)) {
      return { state, dialogue: null, openDecision: false };
    }
    return { state, dialogue: "exit_ready" };
  }
  return { state, dialogue: null };
}

export function missingLabels(_content: ChapterContent, state: PlayState): string[] {
  const missing: string[] = [];
  if (!state.flags.laptop_read) missing.push("revisar la portátil");
  if (!seen(state.evidences.mensaje)) missing.push("el mensaje anómalo");
  if (!seen(state.evidences.registro)) missing.push("el registro local");
  if (!seen(state.evidences.atlalilco)) missing.push("la referencia a Atlalilco");
  if (!state.flags.vision_opened) missing.push("la Visión de Sistema");
  if (missing.length === 0 && !allSeen(state.evidences)) missing.push("evidencias");
  return missing;
}

export function exitBlockedText(content: ChapterContent, state: PlayState): string {
  const missing = missingLabels(content, state);
  return content.exitBlocked.replace("{missing}", missing.join(", "));
}

export function readyToDecide(state: PlayState): boolean {
  return allSeen(state.evidences) && state.flags.vision_opened === true && !state.flags.decision_final;
}

export function currentObjective(content: ChapterContent, state: PlayState): string {
  for (const objective of content.objectives) {
    if (objective.flag && !state.flags[objective.flag]) return objective.label;
    if (objective.evidence && !seen(state.evidences[objective.evidence])) return objective.label;
  }
  if (state.flags.decision_final) return "Capítulo registrado";
  return content.objectives[0]?.label ?? "Investigar";
}

export function confirmProposal(
  state: PlayState,
  proposal: Proposal,
): { state: PlayState; result: GateResult; finalized: boolean } {
  const result = evaluateProposal(proposal, state.evidences, state.flags.vision_opened === true);
  if (state.flags.decision_final || state.decisionCount > 0) {
    return { state, result, finalized: false };
  }
  if (proposal !== "REVISAR" || result.verdict !== "REVIEW" || !readyToDecide(state)) {
    const flag = proposal === "ACEPTAR" ? "accept_attempted" : proposal === "RECHAZAR" ? "reject_attempted" : "review_attempted";
    return { state: withFlag(state, flag), result, finalized: false };
  }
  return {
    state: {
      ...withFlag(state, "decision_final"),
      decisionCount: 1,
      verdict: "REVIEW",
      visionOn: false,
    },
    result,
    finalized: true,
  };
}

export function objectiveDone(content: ChapterContent, state: PlayState, id: string): boolean {
  const objective = content.objectives.find((item) => item.id === id);
  if (!objective) return false;
  if (objective.flag) return Boolean(state.flags[objective.flag]);
  if (objective.evidence) return seen(state.evidences[objective.evidence]);
  return false;
}
