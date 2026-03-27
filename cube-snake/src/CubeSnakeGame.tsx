import React, { useEffect, useMemo, useRef, useState } from "react";

// 3D Cube Snake — classic Snake across a cube.
// Camera rules (final):
// - On Top(U), the camera rotates so TOP is in front.
// - On Bottom(D), the camera rotates so BOTTOM is in front.
// - Camera always follows the head with a subtle tilt (face-local).
// Gameplay rules:
// - Turning is blocked only if it would move into the neck (works across edges).
// - Direction remap after edge-crossing is applied immediately.

const Faces = ["F", "R", "B", "L", "U", "D"] as const;
type Face = typeof Faces[number];
type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";

interface Segment {
  face: Face;
  x: number; // 0..N-1
  y: number; // 0..N-1
}

interface Rotation { x: number; y: number; z: number }

// ===== Helpers =====
function flip(v: number, N: number) { return N - 1 - v; }
function clamp01(v: number, max: number) { return Math.max(0, Math.min(max, v)); }
function randInt(max: number) { return Math.floor(Math.random() * max); }
function serialize(p: Segment) { return `${p.face}:${p.x}:${p.y}`; }

// Base rotations per face (rotate the cube so that this face is forward)
const faceToRotation: Record<Face, Rotation> = {
  F: { x:   0, y:   0,  z: 0 },
  R: { x:   0, y: -90,  z: 0 },
  B: { x:   0, y:-180,  z: 0 },
  L: { x:   0, y:  90,  z: 0 },
  U: { x: -90, y:   0,  z: 0 }, // TOP to the front
  D: { x:  90, y:   0,  z: 0 }, // BOTTOM to the front
};

// Compute a face-local follow tilt toward the head
function computeTilt(head: Segment, N: number): Rotation {
  const mid = (N - 1) / 2;
  const nx = (head.x - mid) / (mid || 1); // left (-1)..right (1)
  const ny = (head.y - mid) / (mid || 1); // top (-1)..bottom (1)
  const MAX = 12; // degrees of tilt
  // Local intent: look toward head position on the current face
  const tiltX = -ny * MAX;   // pitch: head lower => look down
  const tiltY =  nx * MAX;   // yaw  : head right => look right
  const tiltZ =  0;
  return { x: tiltX, y: tiltY, z: tiltZ };
}

// Move one tile; if crossing an edge, map to adjacent face and remap dir if needed.
function stepAcross(
  face: Face, dir: Dir, x: number, y: number, N: number
): { face: Face; x: number; y: number; dir: Dir } {
  let nx = x, ny = y;
  if (dir === "UP")    ny = y - 1;
  if (dir === "DOWN")  ny = y + 1;
  if (dir === "LEFT")  nx = x - 1;
  if (dir === "RIGHT") nx = x + 1;

  if (nx >= 0 && nx < N && ny >= 0 && ny < N) {
    return { face, x: nx, y: ny, dir };
  }

  // Net:
  //      [ U ]
  // [ L ][ F ][ R ][ B ]
  //      [ D ]
  switch (face) {
    case "F":
      if (dir === "UP")    return { face: "U", x, y: N - 1, dir: "UP" };
      if (dir === "DOWN")  return { face: "D", x, y: 0,     dir: "DOWN" };
      if (dir === "LEFT")  return { face: "L", x: N - 1, y, dir: "LEFT" };
      if (dir === "RIGHT") return { face: "R", x: 0,     y, dir: "RIGHT" };
      break;
    case "B":
      if (dir === "LEFT")  return { face: "R", x: N - 1, y, dir: "LEFT" };
      if (dir === "RIGHT") return { face: "L", x: 0,     y, dir: "RIGHT" };
      if (dir === "UP")    return { face: "U", x: flip(x, N), y: 0,     dir: "DOWN" };
      if (dir === "DOWN")  return { face: "D", x: flip(x, N), y: N - 1, dir: "UP" };
      break;
    case "R":
      if (dir === "LEFT")  return { face: "F", x: N - 1, y, dir: "LEFT" };
      if (dir === "RIGHT") return { face: "B", x: 0,     y, dir: "RIGHT" };
      if (dir === "UP")    return { face: "U", x: N - 1, y: flip(x, N), dir: "LEFT" };
      if (dir === "DOWN")  return { face: "D", x: N - 1, y: x,          dir: "LEFT" };
      break;
    case "L":
      if (dir === "RIGHT") return { face: "F", x: 0,     y, dir: "RIGHT" };
      if (dir === "LEFT")  return { face: "B", x: N - 1, y, dir: "LEFT" };
      if (dir === "UP")    return { face: "U", x: 0,     y: x,          dir: "RIGHT" };
      if (dir === "DOWN")  return { face: "D", x: 0,     y: flip(x, N), dir: "RIGHT" };
      break;
    case "U":
      if (dir === "DOWN")  return { face: "F", x, y: 0,     dir: "DOWN" };
      if (dir === "UP")    return { face: "B", x: flip(x, N), y: 0,     dir: "DOWN" };
      if (dir === "LEFT")  return { face: "L", x: y,          y: 0,     dir: "DOWN" };
      if (dir === "RIGHT") return { face: "R", x: flip(y, N), y: 0,     dir: "DOWN" };
      break;
    case "D":
      if (dir === "UP")    return { face: "F", x, y: N - 1,  dir: "UP" };
      if (dir === "DOWN")  return { face: "B", x: flip(x, N), y: N - 1, dir: "UP" };
      if (dir === "LEFT")  return { face: "L", x: flip(y, N), y: N - 1, dir: "UP" };
      if (dir === "RIGHT") return { face: "R", x: y,          y: N - 1, dir: "UP" };
      break;
  }
  return { face, x: clamp01(nx, N - 1), y: clamp01(ny, N - 1), dir };
}

// Small interval hook
function useInterval(cb: () => void, delay: number | null) {
  const saved = useRef(cb);
  useEffect(() => { saved.current = cb; }, [cb]);
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
  const [fezCamera, setFezCamera] = useState(true); // follow camera on/off

  // Initial snake
  const initialSnake = useMemo<Segment[]>(() => {
    const mid = Math.floor(gridSize / 2);
    return [
      { face: "F", x: mid + 1, y: mid },
      { face: "F", x: mid,     y: mid },
      { face: "F", x: mid - 1, y: mid },
    ];
  }, [gridSize]);

  const [snake, setSnake] = useState<Segment[]>(initialSnake);
  const [dir, setDir] = useState<Dir>("RIGHT");
  const [pendingDir, setPendingDir] = useState<Dir | null>(null);
  const [food, setFood] = useState<Segment | null>(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);

  // Camera parts: base (bring face to front) + tilt (follow)
  const [baseRot, setBaseRot] = useState<Rotation>(faceToRotation[initialSnake[0].face]);
  const [tiltRot, setTiltRot] = useState<Rotation>({ x: 0, y: 0, z: 0 });

  // Spawn food not on snake
  const spawnFood = (occupied: Set<string>) => {
    let tries = 0;
    while (tries < 10000) {
      const face = Faces[randInt(6)];
      const x = randInt(gridSize);
      const y = randInt(gridSize);
      const key = `${face}:${x}:${y}`;
      if (!occupied.has(key)) { setFood({ face, x, y }); return; }
      tries++;
    }
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
    spawnFood(new Set(initialSnake.map(serialize)));
    setBaseRot(faceToRotation["F"]);
    setTiltRot({ x: 0, y: 0, z: 0 });
    setRunning(true);
  };

  // Initialize on grid change
  useEffect(() => {
    setSnake(initialSnake);
    setDir("RIGHT");
    setPendingDir(null);
    setScore(0);
    setLevel(1);
    setGameOver(false);
    spawnFood(new Set(initialSnake.map(serialize)));
    setBaseRot(faceToRotation["F"]);
    setTiltRot({ x: 0, y: 0, z: 0 });
  }, [gridSize, initialSnake]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") { e.preventDefault(); setRunning(r => !r); return; }
      if (e.key.toLowerCase() === "r") { e.preventDefault(); reset(); return; }
      let nd: Dir | null = null;
      if (["ArrowUp",   "w", "W"].includes(e.key)) nd = "UP";
      if (["ArrowDown", "s", "S"].includes(e.key)) nd = "DOWN";
      if (["ArrowLeft", "a", "A"].includes(e.key)) nd = "LEFT";
      if (["ArrowRight","d", "D"].includes(e.key)) nd = "RIGHT";
      if (nd) { e.preventDefault(); setPendingDir(nd); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Main loop
  useInterval(
    () => {
      if (!running || gameOver) return;

      const head = snake[0];

      // Only forbid a turn if it would move into the neck (classic Snake rule)
      let useDir = dir;
      if (pendingDir) {
        const candidate = stepAcross(head.face, pendingDir, head.x, head.y, gridSize);
        const neck = snake.length > 1 ? snake[1] : null;
        const reversing = neck && serialize(candidate) === serialize(neck);
        if (!reversing) {
          useDir = pendingDir;
          setDir(pendingDir);
          setPendingDir(null);
        }
      }

      // Move
      const moved = stepAcross(head.face, useDir, head.x, head.y, gridSize);

      // Accept direction remap on edge-cross (important for U/D)
      if (moved.dir !== useDir) {
        useDir = moved.dir;
        setDir(moved.dir);
      }

      const newHead: Segment = { face: moved.face, x: moved.x, y: moved.y };

      // Self-collision
      const bodySet = new Set(snake.map(serialize));
      if (bodySet.has(serialize(newHead))) {
        setGameOver(true); setRunning(false); return;
      }

      // Grow or slide
      const grew = food && newHead.face === food.face && newHead.x === food.x && newHead.y === food.y;
      const newSnake = grew ? [newHead, ...snake] : [newHead, ...snake.slice(0, -1)];
      setSnake(newSnake);

      if (grew) {
        setScore(s => s + 1);
        if ((score + 1) % 5 === 0) {
          setLevel(l => l + 1);
          setSpeedMs(ms => Math.max(60, Math.floor(ms * 0.9)));
        }
        spawnFood(new Set(newSnake.map(serialize)));
      }

      // Camera: bring current face to front + local follow tilt
      if (fezCamera) {
        setBaseRot(faceToRotation[newHead.face]);
        setTiltRot(computeTilt(newHead, gridSize));
      }
    },
    running && !gameOver ? speedMs : null
  );

  // Update camera immediately on toggle / grid change
  useEffect(() => {
    if (fezCamera) {
      const h = snake[0];
      if (h) {
        setBaseRot(faceToRotation[h.face]);
        setTiltRot(computeTilt(h, gridSize));
      }
    }
  }, [fezCamera, gridSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Layout sizing
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

  const snakeSet = useMemo(() => new Set(snake.map(serialize)), [snake]);
  const headKey = serialize(snake[0]);
  const foodKey = food ? serialize(food) : "";

  // Face transforms inside the cube (fixed, relative to cube center)
  const faceTransforms: Record<Face, string> = {
    F: `translateZ(${half}px)`,
    B: `rotateY(180deg) translateZ(${half}px)`,
    R: `rotateY(90deg) translateZ(${half}px)`,
    L: `rotateY(-90deg) translateZ(${half}px)`,
    U: `rotateX(90deg) translateZ(${half}px)`,
    D: `rotateX(-90deg) translateZ(${half}px)`,
  };

  const faceLabels: Record<Face, string> = {
    F: "Front", R: "Right", B: "Back", L: "Left", U: "Up", D: "Down"
  };

  return (
    <div className="w-full h-full p-4 flex flex-col items-center gap-4">
      <style>{`
        .hud { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif; }
        .scene { perspective: 1000px; }
        .rig, .gimbal, .cube { transform-style: preserve-3d; }
        .face { position: absolute; left: 50%; top: 50%; transform-style: preserve-3d; }
        .grid { position: absolute; left: 0; top: 0; display: grid; }
        .cell { box-sizing: border-box; border: 1px solid rgba(255,255,255,0.08); }
        .cell.snake { background: linear-gradient(145deg, #00d084, #16a34a); border-color: rgba(0,0,0,0.15); }
        .cell.head  { background: linear-gradient(145deg, #22d3ee, #0284c7); border-color: rgba(0,0,0,0.25); }
        .cell.food  { background: radial-gradient(circle at 40% 35%, #f43f5e, #be123c); border-color: rgba(0,0,0,0.2); }
        .faceLabel { position: absolute; left: 8px; top: 8px; font-size: 12px; color: rgba(255,255,255,0.65); }
        .shadow { box-shadow: 0 20px 40px rgba(0,0,0,0.25), inset 0 0 40px rgba(255,255,255,0.02); border-radius: 18px; }
      `}</style>

      {/* HUD */}
      <div className="hud w-full max-w-4xl grid grid-cols-2 md:grid-cols-4 gap-3 items-center">
        <div className="col-span-2 md:col-span-1 flex items-center gap-3">
          <button
            className={`px-4 py-2 rounded-2xl shadow text-white ${running ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
            onClick={() => setRunning(r => !r)}
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
          <input type="range" min={60} max={400} step={10} value={speedMs}
                 onChange={(e) => setSpeedMs(parseInt(e.target.value))} />
        </div>
        <div className="col-span-1 flex flex-col">
          <label className="text-sm text-slate-300">Grid: {gridSize} × {gridSize}</label>
          <input type="range" min={6} max={20} step={1} value={gridSize}
                 onChange={(e) => setGridSize(parseInt(e.target.value))} />
        </div>
        <div className="col-span-2 md:col-span-1 flex items-center gap-2 justify-end">
          <label className="flex items-center gap-2 text-slate-200">
            <input type="checkbox" checked={fezCamera}
                   onChange={(e) => setFezCamera(e.target.checked)} />
            Camera follow (Fez-style)
          </label>
        </div>
      </div>

      {/* Scene */}
      <div ref={containerRef} className="w-full max-w-4xl flex flex-col items-center gap-3">
        <div className="text-slate-200 hud flex gap-6">
          <div>Score: <span className="font-semibold">{score}</span></div>
          <div>Level: <span className="font-semibold">{level}</span></div>
          {gameOver && <div className="text-rose-400 font-semibold">Game Over — press R to reset</div>}
        </div>

        <div className="scene shadow bg-gradient-to-b from-slate-800 to-slate-900 p-6"
             style={{ width: size, height: size }}>
          {/* Outer base rig: brings *current face* to the front */}
          <div
            className="rig w-full h-full relative"
            style={{
              transition: fezCamera ? "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
              transform: `rotateX(${baseRot.x}deg) rotateY(${baseRot.y}deg) rotateZ(${baseRot.z}deg)`,
            }}
          >
            {/* Inner gimbal: small local tilt toward head */}
            <div
              className="gimbal w-full h-full relative"
              style={{
                transition: fezCamera ? "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
                transform: `rotateX(${tiltRot.x}deg) rotateY(${tiltRot.y}deg) rotateZ(${tiltRot.z}deg)`,
              }}
            >
              {/* Actual cube */}
              <div className="cube w-full h-full relative">
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
          </div>
        </div>

        <div className="hud text-slate-300 text-sm text-center leading-relaxed max-w-3xl">
          <p className="mb-2">
            <strong>How to play:</strong> Use <kbd>W/A/S/D</kbd> or the arrow keys to steer. The snake traverses edges onto adjacent faces.
            The camera shows the current face (Top when on U, Bottom when on D) and follows the head. Press <kbd>Space</kbd> to pause/resume, <kbd>R</kbd> to reset.
          </p>
          <p>
            Tip: You can change <em>Speed</em> and <em>Grid</em> size mid-game. Every 5 apples, the level increases and the snake speeds up slightly.
          </p>
        </div>
      </div>
    </div>
  );
}
