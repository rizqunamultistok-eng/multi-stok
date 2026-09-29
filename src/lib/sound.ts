/**
 * Web Audio API based Sound Synthesizer for POS Barcode Scanner and Notifications.
 * Generates instant crisp tones without external audio file dependencies.
 */

class SoundEffects {
  private ctx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Standard POS Barcode Beep (High pitched short sine wave)
   */
  public playScannerBeep(): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, ctx.currentTime); // A6 note
      osc.frequency.exponentialRampToValueAtTime(2093, ctx.currentTime + 0.08); // C7 note

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // Ignore audio failure
    }
  }

  /**
   * Success Chime (2-Tone Major chord sequence)
   */
  public playSuccessChime(): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const tones = [880, 1174.66, 1760]; // A5, D6, A6
      tones.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const startTime = ctx.currentTime + idx * 0.07;
        const duration = 0.18;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.25, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
      });
    } catch {
      // Ignore audio failure
    }
  }

  /**
   * Error Sound (Low pitched double harsh buzz)
   */
  public playErrorBeep(): void {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      [0, 0.14].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const startTime = ctx.currentTime + offset;
        const duration = 0.1;

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, startTime); // A3 low pitch
        osc.frequency.linearRampToValueAtTime(160, startTime + duration);

        gain.gain.setValueAtTime(0.35, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
      });
    } catch {
      // Ignore audio failure
    }
  }
}

export const sound = new SoundEffects();
