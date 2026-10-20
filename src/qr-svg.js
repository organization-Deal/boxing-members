/**
 * Self-hosted QR SVG for printing membership-only links.
 * QR modules under ./vendor/qr adapted from qrcode-terminal's MIT/Apache licensed vendor.
 */
import QRCode from './vendor/qr/index.js';
import ErrorLevel from './vendor/qr/QRErrorCorrectLevel.js';

export function membershipQrSvg(url) {
  if (typeof url !== 'string' || !/^https:\/\/liff\.line\.me\/[0-9]{10}-[A-Za-z0-9_-]+\/m\/BX[A-Z0-9-]{2,20}$/.test(url)) {
    throw new TypeError('INVALID_QR_TARGET');
  }
  const qr = new QRCode(-1, ErrorLevel.M);
  qr.addData(url);
  qr.make();
  const side = qr.getModuleCount();
  const margin = 4;
  const size = side + margin * 2;
  const rows = [];
  for (let y = 0; y < side; y++) {
    // Merge runs into single SVG path commands, keeping file compact.
    for (let x = 0; x < side;) {
      if (!qr.isDark(y, x)) { x++; continue; }
      const start = x;
      while (x < side && qr.isDark(y, x)) x++;
      rows.push(`M${start + margin} ${y + margin}h${x - start}v1h-${x - start}z`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 8}" height="${size * 8}" shape-rendering="crispEdges" role="img" aria-label="DEAL Boxing Membership QR">` +
    `<rect width="100%" height="100%" fill="#fff"/><path d="${rows.join('')}" fill="#111"/></svg>`;
}
