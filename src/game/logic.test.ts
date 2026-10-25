import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadChapter, loadMetro } from "./content.ts";
import { evaluateProposal } from "./evidenceGate.ts";
import {
  confirmProposal,
  createPlay,
  interact,
  openVision,
  stepPlayer,
} from "./logic.ts";
import { parseSave } from "./save.ts";

const chapter = loadChapter(
  JSON.parse(readFileSync(new URL("./data/chapter_01.json", import.meta.url), "utf8")),
);
const metro = loadMetro(
  JSON.parse(readFileSync(new URL("./data/metro_demo.json", import.meta.url), "utf8")),
);

function readyState() {
  let state = createPlay();
  state = interact(chapter, state, "laptop").state;
  state = interact(chapter, state, "mensaje").state;
  state = { ...state, flags: { ...state.flags, laptop_read: true } };
  const message = interact(chapter, { ...state, evidences: state.evidences }, "mensaje");
  state = message.state;
  // Discover actions are applied when the dialogue node is entered.
  state = {
    ...state,
    evidences: {
      mensaje: "OBSERVADA" as const,
      registro: "OBSERVADA" as const,
      atlalilco: "OBSERVADA" as const,
    },
  };
  state = openVision(state);
  return state;
}

describe("movimiento", () => {
  it("D mueve a la derecha y A a la izquierda", () => {
    const start = { ...createPlay(), player: 0.5 };
    const right = stepPlayer(start, { left: false, right: true }, 0.4);
    const left = stepPlayer(start, { left: true, right: false }, 0.4);
    assert.ok(right.player > start.player, "derecha aumenta x");
    assert.ok(left.player < start.player, "izquierda reduce x");
    assert.ok(right.vx > 0);
    assert.ok(left.vx < 0);
  });

  it("no atraviesa las paredes", () => {
    const leftWall = stepPlayer({ ...createPlay(), player: 0.07 }, { left: true, right: false }, 1);
    const rightWall = stepPlayer({ ...createPlay(), player: 0.93 }, { left: false, right: true }, 1);
    assert.equal(leftWall.player, 0.07);
    assert.equal(rightWall.player, 0.93);
    assert.equal(leftWall.vx, 0);
  });
});

describe("compuerta", () => {
  it("el mensaje inicial, aunque se acepte, termina en REVIEW y no ejecuta nada", () => {
    const state = readyState();
    const { result, finalized } = confirmProposal(state, "ACEPTAR");
    assert.equal(result.verdict, "REVIEW");
    assert.equal(result.executes, false);
    assert.equal(finalized, false);
    assert.equal(result.requirements.find((item) => item.id === "origin")?.met, false);
    assert.equal(result.requirements.find((item) => item.id === "origin")?.verifiable, false);
  });

  it("rechazar el mensaje como falso recibe DENY por la regla explícita", () => {
    const { result, finalized } = confirmProposal(readyState(), "RECHAZAR");
    assert.equal(result.verdict, "DENY");
    assert.equal(result.rule, "R-NO-FALSIFY");
    assert.equal(finalized, false);
    assert.equal(result.executes, false);
  });

  it("REVISAR registra el cierre una sola vez", () => {
    const first = confirmProposal(readyState(), "REVISAR");
    assert.equal(first.finalized, true);
    assert.equal(first.state.verdict, "REVIEW");
    assert.equal(first.state.decisionCount, 1);
    const second = confirmProposal(first.state, "REVISAR");
    assert.equal(second.finalized, false);
    assert.equal(second.state.decisionCount, 1);
  });

  it("no permite cerrar sin las evidencias", () => {
    const { finalized, result } = confirmProposal(createPlay(), "REVISAR");
    assert.equal(finalized, false);
    assert.equal(result.verdict, "REVIEW");
  });

  it("evaluateProposal directo tampoco concede ALLOW", () => {
    const verdicts = (["ACEPTAR", "RECHAZAR", "REVISAR"] as const).map(
      (proposal) => evaluateProposal(proposal, readyState().evidences, true).verdict,
    );
    assert.deepEqual(verdicts, ["REVIEW", "DENY", "REVIEW"]);
  });
});

describe("datos", () => {
  it("el JSON del capítulo trae las tres evidencias y el mensaje", () => {
    assert.equal(chapter.evidences.length, 3);
    assert.ok(chapter.messageLines.some((line) => line.includes("ATLALILCO")));
    assert.ok(chapter.dialogues.radio_2?.text.includes("más lejos"));
    assert.equal(metro.nodes.length, 3);
    assert.match(metro.disclaimer, /ficticio/i);
  });

  it("un JSON vacío no bloquea la carga", () => {
    const empty = loadChapter({});
    assert.equal(empty.hotspots.length, 6);
    assert.equal(empty.evidences.length, 3);
    assert.ok(empty.problem.length > 0);
  });

  it("un guardado ajeno o roto se descarta", () => {
    assert.equal(parseSave(null), null);
    assert.equal(parseSave({ version: 2, play: {} }), null);
    const saved = parseSave({
      version: 1,
      atEnding: false,
      play: { player: 4, flags: { laptop_read: true, ruido: "no" }, evidences: { mensaje: "OBSERVADA" } },
    });
    assert.ok(saved);
    assert.equal(saved?.play.player, 0.93);
    assert.equal(saved?.play.flags.laptop_read, true);
    assert.equal(saved?.play.flags.ruido, undefined);
    assert.equal(saved?.play.evidences.mensaje, "OBSERVADA");
    assert.equal(saved?.play.evidences.registro, "PENDIENTE");
  });

  it("registrar la misma evidencia no duplica el descubrimiento", () => {
    const once = interact(chapter, { ...createPlay(), flags: { laptop_read: true } }, "mensaje");
    const entered = {
      ...once.state,
      evidences: { ...once.state.evidences, mensaje: "OBSERVADA" as const },
    };
    const twice = interact(chapter, entered, "mensaje");
    assert.equal(twice.dialogue, "message_again");
    assert.equal(twice.state.evidences.mensaje, "OBSERVADA");
  });
});
