export type EvidenceId = "mensaje" | "registro" | "atlalilco";
export type EvidenceStatus = "PENDIENTE" | "OBSERVADA" | "INCOMPLETA" | "CONTRADICTORIA";
export type HotspotId = "radio" | "mensaje" | "laptop" | "salida" | "registro" | "atlalilco";

export type DialogueChoice = { label: string; next?: string; action?: string };
export type DialogueNode = {
  speaker: string;
  text: string;
  next?: string;
  action?: string;
  choices?: DialogueChoice[];
};

export type EvidenceDef = {
  id: EvidenceId;
  name: string;
  description: string;
  observation: string;
};

export type HotspotDef = {
  id: HotspotId;
  fx: number;
  fy: number;
  label: string;
  hint: string;
  requires?: string;
};

export type ObjectiveDef = {
  id: string;
  label: string;
  flag?: string;
  evidence?: EvidenceId;
};

export type ChapterContent = {
  id: string;
  title: string;
  name: string;
  place: string;
  placeNote: string;
  protagonist: { name: string; age: number; origin: string; blurb: string };
  antagonist: { name: string; blurb: string };
  problem: string;
  messageLines: string[];
  exitBlocked: string;
  ending: { kicker: string; line: string; tail: string };
  hotspots: HotspotDef[];
  inventory: { id: string; name: string; description: string }[];
  evidences: EvidenceDef[];
  objectives: ObjectiveDef[];
  dialogues: Record<string, DialogueNode>;
};

export type MetroNode = { id: string; name: string; detail: string; state: string };
export type MetroContent = {
  disclaimer: string;
  nodes: MetroNode[];
  links: { from: string; to: string; open: boolean; label: string }[];
};

const EVIDENCE_IDS: EvidenceId[] = ["mensaje", "registro", "atlalilco"];

const FALLBACK_DIALOGUE: DialogueNode = {
  speaker: "Teo",
  text: "Falta un texto en los datos del capítulo. Puedo seguir sin él.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function loadChapter(raw: unknown): ChapterContent {
  const o = isRecord(raw) ? raw : {};
  const protagonist = isRecord(o.protagonist) ? o.protagonist : {};
  const antagonist = isRecord(o.antagonist) ? o.antagonist : {};
  const ending = isRecord(o.ending) ? o.ending : {};
  const evidencesIn = Array.isArray(o.evidences) ? o.evidences : [];
  const evidences: EvidenceDef[] = EVIDENCE_IDS.map((id) => {
    const found = evidencesIn.find((item) => isRecord(item) && item.id === id);
    const row = isRecord(found) ? found : {};
    return {
      id,
      name: str(row.name, id),
      description: str(row.description, "Descripción no disponible en los datos."),
      observation: str(row.observation, "Esta ficha no prueba autenticidad por estar en la lista."),
    };
  });

  const hotspotIn = Array.isArray(o.hotspots) ? o.hotspots : [];
  const fallbackFx: Record<HotspotId, [number, number, string, string, string?]> = {
    radio: [0.14, 0.62, "Radio de la fonda", "Escuchar", undefined],
    mensaje: [0.3, 0.46, "Mensaje anómalo", "Leer el mensaje", "laptop_read"],
    laptop: [0.42, 0.58, "Computadora portátil", "Revisar la portátil", undefined],
    salida: [0.57, 0.52, "Salida de la fonda", "Mirar la puerta", undefined],
    registro: [0.73, 0.58, "Registro local", "Consultar la bitácora", undefined],
    atlalilco: [0.85, 0.48, "Referencia a Atlalilco", "Examinar el recorte", undefined],
  };
  const hotspots = (Object.keys(fallbackFx) as HotspotId[]).map((id) => {
    const found = hotspotIn.find((item) => isRecord(item) && item.id === id);
    const row = isRecord(found) ? found : {};
    const fb = fallbackFx[id];
    const requires = typeof row.requires === "string" ? row.requires : fb[4];
    return {
      id,
      fx: num(row.fx, fb[0]),
      fy: num(row.fy, fb[1]),
      label: str(row.label, fb[2]),
      hint: str(row.hint, fb[3]),
      ...(requires ? { requires } : {}),
    };
  });

  const dialogues: Record<string, DialogueNode> = {};
  if (isRecord(o.dialogues)) {
    for (const [id, node] of Object.entries(o.dialogues)) {
      if (!isRecord(node)) continue;
      const choices = Array.isArray(node.choices)
        ? node.choices
            .filter(isRecord)
            .map((choice) => ({
              label: str(choice.label, "Seguir"),
              ...(typeof choice.next === "string" ? { next: choice.next } : {}),
              ...(typeof choice.action === "string" ? { action: choice.action } : {}),
            }))
        : undefined;
      dialogues[id] = {
        speaker: str(node.speaker, "Teo"),
        text: str(node.text, FALLBACK_DIALOGUE.text),
        ...(typeof node.next === "string" ? { next: node.next } : {}),
        ...(typeof node.action === "string" ? { action: node.action } : {}),
        ...(choices && choices.length > 0 ? { choices } : {}),
      };
    }
  }

  const objectivesIn = Array.isArray(o.objectives) ? o.objectives : [];
  const objectives: ObjectiveDef[] = objectivesIn.filter(isRecord).map((row, index) => ({
    id: str(row.id, `obj-${index}`),
    label: str(row.label, "Objetivo"),
    ...(typeof row.flag === "string" ? { flag: row.flag } : {}),
    ...(EVIDENCE_IDS.includes(row.evidence as EvidenceId)
      ? { evidence: row.evidence as EvidenceId }
      : {}),
  }));

  const inventoryIn = Array.isArray(o.inventory) ? o.inventory : [];
  const inventory = inventoryIn.filter(isRecord).map((row, index) => ({
    id: str(row.id, `item-${index}`),
    name: str(row.name, "Objeto"),
    description: str(row.description, ""),
  }));

  const lines = Array.isArray(o.messageLines)
    ? o.messageLines.filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    : [];

  return {
    id: str(o.id, "chapter_01"),
    title: str(o.title, "Capítulo 1"),
    name: str(o.name, "El mensaje"),
    place: str(o.place, "Fonda"),
    placeNote: str(o.placeNote, "Lugar ficticio."),
    protagonist: {
      name: str(protagonist.name, "Teo"),
      age: num(protagonist.age, 29),
      origin: str(protagonist.origin, "Iztapalapa"),
      blurb: str(protagonist.blurb, ""),
    },
    antagonist: {
      name: str(antagonist.name, "Don Último"),
      blurb: str(antagonist.blurb, ""),
    },
    problem: str(o.problem, "¿Qué se hace con el mensaje?"),
    messageLines: lines.length > 0 ? lines : ["YOUR GOVERNANCE MODEL IS INCOMPLETE."],
    exitBlocked: str(o.exitBlocked, "Aún falta: {missing}."),
    ending: {
      kicker: str(ending.kicker, "DECISIÓN REGISTRADA: REVIEW"),
      line: str(ending.line, "ORIGEN NO VERIFICADO"),
      tail: str(ending.tail, "LA INVESTIGACIÓN CONTINÚA…"),
    },
    hotspots,
    inventory,
    evidences,
    objectives,
    dialogues,
  };
}

export function loadMetro(raw: unknown): MetroContent {
  const o = isRecord(raw) ? raw : {};
  const nodes = Array.isArray(o.nodes)
    ? o.nodes.filter(isRecord).map((node) => ({
        id: str(node.id, "nodo"),
        name: str(node.name, "NODO"),
        detail: str(node.detail, ""),
        state: str(node.state, "bloqueado"),
      }))
    : [];
  const links = Array.isArray(o.links)
    ? o.links.filter(isRecord).map((link) => ({
        from: str(link.from, ""),
        to: str(link.to, ""),
        open: link.open === true,
        label: str(link.label, ""),
      }))
    : [];
  return {
    disclaimer: str(
      o.disclaimer,
      "Mapa ficticio de la demo. No representa la red oficial del Metro.",
    ),
    nodes:
      nodes.length > 0
        ? nodes
        : [
            { id: "centro", name: "CENTRO", detail: "Estás aquí.", state: "actual" },
            { id: "atlalilco", name: "ATLALILCO", detail: "Bloqueado.", state: "bloqueado" },
            {
              id: "desconocido",
              name: "DESTINO DESCONOCIDO",
              detail: "Bloqueado.",
              state: "bloqueado",
            },
          ],
    links,
  };
}

export function dialogueOf(content: ChapterContent, id: string): DialogueNode {
  return content.dialogues[id] ?? FALLBACK_DIALOGUE;
}

export const WALL_MIN = 0.07;
export const WALL_MAX = 0.93;
export const WALK_SPEED = 0.34;
export const INTERACT_RANGE = 0.065;
export const PLAYER_START = 0.2;
