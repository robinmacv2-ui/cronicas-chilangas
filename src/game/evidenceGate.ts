import type { ChapterContent, EvidenceDef, EvidenceId, EvidenceStatus } from "./content.ts";

export type Verdict = "ALLOW" | "DENY" | "REVIEW";
export type Proposal = "ACEPTAR" | "RECHAZAR" | "REVISAR";

export type Requirement = {
  id: string;
  label: string;
  met: boolean;
  /** False when the chapter has no way to check the condition. */
  verifiable: boolean;
};

export type GateResult = {
  proposal: Proposal;
  verdict: Verdict;
  rule?: string;
  reasons: string[];
  requirements: Requirement[];
  /** The gate never runs an action outside the story. */
  executes: false;
};

export type EvidenceMap = Record<EvidenceId, EvidenceStatus>;

export function emptyEvidence(): EvidenceMap {
  return { mensaje: "PENDIENTE", registro: "PENDIENTE", atlalilco: "PENDIENTE" };
}

export function seen(status: EvidenceStatus): boolean {
  return status !== "PENDIENTE";
}

export function allSeen(map: EvidenceMap): boolean {
  return seen(map.mensaje) && seen(map.registro) && seen(map.atlalilco);
}

/**
 * Local narrative gate. ALLOW is not granted for the anomalous message:
 * its origin is unverified. The function does not touch the operating system.
 */
export function evaluateProposal(
  proposal: Proposal,
  evidences: EvidenceMap,
  visionOpened: boolean,
): GateResult {
  const originVerified = false;
  const emitterConfirmed = false;
  const provenanceAuthenticated = false;
  const contradictionOpen = evidences.atlalilco === "CONTRADICTORIA" || visionOpened;
  const requirements: Requirement[] = [
    {
      id: "seen",
      label: "Las tres evidencias fueron consultadas",
      met: allSeen(evidences),
      verifiable: true,
    },
    {
      id: "origin",
      label: "El origen del mensaje está verificado",
      met: originVerified,
      verifiable: false,
    },
    {
      id: "emitter",
      label: "El proceso emisor está confirmado",
      met: emitterConfirmed,
      verifiable: false,
    },
    {
      id: "provenance",
      label: "La referencia a Atlalilco tiene procedencia autenticada",
      met: provenanceAuthenticated,
      verifiable: false,
    },
    {
      id: "consistent",
      label: "No hay una contradicción abierta entre las fichas",
      met: visionOpened ? evidences.atlalilco !== "CONTRADICTORIA" : false,
      verifiable: visionOpened,
    },
  ];

  const base = {
    proposal,
    requirements,
    executes: false as const,
  };

  if (!allSeen(evidences) || !visionOpened) {
    return {
      ...base,
      verdict: "REVIEW",
      reasons: [
        "Faltan datos para sostener cualquier conclusión.",
        "Sin las tres fichas y sin la Visión de Sistema, la compuerta se queda en REVIEW.",
      ],
    };
  }

  if (proposal === "ACEPTAR") {
    return {
      ...base,
      verdict: "REVIEW",
      reasons: [
        "El origen del mensaje no está verificado.",
        "El registro local no confirma un proceso emisor.",
        "La referencia a Atlalilco no tiene procedencia autenticada.",
        contradictionOpen
          ? "Hay una contradicción abierta: el recorte no sostiene una ruta verificada."
          : "La condición de consistencia no se puede dar por cumplida.",
        "Una evidencia incompleta o contradictoria produce REVIEW, no aceptación.",
        "Aunque el veredicto fuera ALLOW, eso no ejecutaría nada fuera de esta partida.",
      ],
    };
  }

  if (proposal === "RECHAZAR") {
    return {
      ...base,
      verdict: "DENY",
      rule: "R-NO-FALSIFY",
      reasons: [
        "Regla R-NO-FALSIFY: la falta de verificación no demuestra que el mensaje sea falso.",
        "La contradicción impide aceptarlo como ruta, pero no prueba que alguien lo haya fabricado.",
        "La propuesta de descartar la alerta no se acepta.",
      ],
    };
  }

  return {
    ...base,
    verdict: "REVIEW",
    reasons: [
      "Los requisitos para ALLOW no se cumplen: el origen sigue sin verificar.",
      "No aplica una regla que autorice declarar el mensaje falso.",
      "Corresponde dejar la alerta en revisión.",
    ],
  };
}

export function statusAfterVision(id: EvidenceId, current: EvidenceStatus): EvidenceStatus {
  if (current === "PENDIENTE") return current;
  if (id === "atlalilco") return "CONTRADICTORIA";
  return "INCOMPLETA";
}

export function statusOnDiscover(id: EvidenceId, visionOpened: boolean): EvidenceStatus {
  if (!visionOpened) return "OBSERVADA";
  return statusAfterVision(id, "OBSERVADA");
}

export function evidenceCopy(content: ChapterContent, id: EvidenceId): EvidenceDef {
  const found = content.evidences.find((item) => item.id === id);
  if (found) return found;
  return {
    id,
    name: id,
    description: "Ficha sin texto.",
    observation: "Estar en la lista no la autentica.",
  };
}
