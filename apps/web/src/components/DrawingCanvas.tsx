import { useEffect, useRef, useState } from "react";

const WIDTH = 360;
const HEIGHT = 270;

export function DrawingCanvas({ onSubmit }: { onSubmit: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
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
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0b0d12";
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    setStrokeCount((n) => n + 1);
  }

  function clear() {
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    setStrokeCount(0);
  }

  function submit() {
    const dataUrl = canvasRef.current!.toDataURL("image/png");
    onSubmit(dataUrl);
    setSubmitted(true);
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="touch-none rounded-[var(--radius-card)] shadow-[0_0_24px_-8px_var(--color-accent)]"
        style={{ border: "1px solid var(--color-border)", width: "100%", maxWidth: WIDTH }}
      />
      <div className="flex gap-2">
        <button
          onClick={clear}
          disabled={submitted}
          className="min-h-11 rounded-[var(--radius-control)] px-4 font-medium disabled:opacity-40"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          Effacer
        </button>
        <button
          onClick={submit}
          disabled={submitted || strokeCount === 0}
          className="min-h-11 rounded-[var(--radius-control)] px-6 font-semibold disabled:opacity-40"
          style={{ background: "var(--color-accent)", color: "var(--color-accent-contrast)" }}
        >
          {submitted ? "Envoyé" : "Valider le dessin"}
        </button>
      </div>
    </div>
  );
}
