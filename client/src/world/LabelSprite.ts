import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';

export interface LabelLine {
  readonly text: string;
  readonly color: string;
  /** Relative size of the line. */
  readonly size?: number;
  /** An emoji or glyph drawn before the text, e.g. a trophy. */
  readonly icon?: HTMLImageElement | null;
}

const FONT = '"Fredoka", "Baloo 2", "Nunito", "Segoe UI", system-ui, sans-serif';

/**
 * A BILLBOARD LABEL: chunky outlined text that always faces the camera - the
 * "+5 / CLICK", the trophy price, the zone names. Redrawn only when its text
 * changes, so a label whose state never changes costs one upload, ever.
 */
export class LabelSprite {
  readonly sprite: Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: CanvasTexture;
  private signature = '';

  /**
   * @param width  world width of the label
   * @param height world height of the label
   */
  constructor(
    width: number,
    height: number,
    private readonly pixels = 256,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pixels;
    this.canvas.height = Math.max(16, Math.round((pixels * height) / width));
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = LinearFilter;
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, fog: false }));
    this.sprite.scale.set(width, height, 1);
  }

  set(lines: readonly LabelLine[]): void {
    const signature = lines.map((line) => `${line.text}|${line.color}|${line.size ?? 1}|${line.icon ? 1 : 0}`).join('\n');
    if (signature === this.signature) return;
    this.signature = signature;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);
    const total = lines.reduce((sum, line) => sum + (line.size ?? 1), 0) || 1;
    let cursor = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const line of lines) {
      const band = ((line.size ?? 1) / total) * height;
      const centre = cursor + band / 2;
      cursor += band;
      let size = band * 0.8;
      const iconSize = line.icon ? size * 1.05 : 0;
      for (let pass = 0; pass < 4; pass += 1) {
        ctx.font = `700 ${size}px ${FONT}`;
        const drawn = ctx.measureText(line.text).width + size * 0.22 + (line.icon ? size * 1.2 : 0);
        if (drawn <= width * 0.96) break;
        size *= (width * 0.96) / drawn;
      }
      ctx.font = `700 ${size}px ${FONT}`;
      const textWidth = ctx.measureText(line.text).width;
      const iconW = line.icon ? size * 1.15 : 0;
      const startX = width / 2 - (textWidth + iconW) / 2;
      if (line.icon) ctx.drawImage(line.icon, startX, centre - (iconSize || size) / 2, size, size);
      const textX = startX + iconW + textWidth / 2;
      ctx.lineWidth = size * 0.22;
      ctx.strokeStyle = '#141822';
      ctx.strokeText(line.text, textX, centre);
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, textX, centre);
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    (this.sprite.material as SpriteMaterial).dispose();
    this.sprite.removeFromParent();
  }
}
