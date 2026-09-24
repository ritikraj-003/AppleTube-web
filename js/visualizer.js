/**
 * Aura Music - Real-Time Audio Visualizer
 * Renders high-frame-rate canvas audio spectrum & harmonic waves
 */

import { player } from './player.js';

export class AudioVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.animationId = null;
    this.isRunning = false;

    this.simulatedPhase = 0;

    if (this.canvas) {
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }
  }

  resize() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }
    this.width = rect.width;
    this.height = rect.height;
  }

  start() {
    if (!this.canvas || window.getComputedStyle(this.canvas).display === 'none') return;
    if (this.isRunning) return;
    this.isRunning = true;
    this.render();
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.clear();
  }

  clear() {
    if (!this.ctx || !this.width) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  render() {
    if (!this.isRunning) return;

    this.animationId = requestAnimationFrame(() => this.render());

    if (!this.ctx || !this.width || !this.height) return;

    this.ctx.clearRect(0, 0, this.width, this.height);

    const isPlaying = !player.audio.paused;

    // Use Web Audio analyser data if connected, otherwise generate organic wave if playing
    if (player.audioConnected && player.analyser && isPlaying) {
      const bufferLength = player.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      player.analyser.getByteFrequencyData(dataArray);

      this.drawFrequencyBars(dataArray, bufferLength);
    } else if (isPlaying) {
      this.drawSimulatedHarmonics();
    } else {
      this.drawIdleLine();
    }
  }

  drawFrequencyBars(dataArray, bufferLength) {
    const barCount = 48;
    const barWidth = (this.width / barCount) * 0.7;
    const gap = (this.width / barCount) * 0.3;

    const grad = this.ctx.createLinearGradient(0, this.height, 0, 0);
    grad.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
    grad.addColorStop(0.5, 'rgba(139, 92, 246, 0.8)');
    grad.addColorStop(1, 'rgba(236, 72, 153, 1)');

    this.ctx.fillStyle = grad;

    for (let i = 0; i < barCount; i++) {
      const dataIndex = Math.floor((i / barCount) * (bufferLength * 0.6));
      const value = dataArray[dataIndex] || 0;
      const percent = value / 255;
      const barHeight = Math.max(4, percent * this.height * 0.85);

      const x = i * (barWidth + gap) + gap / 2;
      const y = this.height - barHeight;

      // Draw rounded bar
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
      this.ctx.fill();
    }
  }

  drawSimulatedHarmonics() {
    this.simulatedPhase += 0.05;
    const barCount = 44;
    const barWidth = (this.width / barCount) * 0.65;
    const gap = (this.width / barCount) * 0.35;

    const grad = this.ctx.createLinearGradient(0, this.height, 0, 0);
    grad.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
    grad.addColorStop(0.6, 'rgba(168, 85, 247, 0.8)');
    grad.addColorStop(1, 'rgba(236, 72, 153, 0.95)');

    this.ctx.fillStyle = grad;

    for (let i = 0; i < barCount; i++) {
      const sin1 = Math.sin(this.simulatedPhase + i * 0.2);
      const sin2 = Math.cos(this.simulatedPhase * 0.8 + i * 0.35);
      const val = (sin1 + sin2 + 2) / 4; // normalized 0 to 1
      const barHeight = Math.max(4, val * this.height * 0.75);

      const x = i * (barWidth + gap) + gap / 2;
      const y = this.height - barHeight;

      this.ctx.beginPath();
      this.ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
      this.ctx.fill();
    }
  }

  drawIdleLine() {
    // Keep background stage clean and unobstructed when audio is paused/idle
  }
}
