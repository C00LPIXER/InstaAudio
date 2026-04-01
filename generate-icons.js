const fs = require("fs");

function createSVG(size) {
  const s = size;
  const r = s * 0.22;
  const sw = s * 0.035;
  const sw2 = s * 0.028;

  let svg = "";
  svg += "<svg xmlns='http://www.w3.org/2000/svg' width='" + s + "' height='" + s + "' viewBox='0 0 " + s + " " + s + "'>\n";
  svg += "  <defs>\n";
  svg += "    <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>\n";
  svg += "      <stop offset='0%' stop-color='#0095f6'/>\n";
  svg += "      <stop offset='100%' stop-color='#833ab4'/>\n";
  svg += "    </linearGradient>\n";
  svg += "  </defs>\n";
  svg += "  <rect width='" + s + "' height='" + s + "' rx='" + r + "' ry='" + r + "' fill='url(#bg)'/>\n";
  svg += "  <g transform='translate(" + (s / 2) + "," + (s / 2) + ")' fill='none' stroke='#fff' stroke-width='" + sw + "' stroke-linecap='round'>\n";
  // Mic body
  svg += "    <rect x='" + (-s * 0.1) + "' y='" + (-s * 0.22) + "' width='" + (s * 0.2) + "' height='" + (s * 0.32) + "' rx='" + (s * 0.1) + "' fill='#fff' stroke='none'/>\n";
  // Arc
  svg += "    <path d='M" + (-s * 0.17) + "," + (s * 0.04) + " A" + (s * 0.17) + "," + (s * 0.17) + " 0 0,0 " + (s * 0.17) + "," + (s * 0.04) + "'/>\n";
  // Stem
  svg += "    <line x1='0' y1='" + (s * 0.18) + "' x2='0' y2='" + (s * 0.28) + "'/>\n";
  // Base
  svg += "    <line x1='" + (-s * 0.1) + "' y1='" + (s * 0.28) + "' x2='" + (s * 0.1) + "' y2='" + (s * 0.28) + "'/>\n";
  // Download arrow (bottom-right)
  svg += "    <g transform='translate(" + (s * 0.22) + "," + (s * 0.18) + ")' stroke-width='" + sw2 + "'>\n";
  svg += "      <line x1='0' y1='" + (-s * 0.09) + "' x2='0' y2='" + (s * 0.02) + "'/>\n";
  svg += "      <polyline points='" + (-s * 0.05) + "," + (-s * 0.02) + " 0," + (s * 0.04) + " " + (s * 0.05) + "," + (-s * 0.02) + "'/>\n";
  svg += "    </g>\n";
  svg += "  </g>\n";
  svg += "</svg>";
  return svg;
}

function drawIcon(canvas) {
  const s = canvas.width;
  const ctx = canvas.getContext("2d");

  // Background: rounded square with gradient
  const r = s * 0.22;
  const grad = ctx.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, "#0095f6");
  grad.addColorStop(1, "#833ab4");

  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(s - r, 0);
  ctx.quadraticCurveTo(s, 0, s, r);
  ctx.lineTo(s, s - r);
  ctx.quadraticCurveTo(s, s, s - r, s);
  ctx.lineTo(r, s);
  ctx.quadraticCurveTo(0, s, 0, s - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Icon: white circle with camera glyph
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.3, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.15, 0, 2 * Math.PI);
  ctx.fillStyle = grad;
  ctx.fill();
}

[16, 48, 128].forEach(function (size) {
  const svg = createSVG(size);
  fs.writeFileSync("c:/Users/HP/Downloads/InstaAudio/icons/icon-" + size + ".svg", svg);
  console.log("Created icon-" + size + ".svg");
});

console.log("Done! SVG icons created.");

["c128", "c48", "c16"].forEach(id => drawIcon(document.getElementById(id)));
