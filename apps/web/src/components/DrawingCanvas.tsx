import { useEffect, useRef, useState } from "react";
import { MAX_DRAWING_DATA_URL_LENGTH } from "@nonoculture/shared";

const WIDTH = 720;
const HEIGHT = 540;
const INK = "#0a0a0a";
const PAPER = "#f5f5f7";

/** Lossy formats, best first. WebP is much smaller but its canvas *encoder* is missing on
 *  older iOS Safari, where toDataURL silently falls back to PNG — hence the check on what
 *  actually came back, and the JPEG step (the canvas has an opaque background, so dropping
 *  the alpha channel costs nothing). */
const ENCODINGS: { mime: string; quality: number }[] = [
  { mime: "image/webp", quality: 0.7 },
  { mime: "image/jpeg", quality: 0.75 },
  { mime: "image/jpeg", quality: 0.5 },
];

/** Encodes the doodle as small as it reasonably goes, staying under the protocol's ceiling. */
function encode(canvas: HTMLCanvasElement): string | null {
  for (const { mime, quality } of ENCODINGS) {
    const dataUrl = canvas.toDataURL(mime, quality);
    if (!dataUrl.startsWith(`data:${mime}`)) continue; // encoder unsupported, browser gave us PNG
    if (dataUrl.length <= MAX_DRAWING_DATA_URL_LENGTH) return dataUrl;
  }
  return null;
}

export function DrawingCanvas({ onSubmit }: { onSubmit: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function paper(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paper(canvas.getContext("2d")!);
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (submitted) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || submitted) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    setStrokeCount((n) => n + 1);
  }

  function clear() {
    paper(canvasRef.current!.getContext("2d")!);
    setStrokeCount(0);
    setError(null);
  }

  function submit() {
    const dataUrl = encode(canvasRef.current!);
    if (!dataUrl) {
      setError("Dessin trop chargé pour être envoyé — simplifie-le un peu.");
      return;
    }
    setError(null);
    onSubmit(dataUrl);
    setSubmitted(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="w-full touch-none rounded-[var(--radius-card)]"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}`, border: "1px solid var(--color-border)", cursor: "crosshair" }}
        aria-label="Zone de dessin"
      />

      {error && (
        <p className="text-center text-[13px]" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button onClick={clear} disabled={submitted || strokeCount === 0} className="btn btn-secondary flex-1">
          Effacer
        </button>
        <button onClick={submit} disabled={submitted || strokeCount === 0} className="btn btn-primary flex-1">
          {submitted ? "Envoyé" : "Valider"}
        </button>
      </div>
    </div>
  );
}
