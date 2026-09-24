/**
 * Aura Music - Lightweight Mobile QR Generator for Android Pairing
 */

export function renderQRCodeSvg(text, size = 180) {
  // Use quick encoded Google Chart API / QR Server fallback image or clean vector SVG
  const encodedText = encodeURIComponent(text);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedText}&bgcolor=0f121d&color=6366f1&margin=1`;
  
  return `
    <img 
      src="${qrUrl}" 
      alt="QR Code to open on Android" 
      width="${size}" 
      height="${size}"
      style="border-radius: 12px; border: 2px solid rgba(99, 102, 241, 0.3); background: #0f121d; box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);"
      onerror="this.parentElement.innerHTML='<div style=\\'padding: 20px; color: var(--text-secondary); text-align: center;\\'>Open on your phone: <br><b style=\\'color: #6366f1; font-size: 1.1rem;\\'>${text}</b></div>'"
    />
  `;
}
