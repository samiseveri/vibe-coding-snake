import React, { useEffect, useMemo, useRef, useState } from "react";

// 3D Cube Snake — classic Snake but played across the six faces of a cube.
// Update: Camera now ALWAYS follows the snake head (tilts toward head position on the active face),
// not only when crossing edges. You can toggle the camera on/off with the existing checkbox.
// No external libraries. Uses CSS 3D transforms and React.
// Controls: Arrow Keys / WASD. Space = Pause/Resume. R = Reset.

// ====== Types ======
const Faces = ["F", "R", "B", "L", "U", "D"] as const;
type Face = typeof Faces[number];
type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";

interface Segment {
  face: Face;
  x: number; // 0..N-1
  y: number; // 0..N-1
}

interface Rotation { x: number; y: number; z: number; }

// ====== Helpers ======
function flip(v: number, N: number) {
  return N - 1 - v;
}

function clamp01(v: number, max: number) {
  return Math.max(0, Math.min(max, v));
}

function randInt(max: number) {
  return Math.floor(Math.random() * max);
}

function isOpposite(a: Dir, b: Dir) {
  return (
    (a === "UP" && b === "DOWN") ||
    (a === "DOWN" && b === "UP") ||
    (a === "LEFT" && b === "RIGHT") ||
    (a === "RIGHT" && b === "LEFT")
  );
}

// Camera rotations to bring a face to the front (base orientation)
// Added "z" for optional roll (kept 0 by default).
const faceToRotation: Record<Face, Rotation> = {
  F: { x: 0, y: 0, z: 0 },
  R: { x: 0, y: -90, z: 0 },
  B: { x: 0, y: -180, z: 0 },
  L: { x: 0, y: 90, z: 0 },
  U: { x: 90, y: 0, z: 0 },  // tilt top toward camera
  D: { x: -90, y: 0, z: 0 }, // tilt bottom toward camera
};

// Compute next position; if crossing an edge, map to the adjacent face with proper coordinate transform.
function stepAcross(face: Face, dir: Dir, x: number, y: number, N: number): { face: Face; x: number; y: number; dir: Dir } {
  // First attempt a normal in-face move
  let nx = x;
  let ny = y;
  if (dir === "UP") ny = y - 1;
  if (dir === "DOWN") ny = y + 1;
  if (dir === "LEFT") nx = x - 1;
  if (dir === "RIGHT") nx = x + 1;

  if (nx >= 0 && nx < N && ny >= 0 && ny < N) {
    return { face, x: nx, y: ny, dir };
  }

  // Edge transitions — derived from a standard cube net:
  //      [ U ]
  // [ L ][ F ][ R ][ B ]
  //      [ D ]
  // Coordinates per face: x: left->right (0..N-1), y: top->bottom (0..N-1)
  switch (face) {
    case "F":
      if (dir === "UP") return { face: "U", x, y: N - 1, dir: "UP" };
      if (dir === "DOWN") return { face: "D", x, y: 0, dir: "DOWN" };
      if (dir === "LEFT") return { face: "L", x: N - 1, y, dir: "LEFT" };
      if (dir === "RIGHT") return { face: "R", x: 0, y, dir: "RIGHT" };
      break;
    case "B":
      if (dir === "LEFT") return { face: "R", x: N - 1, y, dir: "LEFT" };
      if (dir === "RIGHT") return { face: "L", x: 0, y, dir: "RIGHT" };
      if (dir === "UP") return { face: "U", x: flip(x, N), y: 0, dir: "DOWN" };
      if (dir === "DOWN") return { face: "D", x: flip(x, N), y: N - 1, dir: "UP" };
      break;
    case "R":
      if (dir === "LEFT") return { face: "F", x: N - 1, y, dir: "LEFT" };
      if (dir === "RIGHT") return { face: "B", x: 0, y, dir: "RIGHT" };
      if (dir === "UP") return { face: "U", x: N - 1, y: flip(x, N), dir: "LEFT" };
      if (dir === "DOWN") return { face: "D", x: N - 1, y: x, dir: "LEFT" };
      break;
    case "L":
      if (dir === "RIGHT") return { face: "F", x: 0, y, dir: "RIGHT" };
      if (dir === "LEFT") return { face: "B", x: N - 1, y, dir: "LEFT" };
      if (dir === "UP") return { face: "U", x: 0, y: x, dir: "RIGHT" };
      if (dir === "DOWN") return { face: "D", x: 0, y: flip(x, N), dir: "RIGHT" };
      break;
    case "U":
      if (dir === "DOWN") return { face: "F", x, y: 0, dir: "DOWN" };
      if (dir === "UP") return { face: "B", x: flip(x, N), y: 0, dir: "DOWN" };
      if (dir === "LEFT") return { face: "L", x: y, y: 0, dir: "DOWN" };
      if (dir === "RIGHT") return { face: "R", x: flip(y, N), y: 0, dir: "DOWN" };
      break;
    case "D":
      if (dir === "UP") return { face: "F", x, y: N - 1, dir: "UP" };
      if (dir === "DOWN") return { face: "B", x: flip(x, N), y: N - 1, dir: "UP" };
      if (dir === "LEFT") return { face: "L", x: flip(y, N), y: N - 1, dir: "UP" };
      if (dir === "RIGHT") return { face: "R", x: y, y: N - 1, dir: "UP" };
      break;
  }
  // Fallback (should not hit)
  return { face, x: clamp01(nx, N - 1), y: clamp01(ny, N - 1), dir };
}

// Compute a camera rotation that keeps the active face forward
// and tilts slightly toward the snake head to "follow" it.
function followRotation(head: Segment, N: number): Rotation {
  const base = faceToRotation[head.face];
  // Normalize head position to -1..1 relative to the face center
  const mid = (N - 1) / 2;
  const nx = (head.x - mid) / (mid || 1); // left (-1) .. right (1)
  const ny = (head.y - mid) / (mid || 1); // top (-1) .. bottom (1)

  // Max tilt in degrees (tweak for taste)
  const MAX_TILT = 12; // deg

  // Tilt mapping: move cube so camera appears to pan/tilt toward head
  // - Positive nx (head right) => rotateY positive
  // - Positive ny (head down)  => rotateX negative (camera looks down)
  const tiltX = -ny * MAX_TILT;
  const tiltY =  nx * MAX_TILT;
  const tiltZ =  0; // optional subtle roll if you want: e.g., (-nx) * 4

  return { x: base.x + tiltX, y: base.y + tiltY, z: base.z + tiltZ };
}

function serializePos(p: Segment) {
  return `${p.face}:${p.x}:${p.y}`;
}

function useInterval(cb: () => void, delay: number | null) {
  const saved = useRef(cb);
  useEffect(() => {
    saved.current = cb;
  }, [cb]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

export default function CubeSnakeGame() {
  const [gridSize, setGridSize] = useState(12);
  const [speedMs, setSpeedMs] = useState(180);
  const [running, setRunning] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [fezCamera, setFezCamera] = useState(true); // when ON, camera always follows

  const initialSnake = useMemo<Segment[]>(() => {
    const mid = Math.floor(gridSize / 2);
    return [
      { face: "F", x: mid + 1, y: mid },
      { face: "F", x: mid, y: mid },
      { face: "F", x: mid - 1, y: mid },
    ];
  }, [gridSize]);

  const [snake, setSnake] = useState<Segment[]>(initialSnake);
  const [dir, setDir] = useState<Dir>("RIGHT");
  const [pendingDir, setPendingDir] = useState<Dir | null>(null);
  const [food, setFood] = useState<Segment | null>(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [camRot, setCamRot] = useState<Rotation>(faceToRotation[initialSnake[0].face]);

  // Spawn food not on snake
  const spawnFood = (occupied: Set<string>) => {
    let tries = 0;
    while (tries < 10000) {
      const face = Faces[randInt(6)];
      const x = randInt(gridSize);
      const y = randInt(gridSize);
      const s = `${face}:${x}:${y}`;
      if (!occupied.has(s)) {
        setFood({ face, x, y });
        return;
      }
      tries++;
    }
    // fallback (very unlikely)
    setFood(null);
  };

  // Reset
  const reset = () => {
    setSnake(initialSnake);
    setDir("RIGHT");
    setPendingDir(null);
    setScore(0);
    setLevel(1);
    setGameOver(false);
    const occ = new Set(initialSnake.map(serializePos));
    spawnFood(occ);
    // Initialize camera to face-forward (no follow tilt until next tick)
    setCamRot(faceToRotation["F"]);
    setRunning(true);
  };

  // Initialize food and state on first render or when grid changes
  useEffect(() => {
    const occ = new Set(initialSnake.map(serializePos));
    spawnFood(occ);
    setSnake(initialSnake);
    setDir("RIGHT");
    setPendingDir(null);
    setScore(0);
    setLevel(1);
    setGameOver(false);
    setCamRot(faceToRotation["F"]);
  }, [gridSize, initialSnake]);

  // Handle keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setRunning((r) => !r);
        return;
      }
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        reset();
        return;
      }
      let nd: Dir | null = null;
      if (["ArrowUp", "w", "W"].includes(e.key)) nd = "UP";
      if (["ArrowDown", "s", "S"].includes(e.key)) nd = "DOWN";
      if (["ArrowLeft", "a", "A"].includes(e.key)) nd = "LEFT";
      if (["ArrowRight", "d", "D"].includes(e.key)) nd = "RIGHT";
      if (nd) {
        e.preventDefault();
        setPendingDir((prev) => {
          const cur = prev ?? dir;
          if (isOpposite(nd!, dir)) return prev; // ignore exact reverse of active dir
          return nd!;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dir]);

  // Main game loop
  useInterval(
    () => {
      if (!running || gameOver) return;

      // Apply pending direction if not reversing
      let newDir = dir;
      if (pendingDir && !isOpposite(pendingDir, dir)) {
        newDir = pendingDir;
        setDir(newDir);
        setPendingDir(null);
      }

      const headBefore = snake[0];
      const moved = stepAcross(headBefore.face, newDir, headBefore.x, headBefore.y, gridSize);
      const newHead: Segment = { face: moved.face, x: moved.x, y: moved.y };

      // Self-collision check
      const bodySet = new Set(snake.map(serializePos));
      const newHeadKey = serializePos(newHead);
      if (bodySet.has(newHeadKey)) {
        setGameOver(true);
        setRunning(false);
        return;
      }

      let newSnake: Segment[] = [newHead, ...snake];
      let consumed = false;
      if (food && newHead.face === food.face && newHead.x === food.x && newHead.y === food.y) {
        consumed = true;
        setScore((s) => s + 1);
        if ((score + 1) % 5 === 0) {
          setLevel((lvl) => lvl + 1);
          setSpeedMs((ms) => Math.max(60, Math.floor(ms * 0.9)));
        }
      } else {
        // move forward (remove tail)
        newSnake.pop();
      }

      setSnake(newSnake);

      if (consumed) {
        const occ = new Set(newSnake.map(serializePos));
        spawnFood(occ);
      }

      // Camera: ALWAYS follow the head while the Fez camera toggle is on.
      if (fezCamera) {
        setCamRot(followRotation(newHead, gridSize));
      }
    },
    running && !gameOver ? speedMs : null
  );

  // Also adjust camera immediately when toggling camera or resizing grid
  useEffect(() => {
    if (fezCamera) {
      const head = snake[0];
      if (head) setCamRot(followRotation(head, gridSize));
    }
  }, [fezCamera, gridSize]);

  // UI sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(520);
  useEffect(() => {
    const onResize = () => {
      const w = containerRef.current?.clientWidth ?? 640;
      setSize(Math.min(640, Math.max(360, Math.floor(w * 0.9))));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const cubeSize = Math.floor(size * 0.8);
  const cell = Math.floor(cubeSize / gridSize);
  const half = Math.floor(cubeSize / 2);

  // Build quick lookup maps for rendering
  const snakeSet = useMemo(() => new Set(snake.map(serializePos)), [snake]);
  const headKey = serializePos(snake[0]);
  const foodKey = food ? serializePos(food) : "";

  // Face transforms (CSS) relative to cube center
  const faceTransforms: Record<Face, string> = {
    F: `translateZ(${half}px)`,
    B: `rotateY(180deg) translateZ(${half}px)`,
    R: `rotateY(90deg) translateZ(${half}px)`,
    L: `rotateY(-90deg) translateZ(${half}px)`,
    U: `rotateX(90deg) translateZ(${half}px)`,
    D: `rotateX(-90deg) translateZ(${half}px)`,
  };

  const faceLabels: Record<Face, string> = { F: "Front", R: "Right", B: "Back", L: "Left", U: "Up", D: "Down" };

  return (
    <div className="w-full h-full p-4 flex flex-col items-center gap-4">
      <style>{`
        .hud { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif; }
        .scene { perspective: 1000px; }
        .cube { transform-style: preserve-3d; }
        .face { position: absolute; left: 50%; top: 50%; transform-style: preserve-3d; }
        .grid { position: absolute; left: 0; top: 0; display: grid; }
        .cell { box-sizing: border-box; border: 1px solid rgba(255,255,255,0.08); }
        .cell.snake { background: linear-gradient(145deg, #00d084, #16a34a); border-color: rgba(0,0,0,0.15); }
        .cell.head { background: linear-gradient(145deg, #22d3ee, #0284c7); border-color: rgba(0,0,0,0.25); }
        .cell.food { background: radial-gradient(circle at 40% 35%, #f43f5e, #be123c); border-color: rgba(0,0,0,0.2); }
        .faceLabel { position: absolute; left: 8px; top: 8px; font-size: 12px; color: rgba(255,255,255,0.65); }
        .shadow { box-shadow: 0 20px 40px rgba(0,0,0,0.25), inset 0 0 40px rgba(255,255,255,0.02); border-radius: 18px; }
      `}</style>

      <div className="hud w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-3 items-center">
        <div className="col-span-2 md:col-span-1 flex items-center gap-3">
          <button
            className={`px-4 py-2 rounded-2xl shadow text-white ${running ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
            onClick={() => setRunning((r) => !r)}
            title="Space"
          >
            {running ? "Pause" : "Resume"}
          </button>
          <button className="px-4 py-2 rounded-2xl shadow bg-slate-700 hover:bg-slate-600 text-white" onClick={reset} title="R">
            Reset
          </button>
        </div>
        <div className="col-span-1 flex flex-col">
          <label className="text-sm text-slate-300">Speed: {speedMs} ms/step</label>
          <input
            type="range"
            min={60}
            max={400}
            step={10}
            value={speedMs}
            onChange={(e) => setSpeedMs(parseInt(e.target.value))}
          />
        </div>
        <div className="col-span-1 flex flex-col">
          <label className="text-sm text-slate-300">Grid: {gridSize} × {gridSize}</label>
          <input
            type="range"
            min={6}
            max={20}
            step={1}
            value={gridSize}
            onChange={(e) => setGridSize(parseInt(e.target.value))}
          />
        </div>
        <div className="col-span-2 md:col-span-1 flex items-center gap-2 justify-end">
          <label className="flex items-center gap-2 text-slate-200">
            <input type="checkbox" checked={fezCamera} onChange={(e) => setFezCamera(e.target.checked)} />
            Camera follow (Fez-style)
          </label>
        </div>
      </div>

      <div ref={containerRef} className="w-full max-w-4xl flex flex-col items-center gap-3">
        <div className="text-slate-200 hud flex gap-6">
          <div>Score: <span className="font-semibold">{score}</span></div>
          <div>Level: <span className="font-semibold">{level}</span></div>
          {gameOver && <div className="text-rose-400 font-semibold">Game Over — press R to reset</div>}
        </div>

        <div className="scene shadow bg-gradient-to-b from-slate-800 to-slate-900 p-6" style={{ width: size, height: size }}>
          <div
            className="cube w-full h-full relative"
            style={{
              // Shorter, smoother transform helps the constant follow effect feel responsive
              transition: fezCamera ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
              transform: `rotateX(${camRot.x}deg) rotateY(${camRot.y}deg) rotateZ(${camRot.z}deg)`,
            }}
          >
            {/* 6 Faces */}
            {Faces.map((face) => (
              <div
                key={face}
                className="face"
                style={{
                  width: cubeSize,
                  height: cubeSize,
                  marginLeft: -half,
                  marginTop: -half,
                  transform: faceTransforms[face],
                  background: "linear-gradient(160deg, rgba(255,255,255,0.04), rgba(0,0,0,0.25))",
                  borderRadius: 16,
                  overflow: "hidden",
                }}
              >
                <div className="faceLabel">{faceLabels[face]}</div>
                <div
                  className="grid"
                  style={{
                    width: cubeSize,
                    height: cubeSize,
                    gridTemplateColumns: `repeat(${gridSize}, ${cell}px)`,
                    gridTemplateRows: `repeat(${gridSize}, ${cell}px)`,
                  }}
                >
                  {Array.from({ length: gridSize * gridSize }, (_, i) => {
                    const x = i % gridSize;
                    const y = Math.floor(i / gridSize);
                    const key = `${face}:${x}:${y}`;
                    const isHead = key === headKey;
                    const isSnake = snakeSet.has(key);
                    const isFood = key === foodKey;
                    return (
                      <div
                        key={i}
                        className={
                          "cell" +
                          (isHead ? " head" : isSnake ? " snake" : isFood ? " food" : "")
                        }
                        style={{ width: cell, height: cell }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="hud text-slate-300 text-sm text-center leading-relaxed max-w-3xl">
          <p className="mb-2">
            <strong>How to play:</strong> Use <kbd>W/A/S/D</kbd> or the arrow keys to steer. The snake traverses edges onto adjacent faces.
            The camera now continuously follows the snake head on its current face. Press <kbd>Space</kbd> to pause/resume, <kbd>R</kbd> to reset.
          </p>
          <p>
            Tip: You can change <em>Speed</em> and <em>Grid</em> size mid-game. Every 5 apples, the level increases and the snake speeds up slightly.
          </p>
        </div>
      </div>
    </div>
  );
}
``