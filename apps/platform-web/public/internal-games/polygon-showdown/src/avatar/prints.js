// Printed fabrics, painted once per item onto a small canvas. An item's print
// comes from its id when the name promises one ("Striped", "Grid", "Starfield");
// anything else is plain cloth with accent trim, so new catalog rows just work.

const TAU = Math.PI * 2;

const PRINTS = Object.freeze({
  "top-breeze": "stripes",
  "top-bolt": "bolt",
  "top-grid-flannel": "plaid",
  "top-aurora-blouse": "aurora",
  "top-starfield": "stars",
  "top-hex-hoodie": "hex",
  "top-comet-hoodie": "comet",
  "top-angle-knit": "chevron",
  "bottom-jeans": "denim",
  "bottom-nebula": "nebula",
  "outfit-garden-wrap": "floral",
  "outfit-picnic": "gingham",
  "outfit-prism-gown": "prism",
  "outfit-moonlight": "aurora",
  "outfit-celestial": "stars",
  "jacket-galaxy-puffer": "stars",
  "jacket-phoenix": "flame",
  "bottom-gilded-pleat": "shimmer"
});

export function printFor(item) {
  return PRINTS[item.id] ?? null;
}

function star(ctx, x, y, r, points = 4) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    const d = i % 2 ? r * 0.34 : r;
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function hexagon(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU + Math.PI / 6;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function paintPrint(kind, main, accent) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const second = accent ?? "#FFFFFF";
  ctx.fillStyle = main;
  ctx.fillRect(0, 0, W, H);
  const rand = rng(kind.length * 977 + main.charCodeAt(2));

  switch (kind) {
    case "stripes": {
      ctx.fillStyle = second;
      const count = 9;
      for (let i = 0; i < count; i += 1) ctx.fillRect(0, (i / count) * H, W, (H / count) * 0.44);
      break;
    }
    case "bolt": {
      ctx.save();
      ctx.translate(W * 0.5, H * 0.34);
      ctx.fillStyle = second;
      ctx.beginPath();
      const s = 1.05;
      const pts = [
        [14, -74],
        [-34, 8],
        [-2, 8],
        [-14, 74],
        [38, -14],
        [6, -14],
        [26, -74]
      ];
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * s * 0.45, y * s) : ctx.lineTo(x * s * 0.45, y * s)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case "plaid": {
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = second;
      const step = 48;
      for (let x = 0; x < W; x += step) ctx.fillRect(x, 0, step * 0.42, H);
      for (let y = 0; y < H; y += step) ctx.fillRect(0, y, W, step * 0.42);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#FFFFFF";
      for (let x = step * 0.7; x < W; x += step) ctx.fillRect(x, 0, 2.2, H);
      for (let y = step * 0.7; y < H; y += step) ctx.fillRect(0, y, W, 2.2);
      ctx.globalAlpha = 1;
      break;
    }
    case "aurora": {
      const gradient = ctx.createLinearGradient(0, H, W * 0.3, 0);
      gradient.addColorStop(0, main);
      gradient.addColorStop(0.5, second);
      gradient.addColorStop(1, main);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case "stars": {
      ctx.fillStyle = second;
      for (let i = 0; i < 90; i += 1) {
        ctx.globalAlpha = 0.45 + rand() * 0.55;
        star(ctx, rand() * W, rand() * H, 3 + rand() * 7);
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 12; i += 1) star(ctx, rand() * W, rand() * H, 10 + rand() * 6);
      break;
    }
    case "hex": {
      ctx.strokeStyle = second;
      ctx.lineWidth = 7;
      const cx = W * 0.5;
      const cy = H * 0.4;
      hexagon(ctx, cx, cy, 38);
      ctx.stroke();
      ctx.lineWidth = 3.5;
      for (const [dx, dy] of [
        [62, -32],
        [-62, -32],
        [62, 34],
        [-62, 34],
        [0, -70],
        [0, 70]
      ]) {
        hexagon(ctx, cx + dx, cy + dy, 25);
        ctx.stroke();
      }
      break;
    }
    case "comet": {
      ctx.save();
      ctx.translate(W * 0.5, H * 0.36);
      ctx.rotate(-0.5);
      const gradient = ctx.createLinearGradient(-110, 0, 40, 0);
      gradient.addColorStop(0, "rgba(255,255,255,0)");
      gradient.addColorStop(1, second);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(-120, 0);
      ctx.lineTo(30, -22);
      ctx.lineTo(30, 22);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = second;
      star(ctx, 34, 0, 34, 5);
      ctx.restore();
      break;
    }
    case "chevron": {
      ctx.strokeStyle = second;
      ctx.lineWidth = 11;
      ctx.lineJoin = "miter";
      for (let band = 0; band < 3; band += 1) {
        const y = H * 0.16 + band * 40;
        ctx.beginPath();
        for (let x = -40; x <= W + 40; x += 40) ctx.lineTo(x, y + (Math.abs(((x + 40) % 80) - 40) / 40) * 22);
        ctx.stroke();
      }
      // A soft knit grain over the whole cloth.
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = "#000000";
      for (let x = 0; x < W; x += 8) ctx.fillRect(x, 0, 3, H);
      ctx.globalAlpha = 1;
      break;
    }
    case "denim": {
      ctx.globalAlpha = 0.11;
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1;
      for (let i = -H; i < W; i += 5) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + H, H);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#FFFFFF";
      for (let i = 0; i < 14; i += 1) ctx.fillRect(rand() * W, rand() * H, 2 + rand() * 90, 2);
      ctx.globalAlpha = 1;
      break;
    }
    case "nebula": {
      for (let i = 0; i < 26; i += 1) {
        const x = rand() * W;
        const y = rand() * H;
        const r = 30 + rand() * 80;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `${second}55`);
        gradient.addColorStop(1, `${second}00`);
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.fillStyle = "#FFFFFF";
      for (let i = 0; i < 40; i += 1) star(ctx, rand() * W, rand() * H, 1.5 + rand() * 2.5);
      break;
    }
    case "floral": {
      for (let i = 0; i < 60; i += 1) {
        const x = rand() * W;
        const y = rand() * H;
        ctx.fillStyle = second;
        for (let p = 0; p < 5; p += 1) {
          const a = (p / 5) * TAU;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 4.6, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = main;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case "gingham": {
      ctx.fillStyle = "rgba(255,255,255,0.42)";
      const step = 42;
      for (let x = 0; x < W; x += step * 2) ctx.fillRect(x, 0, step, H);
      for (let y = 0; y < H; y += step * 2) ctx.fillRect(0, y, W, step);
      break;
    }
    case "prism": {
      const gradient = ctx.createLinearGradient(0, H, 0, 0);
      gradient.addColorStop(0, second);
      gradient.addColorStop(0.55, main);
      gradient.addColorStop(1, main);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#FFFFFF";
      for (let i = 0; i < 70; i += 1) {
        ctx.globalAlpha = 0.5 + rand() * 0.5;
        star(ctx, rand() * W, H * (0.25 + rand() * 0.75), 2.5 + rand() * 4);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "flame": {
      const gradient = ctx.createLinearGradient(0, 0, 0, H);
      gradient.addColorStop(0, main);
      gradient.addColorStop(0.62, main);
      gradient.addColorStop(1, second);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = second;
      for (let x = -20; x < W + 20; x += 34) {
        const height = 90 + rand() * 120;
        ctx.beginPath();
        ctx.moveTo(x - 24, H);
        ctx.quadraticCurveTo(x - 8, H - height * 0.55, x + 4, H - height);
        ctx.quadraticCurveTo(x + 18, H - height * 0.4, x + 28, H);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "shimmer": {
      ctx.fillStyle = second;
      for (let i = 0; i < 40; i += 1) {
        ctx.globalAlpha = 0.25 + rand() * 0.45;
        ctx.fillRect(rand() * W, 0, 2 + rand() * 6, H);
      }
      ctx.globalAlpha = 1;
      break;
    }
    default:
      break;
  }
  return canvas;
}
