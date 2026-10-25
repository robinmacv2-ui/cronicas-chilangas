import { useEffect, useRef, type RefObject } from "react";
import fondaUrl from "@/assets/game/fonda.jpg";
import idle1 from "@/assets/game/teo/idle-1.png";
import idle2 from "@/assets/game/teo/idle-2.png";
import idle3 from "@/assets/game/teo/idle-3.png";
import idle4 from "@/assets/game/teo/idle-4.png";
import walk1 from "@/assets/game/teo/walk-1.png";
import walk2 from "@/assets/game/teo/walk-2.png";
import walk3 from "@/assets/game/teo/walk-3.png";
import walk4 from "@/assets/game/teo/walk-4.png";
import type { HotspotDef } from "@/game/content";

export type RenderModel = {
  player: number;
  facing: 1 | -1;
  moving: boolean;
  vision: boolean;
  laptopRead: boolean;
  found: { mensaje: boolean; registro: boolean; atlalilco: boolean };
  reduceMotion: boolean;
  hint: string;
  hotspots: HotspotDef[];
  messagePreview: string;
};

function loadImage(src: string): HTMLImageElement {
  const image = new Image();
  image.src = src;
  return image;
}

const fonda = loadImage(fondaUrl);
const idle = [idle1, idle2, idle3, idle4].map(loadImage);
const walk = [walk1, walk2, walk3, walk4].map(loadImage);

export function sceneRect(cw: number, ch: number, iw: number, ih: number) {
  const scale = Math.min(cw / iw, ch / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function Stage({
  modelRef,
  onFrame,
}: {
  modelRef: RefObject<RenderModel>;
  onFrame: (dt: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let last = performance.now();
    let anim = 0;

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      onFrame(dt);
      const model = modelRef.current;
      anim += dt;
      const ctx = canvas.getContext("2d");
      if (!ctx || !model) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.max(1, Math.floor(cssW * dpr));
      const bh = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0e1624";
      ctx.fillRect(0, 0, cssW, cssH);

      const iw = fonda.naturalWidth || 1792;
      const ih = fonda.naturalHeight || 1008;
      const rect = sceneRect(cssW, cssH, iw, ih);
      if (fonda.complete && fonda.naturalWidth) ctx.drawImage(fonda, rect.x, rect.y, rect.w, rect.h);
      else {
        ctx.fillStyle = "#1b3148";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }

      const spotOn = (id: string) => {
        if (id === "mensaje") return model.laptopRead;
        return true;
      };

      if (model.laptopRead) {
        const spot = model.hotspots.find((item) => item.id === "mensaje");
        if (spot) {
          const x = rect.x + spot.fx * rect.w;
          const y = rect.y + spot.fy * rect.h;
          ctx.save();
          ctx.shadowColor = "#2bb8c4";
          ctx.shadowBlur = model.reduceMotion ? 0 : 16;
          roundRect(ctx, x - 78, y - 46, 156, 78, 8);
          ctx.fillStyle = "rgba(14, 22, 36, 0.88)";
          ctx.fill();
          ctx.strokeStyle = "#2bb8c4";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#f4ebd8";
          ctx.font = "600 11px Literata, serif";
          ctx.textAlign = "center";
          const lines = model.messagePreview.split("\n").slice(0, 4);
          lines.forEach((line, index) => {
            ctx.fillText(line.slice(0, 28), x, y - 24 + index * 14);
          });
          ctx.restore();
        }
      }

      for (const spot of model.hotspots) {
        if (!spotOn(spot.id)) continue;
        const x = rect.x + spot.fx * rect.w;
        const y = rect.y + spot.fy * rect.h;
        const found =
          (spot.id === "mensaje" && model.found.mensaje) ||
          (spot.id === "registro" && model.found.registro) ||
          (spot.id === "atlalilco" && model.found.atlalilco) ||
          (spot.id === "laptop" && model.laptopRead);
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = found ? "#e8a23a" : "#f4ebd8";
        ctx.fillStyle = found ? "#e8a23a" : "#2bb8c4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.lineTo(9, 0);
        ctx.lineTo(0, 10);
        ctx.lineTo(-9, 0);
        ctx.closePath();
        ctx.globalAlpha = 0.95;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      if (model.vision) {
        ctx.fillStyle = "rgba(8, 12, 20, 0.45)";
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        const links: { id: string; label: string }[] = [];
        if (model.found.mensaje) links.push({ id: "mensaje", label: "origen no declarado" });
        if (model.found.registro) links.push({ id: "registro", label: "emisor ausente" });
        if (model.found.atlalilco) links.push({ id: "atlalilco", label: "sin procedencia" });
        const px = rect.x + model.player * rect.w;
        const py = rect.y + rect.h * 0.78;
        ctx.strokeStyle = "#2bb8c4";
        ctx.fillStyle = "#f4ebd8";
        ctx.lineWidth = 1.5;
        ctx.font = "600 13px Literata, serif";
        for (const link of links) {
          const spot = model.hotspots.find((item) => item.id === link.id);
          if (!spot) continue;
          const x = rect.x + spot.fx * rect.w;
          const y = rect.y + spot.fy * rect.h;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.fillStyle = "rgba(14, 22, 36, 0.85)";
          const width = ctx.measureText(link.label).width + 16;
          roundRect(ctx, x - width / 2, y - 36, width, 22, 6);
          ctx.fill();
          ctx.fillStyle = "#2bb8c4";
          ctx.textAlign = "center";
          ctx.fillText(link.label, x, y - 20);
        }
        ctx.fillStyle = "#e8a23a";
        ctx.textAlign = "left";
        ctx.font = "700 14px Archivo Black, sans-serif";
        ctx.fillText("VISIÓN DE SISTEMA · relaciones, no veredicto", rect.x + 16, rect.y + 28);
      }

      const frames = model.moving ? walk : idle;
      const fps = model.moving ? 8 : 3;
      const frame = frames[Math.floor(anim * (model.reduceMotion ? 0 : fps)) % frames.length] ?? frames[0];
      const feetX = rect.x + model.player * rect.w;
      const feetY = rect.y + rect.h * 0.9;
      const targetH = rect.h * 0.5;
      ctx.save();
      ctx.translate(feetX, feetY);
      ctx.scale(model.facing, 1);
      ctx.fillStyle = "rgba(14, 22, 36, 0.35)";
      ctx.beginPath();
      ctx.ellipse(0, 0, targetH * 0.18, targetH * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();
      if (frame && frame.complete && frame.naturalWidth) {
        const aspect = frame.naturalWidth / frame.naturalHeight;
        const h = targetH;
        const w = h * aspect;
        ctx.drawImage(frame, -w / 2, -h, w, h);
      } else {
        ctx.fillStyle = "#1b3148";
        ctx.fillRect(-22, -targetH, 44, targetH);
        ctx.fillStyle = "#e8a23a";
        ctx.fillRect(-18, -targetH + 8, 36, 16);
      }
      ctx.restore();

      if (model.hint && !model.vision) {
        ctx.save();
        ctx.font = "700 14px Archivo Black, sans-serif";
        const text = `E  ${model.hint}`;
        const width = ctx.measureText(text).width + 22;
        const bob = model.reduceMotion ? 0 : Math.sin(anim * 5) * 4;
        const x = feetX - width / 2;
        const y = feetY - targetH - 28 + bob;
        roundRect(ctx, x, y, width, 28, 6);
        ctx.fillStyle = "#f4ebd8";
        ctx.fill();
        ctx.strokeStyle = "#141820";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#141820";
        ctx.textAlign = "center";
        ctx.fillText(text, feetX, y + 19);
        ctx.restore();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [modelRef, onFrame]);

  return <canvas ref={canvasRef} className="stage-canvas" aria-hidden="true" />;
}
