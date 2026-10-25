import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Backpack,
  Eye,
  FileSearch,
  Map as MapIcon,
  Pause,
  RotateCcw,
} from "lucide-react";
import menuBg from "@/assets/game/menu-metro.jpg";
import donUrl from "@/assets/game/don-ultimo.png";
import teoUrl from "@/assets/game/teo/idle-2.png";
import { dialogueOf, type HotspotId } from "@/game/content";
import { chapter, metro } from "@/game/instance";
import { evaluateProposal, seen, type Proposal } from "@/game/evidenceGate";
import {
  applyDialogueAction,
  confirmProposal,
  createPlay,
  currentObjective,
  exitBlockedText,
  interact,
  nearestHotspot,
  readyToDecide,
  stepPlayer,
  toggleVision,
  type PlayState,
} from "@/game/logic";
import {
  clearSave,
  hasProgress,
  loadSave,
  loadSettings,
  serializePlay,
  storeSave,
  storeSettings,
  DEFAULT_KEYS,
  type KeyBindings,
  type Settings,
} from "@/game/save";
import { blip, setMusicGain, unlockAudio } from "@/game/audio";
import { Stage, type RenderModel } from "@/components/game/Stage";

type View = "menu" | "credits" | "play" | "ending";
type Panel =
  | "none"
  | "dialogue"
  | "evidence"
  | "inventory"
  | "map"
  | "pause"
  | "confirm-menu"
  | "options"
  | "decision"
  | "nosave"
  | "confirm-new";

type CustomLine = { speaker: string; text: string } | null;

const KEY_FIELDS: { id: keyof KeyBindings; label: string }[] = [
  { id: "left", label: "Izquierda" },
  { id: "right", label: "Derecha" },
  { id: "interact", label: "Interactuar" },
  { id: "inventory", label: "Inventario" },
  { id: "evidence", label: "Evidencias" },
  { id: "map", label: "Mapa" },
  { id: "vision", label: "Visión de Sistema" },
  { id: "pause", label: "Pausa" },
];

function keyName(code: string): string {
  const names: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Space: "Espacio",
    Escape: "Esc",
    Enter: "Enter",
  };
  if (names[code]) return names[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

function statusClass(status: string): string {
  if (status === "CONTRADICTORIA") return "bg-coral text-paper";
  if (status === "INCOMPLETA") return "bg-amber text-ink";
  if (status === "OBSERVADA") return "bg-paper text-ink";
  return "bg-navy text-paper";
}

declare global {
  interface Window {
    __controlsTest?: {
      getX: () => number;
      getSpeed: () => number;
      getYaw: () => number;
      setKeys: (codes: string[]) => void;
    };
  }
}

export function GameApp() {
  const [view, setView] = useState<View>("menu");
  const [panel, setPanel] = useState<Panel>("none");
  const [optionsReturn, setOptionsReturn] = useState<"menu" | "pause">("menu");
  const [play, setPlay] = useState<PlayState>(() => createPlay());
  const [settings, setSettings] = useState<Settings>(() => ({
    ...loadSettingsSafe(),
  }));
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [custom, setCustom] = useState<CustomLine>(null);
  const [shown, setShown] = useState(0);
  const [pending, setPending] = useState<Proposal | null>(null);
  const [gateNote, setGateNote] = useState<string[] | null>(null);
  const [gateVerdict, setGateVerdict] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [listening, setListening] = useState<keyof KeyBindings | null>(null);
  const [nearLabel, setNearLabel] = useState("");

  const playRef = useRef(play);
  const panelRef = useRef(panel);
  const viewRef = useRef(view);
  const settingsRef = useRef(settings);
  const nodeRef = useRef<string | null>(null);
  const customRef = useRef<CustomLine>(null);
  const shownRef = useRef(0);
  const nearId = useRef<string | null>(null);
  const listeningRef = useRef<keyof KeyBindings | null>(null);
  const pendingRef = useRef<Proposal | null>(null);
  const gateRef = useRef<string[] | null>(null);
  const inputRef = useRef({ held: new Set<string>(), injected: null as Set<string> | null });
  const touchRef = useRef({ left: false, right: false });
  const modelRef = useRef<RenderModel>({
    player: play.player,
    facing: 1,
    moving: false,
    vision: false,
    laptopRead: false,
    found: { mensaje: false, registro: false, atlalilco: false },
    reduceMotion: false,
    hint: "",
    hotspots: chapter.hotspots,
    messagePreview: "MODELO INCOMPLETO\n23:17 · ATLALILCO\nDESTINO UNKNOWN",
  });

  useEffect(() => {
    playRef.current = play;
  }, [play]);
  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    settingsRef.current = settings;
    modelRef.current.reduceMotion = settings.reduceMotion;
    setMusicGain(settings.music);
    storeSettings(settings);
  }, [settings]);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);
  useEffect(() => {
    customRef.current = custom;
  }, [custom]);

  useEffect(() => {
    const model = modelRef.current;
    model.vision = play.visionOn && view === "play";
    model.laptopRead = Boolean(play.flags.laptop_read);
    model.found = {
      mensaje: seen(play.evidences.mensaje),
      registro: seen(play.evidences.registro),
      atlalilco: seen(play.evidences.atlalilco),
    };
  }, [play, view]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  const line = custom ?? (nodeId ? dialogueOf(chapter, nodeId) : null);

  useEffect(() => {
    if (panel !== "dialogue" || !line) return;
    if (settings.reduceMotion || settings.textSpeed === "rapida") {
      setShown(line.text.length);
      return;
    }
    const cps = settings.textSpeed === "lenta" ? 26 : 48;
    const id = window.setInterval(() => {
      setShown((count) => (count >= line.text.length ? count : count + 1));
    }, 1000 / cps);
    return () => window.clearInterval(id);
  }, [panel, line, settings.reduceMotion, settings.textSpeed]);

  const openPanel = useCallback((next: Panel) => {
    panelRef.current = next;
    setPanel(next);
  }, []);

  const go = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const commitPlay = useCallback((next: PlayState) => {
    playRef.current = next;
    setPlay(next);
  }, []);

  const enterNode = useCallback(
    (id: string) => {
      const node = dialogueOf(chapter, id);
      const next = applyDialogueAction(playRef.current, node.action);
      commitPlay(next);
      setCustom(null);
      customRef.current = null;
      nodeRef.current = id;
      setNodeId(id);
      setShown(0);
      openPanel("dialogue");
      blip(settingsRef.current.sfx, 520);
    },
    [commitPlay, openPanel],
  );

  const closeDialogue = useCallback(() => {
    nodeRef.current = null;
    setNodeId(null);
    setCustom(null);
    customRef.current = null;
    openPanel("none");
  }, [openPanel]);

  const advance = useCallback(() => {
    if (customRef.current) {
      if (shownRef.current < customRef.current.text.length) {
        setShown(customRef.current.text.length);
        return;
      }
      closeDialogue();
      return;
    }
    const id = nodeRef.current;
    if (!id) return;
    const node = dialogueOf(chapter, id);
    if (shownRef.current < node.text.length) {
      setShown(node.text.length);
      return;
    }
    if (node.choices && node.choices.length > 0) return;
    if (node.next) enterNode(node.next);
    else closeDialogue();
  }, [closeDialogue, enterNode]);

  const choose = useCallback(
    (choice: { label: string; next?: string; action?: string }) => {
      blip(settingsRef.current.sfx, 740);
      if (choice.action === "close") {
        closeDialogue();
        return;
      }
      if (choice.action === "decision") {
        closeDialogue();
        setPending(null);
        setGateNote(null);
        setGateVerdict(null);
        openPanel("decision");
        return;
      }
      if (choice.next) enterNode(choice.next);
    },
    [closeDialogue, enterNode, openPanel],
  );

  const doInteract = useCallback(() => {
    if (viewRef.current !== "play" || panelRef.current !== "none") return;
    if (playRef.current.flags.decision_final) return;
    const spot = nearestHotspot(chapter, playRef.current);
    if (!spot) return;
    blip(settingsRef.current.sfx, 480);
    if (spot.id === "salida" && !readyToDecide(playRef.current)) {
      const text = exitBlockedText(chapter, playRef.current);
      const bubble = { speaker: "Teo", text };
      customRef.current = bubble;
      setCustom(bubble);
      nodeRef.current = null;
      setNodeId(null);
      setShown(0);
      openPanel("dialogue");
      return;
    }
    const effect = interact(chapter, playRef.current, spot.id as HotspotId);
    playRef.current = effect.state;
    if (effect.dialogue) enterNode(effect.dialogue);
    else commitPlay(effect.state);
  }, [commitPlay, enterNode, openPanel]);

  const onVision = useCallback(() => {
    if (panelRef.current !== "none" && panelRef.current !== "pause") return;
    const result = toggleVision(chapter, playRef.current);
    playRef.current = result.state;
    if (result.dialogue) enterNode(result.dialogue);
    else {
      commitPlay(result.state);
      blip(settingsRef.current.sfx, result.state.visionOn ? 880 : 320);
    }
  }, [commitPlay, enterNode]);

  const saveNow = useCallback((silent = false) => {
    const atEnding = viewRef.current === "ending" || Boolean(playRef.current.flags.decision_final);
    const ok = storeSave(serializePlay(playRef.current, atEnding));
    if (!silent) setToast(ok ? "Partida guardada en este navegador." : "No se pudo guardar la partida.");
    blip(settingsRef.current.sfx, 600);
    return ok;
  }, []);

  const startFresh = useCallback(() => {
    clearSave();
    const next = createPlay();
    commitPlay(next);
    modelRef.current.player = next.player;
    modelRef.current.facing = 1;
    setPending(null);
    setGateNote(null);
    setGateVerdict(null);
    closeDialogue();
    openPanel("none");
    go("play");
    unlockAudio();
    setMusicGain(settingsRef.current.music);
  }, [closeDialogue, commitPlay, go, openPanel]);

  const continueGame = useCallback(() => {
    const save = loadSave();
    if (!save || !hasProgress(save)) {
      openPanel("nosave");
      return;
    }
    commitPlay(save.play);
    modelRef.current.player = save.play.player;
    modelRef.current.facing = save.play.facing;
    openPanel("none");
    go(save.atEnding ? "ending" : "play");
    unlockAudio();
    setMusicGain(settingsRef.current.music);
  }, [commitPlay, go, openPanel]);

  const onFrame = useCallback((dt: number) => {
    const canMove = viewRef.current === "play" && panelRef.current === "none" && !playRef.current.flags.decision_final;
    if (canMove) {
      const source = inputRef.current.injected ?? inputRef.current.held;
      const bind = settingsRef.current.keys;
      const left = source.has(bind.left) || source.has("ArrowLeft") || touchRef.current.left;
      const right = source.has(bind.right) || source.has("ArrowRight") || touchRef.current.right;
      const next = stepPlayer(playRef.current, { left, right }, dt);
      playRef.current = next;
    } else if (playRef.current.vx !== 0) {
      playRef.current = { ...playRef.current, vx: 0 };
    }
    const near =
      viewRef.current === "play" && panelRef.current === "none"
        ? nearestHotspot(chapter, playRef.current)
        : null;
    const model = modelRef.current;
    model.player = playRef.current.player;
    model.facing = playRef.current.facing;
    model.moving = Math.abs(playRef.current.vx) > 0.01;
    model.hint = near?.hint ?? "";
    model.vision = playRef.current.visionOn && viewRef.current === "play";
    const id = near?.id ?? null;
    if (id !== nearId.current) {
      nearId.current = id;
      setNearLabel(near?.label ?? "");
    }
  }, []);

  useEffect(() => {
    window.__controlsTest = {
      getX: () => playRef.current.player,
      getSpeed: () => playRef.current.vx,
      getYaw: () => 0,
      setKeys: (codes: string[]) => {
        inputRef.current.injected = codes.length > 0 ? new Set(codes) : null;
      },
    };
    const down = (event: KeyboardEvent) => {
      if (listeningRef.current) {
        event.preventDefault();
        const field = listeningRef.current;
        const duplicate = KEY_FIELDS.some(
          (item) => item.id !== field && settingsRef.current.keys[item.id] === event.code,
        );
        if (duplicate) {
          setToast("Esa tecla ya abre otra acción.");
        } else {
          setSettings((current) => ({ ...current, keys: { ...current.keys, [field]: event.code } }));
        }
        setListening(null);
        listeningRef.current = null;
        return;
      }
      inputRef.current.held.add(event.code);
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      if (event.repeat) return;
      const bind = settingsRef.current.keys;
      if (viewRef.current === "play" && panelRef.current === "dialogue") {
        if (event.code === bind.interact || event.code === "Enter" || event.code === "Space") {
          event.preventDefault();
          advance();
        }
        if (event.code === "Escape") closeDialogue();
        return;
      }
      if (event.code === "Escape" || event.code === bind.pause) {
        event.preventDefault();
        if (viewRef.current !== "play") {
          if (panelRef.current === "options" || panelRef.current === "nosave" || panelRef.current === "confirm-new") {
            openPanel("none");
          }
          if (viewRef.current === "credits") go("menu");
          return;
        }
        if (panelRef.current === "decision" && (gateRef.current || pendingRef.current)) {
          setGateNote(null);
          setGateVerdict(null);
          setPending(null);
          return;
        }
        if (panelRef.current === "options") {
          openPanel("pause");
          return;
        }
        if (panelRef.current === "confirm-menu") {
          openPanel("pause");
          return;
        }
        if (panelRef.current !== "none") {
          openPanel("none");
          return;
        }
        openPanel("pause");
        return;
      }
      if (viewRef.current !== "play" || panelRef.current !== "none") return;
      if (event.code === bind.interact) doInteract();
      if (event.code === bind.inventory) openPanel("inventory");
      if (event.code === bind.evidence) openPanel("evidence");
      if (event.code === bind.map) openPanel("map");
      if (event.code === bind.vision) onVision();
    };
    const up = (event: KeyboardEvent) => {
      inputRef.current.held.delete(event.code);
    };
    const blur = () => {
      inputRef.current.held.clear();
      touchRef.current.left = false;
      touchRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [advance, closeDialogue, doInteract, go, onVision, openPanel]);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    gateRef.current = gateNote;
  }, [gateNote]);

  const dialogueChoices = !custom && nodeId ? (dialogueOf(chapter, nodeId).choices ?? []) : [];
  const checklist = evaluateProposal(
    pending ?? "REVISAR",
    play.evidences,
    play.flags.vision_opened === true,
  );

  const foundCount = (["mensaje", "registro", "atlalilco"] as const).filter((id) =>
    seen(play.evidences[id]),
  ).length;

  return (
    <main className="game-root font-body" onPointerDown={() => unlockAudio()}>
      {view === "menu" || view === "credits" ? (
        <MenuBackdrop />
      ) : (
        <Stage modelRef={modelRef} onFrame={onFrame} />
      )}

      {view === "menu" && panel !== "options" && panel !== "nosave" && panel !== "confirm-new" ? (
        <section className="absolute inset-0 flex items-end p-4 sm:items-center sm:p-10">
          <div className="panel-card max-h-full w-full max-w-xl overflow-y-auto p-5 sm:p-8">
            <p className="font-display text-xs tracking-widest text-amber">PROTOTIPO 0.1 · SIMULACIÓN LOCAL</p>
            <h1 className="mt-2 font-display text-4xl leading-none text-paper sm:text-6xl">
              CRÓNICAS DE UN CHILANGO
            </h1>
            <p className="mt-3 text-lg text-amber">ROMEO-HYDRA: EL ÚLTIMO TRANSBORDO</p>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
              Iztapalapa, un cierre de fonda y un mensaje que todavía no tiene permiso de ser verdad.
            </p>
            <div className="mt-6 grid gap-3">
              <button className="comic-btn" onClick={() => (hasProgress(loadSave()) ? openPanel("confirm-new") : startFresh())}>
                Nueva partida
              </button>
              <button className="comic-btn comic-btn-ghost" onClick={continueGame}>
                Continuar
              </button>
              <button
                className="comic-btn comic-btn-ghost"
                onClick={() => {
                  setOptionsReturn("menu");
                  openPanel("options");
                }}
              >
                Opciones
              </button>
              <button className="comic-btn comic-btn-ghost" onClick={() => go("credits")}>
                Créditos
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {view === "credits" ? <Credits onBack={() => go("menu")} /> : null}

      {view === "play" && panel === "none" ? (
        <>
          <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
            <div className="pointer-events-auto hud-chip max-w-xl">
              <p className="font-display text-xs tracking-wide text-amber">
                {chapter.title.toUpperCase()} · {chapter.name.toUpperCase()}
              </p>
              <p className="text-sm text-paper">{currentObjective(chapter, play)}</p>
            </div>
            <div className="pointer-events-auto hud-chip">
              <p className="font-display text-xs text-cyan">EVIDENCIAS {foundCount}/3</p>
              <p className="text-xs text-muted">Ninguna ficha se autentica sola</p>
            </div>
          </header>
          <p className="sr-only" aria-live="polite">
            {nearLabel ? `Cerca: ${nearLabel}` : ""}
          </p>
          <nav className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3 sm:p-4">
            <div className="flex gap-2 md:hidden">
              <HoldButton label="Izquierda" onHold={(down) => (touchRef.current.left = down)} />
              <HoldButton label="Derecha" onHold={(down) => (touchRef.current.right = down)} />
              <button className="comic-btn comic-btn-cyan flex-1" onClick={doInteract}>
                Interactuar
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              <HudButton icon={<Backpack size={18} />} label="Inventario" onClick={() => openPanel("inventory")} />
              <HudButton icon={<FileSearch size={18} />} label="Evidencias" onClick={() => openPanel("evidence")} />
              <HudButton icon={<MapIcon size={18} />} label="Mapa" onClick={() => openPanel("map")} />
              <HudButton
                icon={<Eye size={18} />}
                label={play.visionOn ? "Ocultar visión" : "Visión"}
                onClick={onVision}
              />
              <HudButton icon={<Pause size={18} />} label="Pausa" onClick={() => openPanel("pause")} />
            </div>
          </nav>
        </>
      ) : null}

      {view === "ending" ? (
        <section className="scrim absolute inset-0 flex items-center justify-center p-4">
          <div className="panel-card max-w-xl p-6 text-center sm:p-10">
            <p className="font-display text-sm text-amber">{chapter.ending.kicker}</p>
            <h2 className="mt-3 font-display text-3xl text-paper sm:text-5xl">{chapter.ending.line}</h2>
            <p className="mt-4 font-display text-xl text-cyan">{chapter.ending.tail}</p>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              La compuerta no aceptó el mensaje y tampoco lo declaró falso. No se ejecutó ninguna acción fuera
              de esta partida.
            </p>
            <div className="mt-6 grid gap-3">
              <button className="comic-btn" onClick={startFresh}>
                <span className="inline-flex items-center justify-center gap-2">
                  <RotateCcw size={18} /> Reiniciar capítulo
                </span>
              </button>
              <button className="comic-btn comic-btn-ghost" onClick={() => go("menu")}>
                Menú principal
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {panel === "dialogue" && line ? (
        <div className="absolute inset-x-0 bottom-0 z-20 p-3 sm:p-5">
          <div className="panel-card w-full p-4 text-left sm:p-5" onClick={advance} role="button" tabIndex={0}>
            <div className="flex gap-3">
              <Portrait speaker={line.speaker} />
              <div className="min-w-0 flex-1">
                <p className="font-display text-xs tracking-wide text-amber">{line.speaker.toUpperCase()}</p>
                <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed text-paper">
                  {line.text.slice(0, shown)}
                  {shown < line.text.length ? "▌" : ""}
                </p>
              </div>
            </div>
            {dialogueChoices.length > 0 && shown >= line.text.length ? (
              <div className="mt-4 grid gap-2">
                {dialogueChoices.map((choice) => (
                  <button
                    key={choice.label}
                    className="comic-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      choose(choice);
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted">E o clic para seguir · Esc cierra</p>
            )}
          </div>
        </div>
      ) : null}

      {panel === "evidence" ? (
        <Overlay onClose={() => openPanel("none")} title="Evidencias">
          <p className="text-sm text-muted">
            Aparecer en esta lista no demuestra que una ficha sea auténtica. Los estados describen lo que se
            pudo observar, no un permiso.
          </p>
          <ul className="mt-4 grid gap-3">
            {chapter.evidences.filter((item) => seen(play.evidences[item.id])).length === 0 ? (
              <li className="rounded-xl border border-navy p-4 text-sm">Todavía no registras evidencias.</li>
            ) : (
              chapter.evidences
                .filter((item) => seen(play.evidences[item.id]))
                .map((item) => (
                  <li key={item.id} className="rounded-xl border border-navy p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-lg">{item.name}</h3>
                      <span className={`rounded-full px-3 py-1 font-display text-xs ${statusClass(play.evidences[item.id])}`}>
                        {play.evidences[item.id]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed">{item.description}</p>
                    <p className="mt-2 text-sm text-amber">{item.observation}</p>
                  </li>
                ))
            )}
          </ul>
        </Overlay>
      ) : null}

      {panel === "inventory" ? (
        <Overlay onClose={() => openPanel("none")} title="Inventario">
          <ul className="grid gap-3">
            {chapter.inventory.map((item) => (
              <li key={item.id} className="rounded-xl border border-navy p-4">
                <h3 className="font-display text-lg">{item.name}</h3>
                <p className="mt-1 text-sm text-muted">{item.description}</p>
              </li>
            ))}
          </ul>
        </Overlay>
      ) : null}

      {panel === "map" ? (
        <Overlay onClose={() => openPanel("none")} title="Mapa de la demo">
          <p className="text-sm text-amber">{metro.disclaimer}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {metro.nodes.map((node) => (
              <article key={node.id} className="rounded-xl border border-navy p-4">
                <p className="font-display text-xs text-cyan">{node.state.toUpperCase()}</p>
                <h3 className="mt-1 font-display text-xl">{node.name}</h3>
                <p className="mt-2 text-sm text-muted">{node.detail}</p>
              </article>
            ))}
          </div>
          <ul className="mt-4 grid gap-2 text-sm">
            {metro.links.map((link) => (
              <li key={`${link.from}-${link.to}`} className="rounded-lg bg-navy px-3 py-2">
                {link.from.toUpperCase()} → {link.to.toUpperCase()} · {link.open ? "abierto" : "bloqueado"} · {link.label}
              </li>
            ))}
          </ul>
        </Overlay>
      ) : null}

      {panel === "pause" ? (
        <Overlay bare>
          <h2 className="font-display text-3xl">Pausa</h2>
          <div className="mt-5 grid gap-3">
            <button className="comic-btn" onClick={() => openPanel("none")}>
              Reanudar
            </button>
            <button
              className="comic-btn comic-btn-ghost"
              onClick={() => {
                setOptionsReturn("pause");
                openPanel("options");
              }}
            >
              Opciones
            </button>
            <button className="comic-btn comic-btn-ghost" onClick={() => saveNow(false)}>
              Guardar partida
            </button>
            <button className="comic-btn comic-btn-coral" onClick={() => openPanel("confirm-menu")}>
              Volver al menú
            </button>
          </div>
        </Overlay>
      ) : null}

      {panel === "confirm-menu" ? (
        <Overlay bare>
          <h2 className="font-display text-2xl">¿Volver al menú?</h2>
          <p className="mt-2 text-sm text-muted">
            Si no guardas, Continuar volverá a la última partida escrita en este navegador, no a lo que acaba de pasar.
          </p>
          <div className="mt-5 grid gap-3">
            <button
              className="comic-btn"
              onClick={() => {
                saveNow(true);
                openPanel("none");
                go("menu");
                setToast("Partida guardada.");
              }}
            >
              Guardar y salir
            </button>
            <button
              className="comic-btn comic-btn-coral"
              onClick={() => {
                openPanel("none");
                go("menu");
              }}
            >
              Salir sin guardar
            </button>
            <button className="comic-btn comic-btn-ghost" onClick={() => openPanel("pause")}>
              Cancelar
            </button>
          </div>
        </Overlay>
      ) : null}

      {panel === "decision" ? (
        <Overlay
          title="Decisión"
          onClose={() => {
            setPending(null);
            setGateNote(null);
            setGateVerdict(null);
            openPanel("none");
          }}
        >
          <p className="text-base leading-relaxed">{chapter.problem}</p>
          <p className="mt-2 text-sm text-muted">
            Esta evaluación no enciende trenes, no abre conexiones y no ejecuta nada fuera de la partida. ALLOW, si
            algún día aparece, tampoco significaría ejecutar.
          </p>
          <ul className="mt-4 grid gap-2">
            {checklist.requirements.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg bg-navy px-3 py-2 text-sm">
                <span>{item.label}</span>
                <span className="font-display text-xs text-amber">
                  {!item.verifiable ? "NO VERIFICABLE" : item.met ? "CUMPLE" : "NO CUMPLE"}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 grid gap-2">
            {chapter.evidences.map((item) => (
              <p key={item.id} className="text-sm">
                <span className="font-display text-cyan">{play.evidences[item.id]}</span> · {item.name}
              </p>
            ))}
          </div>
          {gateNote ? (
            <div className="mt-4 rounded-xl border border-amber p-4">
              <p className="font-display text-2xl text-amber">{gateVerdict}</p>
              {gateNote.map((reason) => (
                <p key={reason} className="mt-2 text-sm leading-relaxed">
                  {reason}
                </p>
              ))}
              <button
                className="comic-btn mt-4"
                onClick={() => {
                  setGateNote(null);
                  setGateVerdict(null);
                  setPending(null);
                }}
              >
                Reconsiderar
              </button>
            </div>
          ) : pending ? (
            <div className="mt-4">
              <p className="text-sm leading-relaxed text-paper">{previewCopy(pending)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="comic-btn comic-btn-ghost" onClick={() => setPending(null)}>
                  Volver
                </button>
                <button
                  className="comic-btn"
                  onClick={() => {
                    const outcome = confirmProposal(playRef.current, pending);
                    commitPlay(outcome.state);
                    if (outcome.finalized) {
                      storeSave(serializePlay(outcome.state, true));
                      openPanel("none");
                      go("ending");
                      return;
                    }
                    setGateVerdict(outcome.result.verdict);
                    setGateNote(outcome.result.reasons);
                    blip(settingsRef.current.sfx, outcome.result.verdict === "DENY" ? 220 : 440);
                  }}
                >
                  Confirmar {pending}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button className="comic-btn" onClick={() => setPending("ACEPTAR")}>
                Aceptar
              </button>
              <button className="comic-btn comic-btn-coral" onClick={() => setPending("RECHAZAR")}>
                Rechazar
              </button>
              <button className="comic-btn comic-btn-cyan" onClick={() => setPending("REVISAR")}>
                Revisar
              </button>
            </div>
          )}
        </Overlay>
      ) : null}

      {panel === "options" ? (
        <Overlay
          title="Opciones"
          onClose={() => openPanel(optionsReturn === "pause" ? "pause" : "none")}
        >
          <OptionsForm
            settings={settings}
            listening={listening}
            onChange={setSettings}
            onListen={(field) => {
              listeningRef.current = field;
              setListening(field);
            }}
            onReset={() => setSettings((current) => ({ ...current, keys: { ...DEFAULT_KEYS } }))}
          />
        </Overlay>
      ) : null}

      {panel === "nosave" ? (
        <Overlay bare>
          <h2 className="font-display text-2xl">No hay partida guardada</h2>
          <p className="mt-2 text-sm text-muted">Continuar solo abre lo que se guardó en este navegador.</p>
          <button className="comic-btn mt-5" onClick={() => openPanel("none")}>
            Volver
          </button>
        </Overlay>
      ) : null}

      {panel === "confirm-new" ? (
        <Overlay bare>
          <h2 className="font-display text-2xl">¿Empezar de nuevo?</h2>
          <p className="mt-2 text-sm text-muted">Esto sustituye la partida guardada del capítulo en este navegador.</p>
          <div className="mt-5 grid gap-3">
            <button className="comic-btn" onClick={startFresh}>
              Nueva partida
            </button>
            <button className="comic-btn comic-btn-ghost" onClick={() => openPanel("none")}>
              Cancelar
            </button>
          </div>
        </Overlay>
      ) : null}

      {toast ? (
        <p className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full bg-amber px-4 py-2 font-display text-sm text-ink">
          {toast}
        </p>
      ) : null}
    </main>
  );
}

function loadSettingsSafe(): Settings {
  if (typeof window === "undefined") {
    return {
      textSpeed: "media",
      music: 0.6,
      sfx: 0.8,
      reduceMotion: false,
      keys: { ...DEFAULT_KEYS },
    };
  }
  return loadSettings();
}

function previewCopy(proposal: Proposal): string {
  if (proposal === "ACEPTAR") {
    return "Tratarías el mensaje como suficiente para seguir el transbordo. La compuerta todavía no tiene el origen verificado. Confirmar no enciende ningún sistema externo: si la evidencia no alcanza, el resultado será REVIEW y podrás reconsiderar.";
  }
  if (proposal === "RECHAZAR") {
    return "Descartarías la alerta como falsa. Sin una regla que demuestre la falsedad, la compuerta puede negar esa propuesta. No se borra el mensaje.";
  }
  return "Dejas la alerta en revisión. No sigues el transbordo ni lo declaras falso. Si los datos siguen incompletos, se registra REVIEW: origen no verificado.";
}

function MenuBackdrop() {
  return (
    <div className="absolute inset-0">
      <img src={menuBg} alt="" className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-night/70" />
    </div>
  );
}

function Portrait({ speaker }: { speaker: string }) {
  if (speaker === "Teo") {
    return <img src={teoUrl} alt="" className="h-16 w-16 rounded-lg bg-navy object-contain" />;
  }
  if (speaker === "Don Último") {
    return <img src={donUrl} alt="" className="h-16 w-16 rounded-lg bg-navy object-cover object-top" />;
  }
  const letter = speaker.slice(0, 1).toUpperCase();
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-navy font-display text-2xl text-amber">
      {letter}
    </div>
  );
}

function HudButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="comic-btn flex items-center gap-2 whitespace-nowrap" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function HoldButton({ label, onHold }: { label: string; onHold: (down: boolean) => void }) {
  return (
    <button
      className="comic-btn flex-1"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
    >
      {label}
    </button>
  );
}

function Overlay({
  title,
  onClose,
  children,
  bare = false,
}: {
  title?: string;
  onClose?: () => void;
  children: ReactNode;
  bare?: boolean;
}) {
  return (
    <div className="scrim absolute inset-0 z-20 flex items-center justify-center p-3 sm:p-6">
      <div className="panel-card max-h-full w-full max-w-3xl overflow-y-auto p-4 sm:p-6">
        {title ? (
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl sm:text-3xl">{title}</h2>
            {onClose ? (
              <button className="comic-btn" onClick={onClose}>
                Cerrar
              </button>
            ) : null}
          </div>
        ) : null}
        {bare ? children : children}
      </div>
    </div>
  );
}

function OptionsForm({
  settings,
  listening,
  onChange,
  onListen,
  onReset,
}: {
  settings: Settings;
  listening: keyof KeyBindings | null;
  onChange: (next: Settings) => void;
  onListen: (field: keyof KeyBindings) => void;
  onReset: () => void;
}) {
  return (
    <div className="grid gap-4">
      <label className="grid gap-1 text-sm">
        Velocidad del texto
        <select
          className="min-h-11 rounded-lg border border-navy bg-night px-3 text-paper"
          value={settings.textSpeed}
          onChange={(event) =>
            onChange({ ...settings, textSpeed: event.target.value as Settings["textSpeed"] })
          }
        >
          <option value="lenta">Lenta</option>
          <option value="media">Media</option>
          <option value="rapida">Rápida</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Ambiente {Math.round(settings.music * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.music}
          onChange={(event) => onChange({ ...settings, music: Number(event.target.value) })}
        />
      </label>
      <label className="grid gap-1 text-sm">
        Efectos {Math.round(settings.sfx * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.sfx}
          onChange={(event) => onChange({ ...settings, sfx: Number(event.target.value) })}
        />
      </label>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={settings.reduceMotion}
          onChange={(event) => onChange({ ...settings, reduceMotion: event.target.checked })}
        />
        Reducir movimiento
      </label>
      <div>
        <p className="font-display text-lg">Controles</p>
        <p className="text-sm text-muted">Las flechas también caminan. Elige una tecla y pulsa la nueva.</p>
        <ul className="mt-3 grid gap-2">
          {KEY_FIELDS.map((field) => (
            <li key={field.id} className="flex items-center justify-between gap-3">
              <span>{field.label}</span>
              <button className="comic-btn" onClick={() => onListen(field.id)}>
                {listening === field.id ? "Pulsa una tecla…" : keyName(settings.keys[field.id])}
              </button>
            </li>
          ))}
        </ul>
        <button className="comic-btn comic-btn-ghost mt-3" onClick={onReset}>
          Restablecer controles
        </button>
      </div>
    </div>
  );
}

function Credits({ onBack }: { onBack: () => void }) {
  return (
    <section className="absolute inset-0 flex items-center justify-center p-4">
      <div className="panel-card max-h-full w-full max-w-2xl overflow-y-auto p-5 sm:p-8">
        <p className="font-display text-xs tracking-widest text-amber">CRÉDITOS</p>
        <h2 className="mt-2 font-display text-3xl">Crónicas de un Chilango</h2>
        <p className="text-amber">Romeo-Hydra: el último transbordo · prototipo 0.1</p>
        <div className="mt-4 grid gap-3 text-sm leading-relaxed">
          <p>
            {chapter.protagonist.name}, {chapter.protagonist.age}, {chapter.protagonist.origin}.{" "}
            {chapter.protagonist.blurb}
          </p>
          <p>
            {chapter.antagonist.name}. {chapter.antagonist.blurb}
          </p>
          <p>{chapter.placeNote}</p>
          <p>
            La gobernanza de este capítulo es una simulación dentro del juego. No consulta servicios, no pide
            claves y no trata un archivo local como prueba absoluta.
          </p>
          <p>
            Controles: A o ← izquierda, D o → derecha, E interactuar, I inventario, F evidencias, M mapa, V
            visión, Esc pausa. En pantalla estrecha hay botones táctiles.
          </p>
          <p>
            Arte provisional: Teo, Don Último, la fonda y el andén nocturno. Habrá que sustituirlos por la
            ilustración definitiva. El mapa de tres nodos es ficticio.
          </p>
        </div>
        <button className="comic-btn mt-6" onClick={onBack}>
          Volver
        </button>
      </div>
    </section>
  );
}
