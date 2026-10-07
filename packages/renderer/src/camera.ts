import type { Container } from 'pixi.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Caméra 2D minimale (pan / zoom / cadrage) appliquée à un conteneur monde. */
export class Camera {
  private minZoom = 0.2;
  private maxZoom = 4;

  constructor(
    private readonly world: Container,
    private viewport: { width: number; height: number },
  ) {}

  get zoom(): number {
    return this.world.scale.x;
  }

  resize(width: number, height: number): void {
    this.viewport = { width, height };
  }

  pan(dx: number, dy: number): void {
    this.world.position.set(this.world.x + dx, this.world.y + dy);
  }

  /** Zoom autour d'un point écran (ex. le curseur). */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    const next = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const k = next / this.zoom;
    this.world.position.set(screenX - (screenX - this.world.x) * k, screenY - (screenY - this.world.y) * k);
    this.world.scale.set(next);
  }

  fit(rect: Rect, margin = 24): void {
    const s = Math.min(
      (this.viewport.width - margin * 2) / rect.width,
      (this.viewport.height - margin * 2) / rect.height,
    );
    const zoom = Math.min(this.maxZoom, Math.max(this.minZoom, s));
    this.world.scale.set(zoom);
    this.world.position.set(
      (this.viewport.width - rect.width * zoom) / 2 - rect.x * zoom,
      (this.viewport.height - rect.height * zoom) / 2 - rect.y * zoom,
    );
  }
}
