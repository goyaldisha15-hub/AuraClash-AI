import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const $ = (id) => document.getElementById(id),
  cam = $("cam"),
  g = $("stage").getContext("2d"),
  W = 1280,
  H = 640;
const CFG = {
  on: 0.25,
  off: 0.12,
  jon: 0.35,
  joff: 0.18,
  eye: 0.55,
  hold: 0.3,
  atkCD: 0.6,
  spCD: 4,
  dbl: 0.7,
  cut: 0.3,
};
const mk = (n) => ({
  name: n,
  mode: "brow",
  jaw: 0,
  jbase: 0,
  base: 0,
  brow: 0,
  eyes: 0,
  face: false,
  up: false,
  last: -9,
  atk: 0,
  sp: 0,
  closed: 0,
  shield: false,
  hp: 100,
  wins: 0,
  hit: 0,
  act: 0,
  lbl: "",
  cal: [],
});
const P = [mk("Player 1"), mk("Player 2")],
  sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lm,
  state = "idle",
  calibrating = false,
  shake = 0,
  round = 1,
  msg = "",
  lastVT = -1,
  prev = performance.now();
const fx = { sparks: [], floats: [], shots: [] };
const show = (id) =>
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.toggle("active", s.id === id));
const active = () => document.querySelector(".screen.active").id;

$("startBtn").onclick = async () => {
  show("calib");
  try {
    $("calMsg").textContent = "Loading face tracker...";
    const fs = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    );
    lm = await FaceLandmarker.createFromOptions(fs, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 2,
      outputFaceBlendshapes: true,
    });
    cam.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: "user" },
    });
    await cam.play();
    $("calMsg").textContent =
      "Stand side by side: Player 1 on the LEFT, Player 2 on the RIGHT, both facing the camera.";
  } catch (e) {
    $("calMsg").textContent =
      e.name === "NotAllowedError"
        ? "Camera access was denied. Allow it in the browser and reload."
        : "Could not start tracking: " + e.message;
  }
};
$("calBtn").onclick = async () => {
  $("calBtn").disabled = true;
  P.forEach((p) => (p.cal = []));
  calibrating = true;
  for (let t = 3; t > 0; t--) {
    $("calMsg").textContent = "Relax your face... " + t;
    await sleep(1000);
  }
  calibrating = false;
  if (P.some((p) => p.cal.length < 15)) {
    $("calMsg").textContent = "Both faces must stay visible. Try again.";
    return;
  }
  P.forEach((p) => {
    p.base = p.cal.reduce((a, b) => a + b[0], 0) / p.cal.length;
    p.jbase = p.cal.reduce((a, b) => a + b[1], 0) / p.cal.length;
  });
  show("names");
};
$("goBtn").onclick = () => {
  P[0].name = $("n1").value || "Player 1";
  P[1].name = $("n2").value || "Player 2";
  P[0].mode = $("m1").value;
  P[1].mode = $("m2").value;
  newMatch();
};
$("againBtn").onclick = newMatch;
$("shareBtn").onclick = () =>
  $("card").toBlob(async (b) => {
    const f = new File([b], "eye-battle.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [f] }))
      try {
        await navigator.share({ files: [f], title: "Eye Battle" });
        return;
      } catch {}
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "eye-battle.png";
    a.click();
  });
// dev fallback: A/S = P1 attack/special, J/K = P2
addEventListener("keydown", (e) => {
  if (state !== "fight") return;
  ({
    a: () => strike(0, 10),
    s: () => strike(0, 20, 1),
    j: () => strike(1, 10),
    k: () => strike(1, 20, 1),
  })[e.key]?.();
});

function track() {
  if (!lm || cam.readyState < 2 || cam.currentTime === lastVT) return;
  lastVT = cam.currentTime;
  const r = lm.detectForVideo(cam, performance.now());
  P.forEach((p) => (p.face = false));
  let f = r.faceLandmarks
    .map((l, i) => ({
      sx: 1 - l[1].x,
      w: Math.abs(l[454].x - l[234].x),
      b: r.faceBlendshapes[i].categories,
    }))
    .sort((a, b) => b.w - a.w)
    .slice(0, 2)
    .sort((a, b) => a.sx - b.sx);
  if (f.length === 1) f = f[0].sx < 0.5 ? [f[0], null] : [null, f[0]];
  f.forEach((d, i) => {
    if (!d) return;
    const s = {},
      p = P[i];
    d.b.forEach((c) => (s[c.categoryName] = c.score));
    p.face = true;
    p.brow = (s.browInnerUp + s.browOuterUpLeft + s.browOuterUpRight) / 3;
    p.eyes = (s.eyeBlinkLeft + s.eyeBlinkRight) / 2;
    p.jaw = s.jawOpen;
    if (calibrating) p.cal.push([p.brow, p.jaw]);
  });
}
function gesture(i, dt, t) {
  const p = P[i];
  p.atk = Math.max(0, p.atk - dt);
  p.sp = Math.max(0, p.sp - dt);
  if (!p.face) {
    p.shield = false;
    p.up = false;
    return;
  }
  const mouth = p.mode === "mouth",
    d = mouth ? p.jaw - p.jbase : p.brow - p.base,
    on = mouth ? CFG.jon : CFG.on,
    off = mouth ? CFG.joff : CFG.off;
  p.closed = p.eyes > CFG.eye ? p.closed + dt : 0;
  p.shield = p.closed > CFG.hold;
  if (p.shield) {
    p.up = false;
    return;
  }
  if (!p.up && d > on) {
    p.up = true;
    const dbl = t - p.last < CFG.dbl;
    p.last = t;
    if (dbl && p.sp <= 0) {
      strike(i, 20, 1);
      p.sp = CFG.spCD;
      p.atk = CFG.atkCD;
      p.last = -9;
    } else if (p.atk <= 0) {
      strike(i, 10);
      p.atk = CFG.atkCD;
    }
  } else if (p.up && d < off) p.up = false;
}
function strike(i, dmg, sp) {
  const p = P[i],
    o = P[1 - i];
  p.act = 0.5;
  p.lbl = sp ? "SPECIAL ATTACK!" : "ATTACK!";
  fx.shots.push({
    x: i ? W - 300 : 300,
    y: H - 290,
    dir: i ? -1 : 1,
    sp,
    tx: i ? 300 : W - 300,
    done: () => {
      if (state !== "fight") return;
      const d = o.shield ? Math.ceil(dmg * CFG.cut) : dmg;
      o.hp = Math.max(0, o.hp - d);
      o.hit = 0.4;
      shake = sp ? 22 : 10;
      burst(
        i ? 300 : W - 300,
        H - 290,
        sp ? 40 : 18,
        o.shield ? "#0ff" : "#ff0",
      );
      float(
        i ? 300 : W - 300,
        H - 400,
        o.shield
          ? "BLOCKED"
          : sp
            ? "EPIC ATTACK!"
            : Math.random() < 0.5
              ? "EYEBROW POWER!"
              : "-" + d,
        sp ? "#f2f" : "#fff",
      );
      if (o.hp <= 0) knockout(i);
    },
  });
}
const burst = (x, y, n, c) => {
  for (let k = 0; k < n; k++)
    fx.sparks.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 700,
      vy: (Math.random() - 0.8) * 600,
      l: 0.6,
      c,
    });
};
const float = (x, y, t, c) => fx.floats.push({ x, y, t, c, l: 1.2 });

async function newMatch() {
  P.forEach((p) => (p.wins = 0));
  round = 1;
  show("arena");
  startRound();
}
async function startRound() {
  P.forEach((p) =>
    Object.assign(p, {
      hp: 100,
      atk: 0,
      sp: 0,
      shield: false,
      up: false,
      act: 0,
      hit: 0,
    }),
  );
  fx.shots.length = 0;
  state = "count";
  for (const m of ["3", "2", "1", "FIGHT!"]) {
    msg = m;
    await sleep(m === "FIGHT!" ? 700 : 800);
  }
  msg = "";
  state = "fight";
}
async function knockout(w) {
  state = "ko";
  P[w].wins++;
  float(W / 2, H / 2, "KNOCKOUT!", "#ff0");
  shake = 30;
  await sleep(1800);
  const rr = $("roundRes");
  rr.hidden = false;
  if (P[w].wins >= 2) {
    rr.innerHTML = `<div>${P[w].name} takes the match!</div>`;
    await sleep(2200);
    rr.hidden = true;
    return finish(w);
  }
  rr.innerHTML = `<div>Round ${round}: ${P[w].name} wins</div><div>${P[0].wins} - ${P[1].wins}</div><small>Next round starting...</small>`;
  await sleep(3000);
  rr.hidden = true;
  round++;
  startRound();
}
function finish(w) {
  state = "over";
  show("final");
  const c = $("card").getContext("2d"),
    l = P[1 - w];
  const title =
    l.wins === 0
      ? "Flawless Brow Master"
      : P[w].hp > 50
        ? "Lord of the Eyebrows"
        : "Comeback Brow King";
  c.fillStyle = "#07051a";
  c.fillRect(0, 0, 640, 360);
  c.strokeStyle = w ? "#ff2d95" : "#00f0ff";
  c.lineWidth = 8;
  c.strokeRect(10, 10, 620, 340);
  c.textAlign = "center";
  c.fillStyle = "#fff";
  c.font = "900 40px Impact,sans-serif";
  c.shadowColor = "#0ff";
  c.shadowBlur = 18;
  c.fillText("EYE BATTLE", 320, 70);
  c.font = "900 64px Impact,sans-serif";
  c.fillStyle = w ? "#ff2d95" : "#00f0ff";
  c.shadowColor = c.fillStyle;
  c.fillText(P[w].name.toUpperCase(), 320, 160);
  c.fillStyle = "#fff";
  c.font = "28px sans-serif";
  c.shadowBlur = 0;
  c.fillText(
    "WINS  " + P[w].wins + " - " + l.wins + "  vs " + l.name,
    320,
    215,
  );
  c.fillStyle = "#ff0";
  c.font = "800 34px Impact,sans-serif";
  c.fillText(title, 320, 285);
}

function camHalf(c, i) {
  if (cam.readyState < 2) return;
  const x = c.getContext("2d"),
    vw = cam.videoWidth,
    vh = cam.videoHeight;
  x.save();
  x.scale(-1, 1);
  x.drawImage(
    cam,
    i ? 0 : vw / 2,
    0,
    vw / 2,
    vh,
    -c.width,
    0,
    c.width,
    c.height,
  );
  x.restore();
}
const E = (x, y, rx, ry) => {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, 7);
};
function fighter(i, t) {
  const p = P[i],
    o = P[1 - i],
    col = i ? "#ff2d95" : "#00f0ff",
    dead = p.hp <= 0,
    win = o.hp <= 0 && !dead;
  g.save();
  g.translate(i ? W - 300 : 300, H - 100);
  if (i) g.scale(-1, 1);
  const bob =
    Math.sin(t * 4 + i) * 4 + (win ? Math.abs(Math.sin(t * 8)) * -30 : 0);
  if (dead) {
    g.rotate(-1.3);
    g.translate(-60, 50);
  }
  if (p.hit > 0) g.translate(-Math.random() * 14, 0);
  g.fillStyle = "#0008";
  E(0, 0, 80, 14);
  g.fill();
  g.shadowColor = col;
  g.shadowBlur = 25;
  g.fillStyle = col;
  g.beginPath();
  g.roundRect(-45, -150 + bob, 90, 130, 30);
  g.fill();
  g.strokeStyle = col;
  g.lineWidth = 16;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(40, -110 + bob);
  win
    ? g.lineTo(65, -200 + bob)
    : p.act > 0
      ? g.lineTo(115, -125 + bob)
      : g.lineTo(70, -75 + bob);
  g.stroke();
  g.beginPath();
  g.moveTo(-25, -30);
  g.lineTo(-30, 0);
  g.moveTo(25, -30);
  g.lineTo(30, 0);
  g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = "#ffe0b3";
  E(0, -210 + bob, 70, 70);
  g.fill();
  const d =
      p.face && p.mode === "brow"
        ? Math.max(0, Math.min(1, (p.brow - p.base) * 2.5))
        : 0,
    sh = p.shield || (p.eyes > CFG.eye && p.face);
  const jo =
      p.face && p.mode === "mouth"
        ? Math.max(0, Math.min(1, (p.jaw - p.jbase) * 2))
        : 0,
    open = p.act > 0 || jo > 0.25;
  g.strokeStyle = "#222";
  g.fillStyle = "#222";
  g.lineWidth = 7;
  for (const s of [-1, 1]) {
    const ex = s * 26,
      ey = -215 + bob;
    if (dead) {
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(ex - 9, ey - 9);
      g.lineTo(ex + 9, ey + 9);
      g.moveTo(ex + 9, ey - 9);
      g.lineTo(ex - 9, ey + 9);
      g.stroke();
      g.lineWidth = 7;
    } else if (sh) {
      g.beginPath();
      g.moveTo(ex - 12, ey);
      g.lineTo(ex + 12, ey);
      g.stroke();
    } else {
      g.fillStyle = "#fff";
      E(ex, ey, 15, 17 + d * 5);
      g.fill();
      g.fillStyle = "#222";
      E(ex + 3, ey, 6, 6);
      g.fill();
    }
    const by = -250 + bob - d * 26,
      tilt = p.act > 0 ? -s * 12 : 0;
    g.beginPath();
    g.moveTo(ex - 18, by + (p.act > 0 ? -tilt : 0));
    g.lineTo(ex + 18, by + tilt);
    g.stroke();
  }
  g.lineWidth = 5;
  g.beginPath();
  if (win) {
    g.arc(0, -185 + bob, 24, 0.1, 3);
  } else if (dead || p.hit > 0) {
    g.moveTo(-18, -170 + bob);
    g.quadraticCurveTo(0, -195 + bob, 18, -170 + bob);
  } else if (open) {
    E(0, -175 + bob, 16, 12 + jo * 12);
  } else (g.moveTo(-14, -172 + bob), g.lineTo(14, -172 + bob));
  open && !win && !dead ? g.fill() : g.stroke();
  if (p.shield) {
    g.strokeStyle = "#0ff";
    g.fillStyle = "#0ff3";
    g.lineWidth = 5;
    g.shadowColor = "#0ff";
    g.shadowBlur = 20;
    E(0, -130, 130, 150);
    g.fill();
    g.stroke();
  }
  g.restore();
}
function bar(i, t) {
  const p = P[i],
    x = i ? 720 : 40,
    w = 520,
    col = i ? "#ff2d95" : "#00f0ff";
  g.fillStyle = "#000a";
  g.fillRect(x, 30, w, 30);
  g.shadowColor = col;
  g.shadowBlur = 16;
  g.fillStyle = p.hp > 25 ? col : "#f33";
  const fw = (w * p.hp) / 100;
  g.fillRect(i ? x : x + w - fw, 30, fw, 30);
  g.shadowBlur = 0;
  g.strokeStyle = "#fff";
  g.lineWidth = 3;
  g.strokeRect(x, 30, w, 30);
  g.fillStyle = "#fff";
  g.font = "800 24px Impact,sans-serif";
  g.textAlign = i ? "right" : "left";
  g.fillText(p.name, i ? x + w : x, 24);
  g.font = "16px sans-serif";
  g.fillStyle = p.sp <= 0 ? "#ff0" : "#999";
  g.fillText(
    p.sp <= 0 ? "SPECIAL READY" : "special " + p.sp.toFixed(1) + "s",
    i ? x + w : x,
    86,
  );
  for (let k = 0; k < 2; k++) {
    g.fillStyle = k < p.wins ? "#ff0" : "#333";
    g.beginPath();
    g.arc(i ? x + k * 26 + 10 : x + w - k * 26 - 10, 102, 9, 0, 7);
    g.fill();
  }
}
function render(dt, t) {
  g.save();
  g.clearRect(0, 0, W, H);
  if (shake > 0) {
    g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shake = Math.max(0, shake - 60 * dt);
  }
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, "#10062e");
  gr.addColorStop(1, "#2a0b5a");
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "#ff2d9544";
  g.lineWidth = 2;
  for (let k = -10; k <= 10; k++) {
    g.beginPath();
    g.moveTo(W / 2 + k * 40, H - 110);
    g.lineTo(W / 2 + k * 190, H);
    g.stroke();
  }
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    g.moveTo(0, H - 110 + k * k * 7);
    g.lineTo(W, H - 110 + k * k * 7);
    g.stroke();
  }
  P.forEach((p, i) => {
    p.act = Math.max(0, p.act - dt);
    p.hit = Math.max(0, p.hit - dt);
    fighter(i, t);
    bar(i, t);
  });
  g.textAlign = "center";
  g.fillStyle = "#fff";
  g.shadowColor = "#ff0";
  g.shadowBlur = 20;
  g.font = "900 56px Impact,sans-serif";
  g.fillText("VS", W / 2, 70);
  g.font = "20px sans-serif";
  g.shadowBlur = 0;
  g.fillText("Round " + round, W / 2, 100);
  fx.shots = fx.shots.filter((s) => {
    s.x += s.dir * 1500 * dt;
    const hit = s.dir > 0 ? s.x >= s.tx : s.x <= s.tx;
    if (hit) {
      s.done();
      return false;
    }
    g.fillStyle = s.sp ? "#f2f" : "#ff0";
    g.shadowColor = g.fillStyle;
    g.shadowBlur = 25;
    E(s.x, s.y, s.sp ? 34 : 20, s.sp ? 34 : 20);
    g.fill();
    return true;
  });
  fx.sparks = fx.sparks.filter(
    (s) =>
      (s.l -= dt) > 0 &&
      ((s.x += s.vx * dt),
      (s.y += (s.vy += 900 * dt) * dt),
      (g.fillStyle = s.c),
      g.fillRect(s.x, s.y, 6, 6),
      1),
  );
  g.font = "900 48px Impact,sans-serif";
  fx.floats = fx.floats.filter(
    (f) =>
      (f.l -= dt) > 0 &&
      ((f.y -= 60 * dt),
      (g.globalAlpha = Math.min(1, f.l)),
      (g.fillStyle = f.c),
      (g.shadowColor = f.c),
      (g.shadowBlur = 15),
      g.fillText(f.t, f.x, f.y),
      (g.globalAlpha = 1),
      1),
  );
  if (msg) {
    g.font = "900 140px Impact,sans-serif";
    g.fillStyle = "#fff";
    g.shadowColor = "#f0f";
    g.shadowBlur = 40;
    g.fillText(msg, W / 2, H / 2);
  }
  g.restore();
}
function status(i) {
  const p = P[i],
    e = $("st" + (i + 1));
  let s, d;
  if (!p.face) [s, d] = ["NO FACE", "no"];
  else if (p.shield) [s, d] = ["SHIELD ACTIVE", "sh"];
  else if (p.act > 0) [s, d] = [p.lbl, p.lbl[0] === "S" ? "sp" : "atk"];
  else [s, d] = ["READY", "r"];
  e.textContent = s;
  e.dataset.s = d;
}
function loop(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  track();
  const a = active();
  if (a === "calib") {
    camHalf($("cal1"), 0);
    camHalf($("cal2"), 1);
    P.forEach(
      (p, i) =>
        ($("cs" + (i + 1)).textContent = p.face ? "face found" : "no face"),
    );
    $("calBtn").disabled = calibrating || !(P[0].face && P[1].face) || !lm;
  }
  if (a === "arena") {
    if (state === "fight") P.forEach((_, i) => gesture(i, dt, now / 1000));
    camHalf($("cv1"), 0);
    camHalf($("cv2"), 1);
    render(dt, now / 1000);
    status(0);
    status(1);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
