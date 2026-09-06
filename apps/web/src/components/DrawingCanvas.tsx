import { useEffect, useRef, useState } from "react";
import { MAX_DRAWING_DATA_URL_LENGTH } from "@nonoculture/shared";

const WIDTH = 720;
const HEIGHT = 540;
const PAPER = "#f5f5f7";

/** Ink that stays legible on the paper, and distinct from each other at thumbnail size. */
const COLORS = ["#0a0a0a", "#e5484d", "#0a84ff", "#30a46c", "#f5a524", "#8e4ec6"];
const SIZES = [4, 9, 18];

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

export function DrawingCanvas({
  onSubmit,
  deadlineTs,
}: {
  onSubmit: (dataUrl: string) => void;
  /** When the round ends. The drawing is sent on its own just before, so work in progress
   *  isn't thrown away just because nobody pressed the button in time. */
  deadlineTs: number | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState(COLORS[0]!);
  const [size, setSize] = useState(SIZES[1]!);
  const [erasing, setErasing] = useState(false);

  function paper(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paper(canvas.getContext("2d")!);
  }, []);

  // Latest values, readable from the auto-send timer without restarting it on every stroke.
  // Synced in an effect rather than during render: writing a ref while rendering is exactly
  // what react-hooks/refs forbids, and it would tear under concurrent rendering.
  const state = useRef({ strokeCount, submitted });
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    state.current = { strokeCount, submitted };
    submitRef.current = onSubmit;
  });

  useEffect(() => {
    if (deadlineTs === null) return;
    const fireAt = deadlineTs - 1200 - Date.now();
    if (fireAt <= 0) return;
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas || state.current.submitted || state.current.strokeCount === 0) return;
      const dataUrl = encode(canvas);
      if (!dataUrl) return;
      submitRef.current(dataUrl);
      setSubmitted(true);
    }, fireAt);
    return () => clearTimeout(timer);
  }, [deadlineTs]);

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
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // The eraser is just paper-coloured ink: the background is opaque, so there is nothing
    // underneath to reveal, and this keeps one code path for both.
    ctx.strokeStyle = erasing ? PAPER : color;
    ctx.lineWidth = erasing ? size * 2.5 : size;
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

      <div className="flex flex-wrap items-center justify-center gap-2">
        {COLORS.map((c) => {
          const active = !erasing && c === color;
          return (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                setErasing(false);
              }}
              aria-label={`Couleur ${c}`}
              aria-pressed={active}
              className="size-9 rounded-full transition-transform duration-200"
              style={{
                background: c,
                border: `2px solid ${active ? "var(--color-text)" : "transparent"}`,
                transform: active ? "scale(1.12)" : "scale(1)",
              }}
            />
          );
        })}

        <span className="mx-1 h-6 w-px" style={{ background: "var(--color-border)" }} aria-hidden />

        {SIZES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSize(s)}
            aria-label={`Épaisseur ${s}`}
            aria-pressed={s === size}
            className="flex size-9 items-center justify-center rounded-full transition-colors duration-200"
            style={{ background: s === size ? "var(--color-surface-2)" : "transparent" }}
          >
            <span
              className="block rounded-full"
              style={{ width: s + 2, height: s + 2, background: "var(--color-text)" }}
            />
          </button>
        ))}

        <button
          type="button"
          onClick={() => setErasing((e) => !e)}
          aria-pressed={erasing}
          className="h-9 rounded-full px-4 text-[13px] font-medium transition-all duration-200"
          style={{
            background: erasing ? "var(--color-accent)" : "transparent",
            color: erasing ? "var(--color-accent-contrast)" : "var(--color-text-muted)",
            border: `1px solid ${erasing ? "var(--color-accent)" : "var(--color-border)"}`,
          }}
        >
          Gomme
        </button>
      </div>

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

      <p className="text-center text-[13px]" style={{ color: "var(--color-text-faint)" }}>
        {submitted ? "Dessin envoyé." : "Envoyé automatiquement à la fin du temps, même sans valider."}
      </p>
    </div>
  );
}
