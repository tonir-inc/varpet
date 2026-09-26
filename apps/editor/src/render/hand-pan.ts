interface HandPanOptions {
  enabled(): boolean;
  start(): void;
  move(dx: number, dy: number): void;
  stop(): void;
}

const interactive = 'input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="button"], [role="textbox"], [role="slider"], [role="combobox"]';

/** A temporary hand tool. Capture before picking, painting, and transform handles. */
export class HandPanControls {
  private held = false;
  private pointer: { id: number; x: number; y: number } | null = null;
  private previousCursor = '';

  constructor(private element: HTMLElement | SVGElement, private options: HandPanOptions) {
    window.addEventListener('keydown', this.keyDown, true);
    window.addEventListener('keyup', this.keyUp, true);
    window.addEventListener('pointerdown', this.pointerDown, true);
    window.addEventListener('pointermove', this.pointerMove, true);
    window.addEventListener('pointerup', this.pointerUp, true);
    window.addEventListener('pointercancel', this.pointerCancel, true);
    window.addEventListener('blur', this.cancel);
    document.addEventListener('focusin', this.focusChanged);
    document.addEventListener('visibilitychange', this.cancel);
    element.addEventListener('lostpointercapture', this.pointerCancel);
  }

  get active(): boolean { return this.pointer !== null; }

  private blocked(): boolean {
    const focus = document.activeElement;
    return !this.options.enabled() || document.hidden || !this.element.getClientRects().length
      || !!document.querySelector('dialog[open]') || !!focus?.closest(interactive)
      || (focus !== document.body && focus !== null && !this.element.contains(focus));
  }

  private cursor(): void {
    if (!this.held) return;
    const cursor = this.active ? 'grabbing' : 'grab';
    this.element.style.cursor = cursor;
    this.element.dataset.handPan = cursor;
  }

  private keyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
      this.cancel(); return;
    }
    if (event.code !== 'Space' && event.key !== ' ') return;
    if (this.blocked()) { this.cancel(); return; }
    if (event.repeat && !this.held) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!this.held) this.previousCursor = this.element.style.cursor;
    this.held = true; this.cursor();
  };

  private keyUp = (event: KeyboardEvent): void => {
    if ((event.code === 'Space' || event.key === ' ') && this.held) {
      event.preventDefault(); event.stopImmediatePropagation(); this.cancel();
    }
  };

  private pointerDown = (event: PointerEvent): void => {
    if (!this.held || !event.composedPath().includes(this.element)) return;
    if (this.blocked()) { this.cancel(); return; }
    if (event.button !== 0 || event.pointerType === 'touch' || this.active) return;
    event.preventDefault(); event.stopImmediatePropagation();
    this.element.focus({ preventScroll: true });
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.element.setPointerCapture(event.pointerId);
    this.cursor(); this.options.start();
  };

  private pointerMove = (event: PointerEvent): void => {
    if (!this.held) return;
    if (this.blocked()) { this.cancel(); return; }
    if (this.pointer?.id === event.pointerId) {
      event.preventDefault(); event.stopImmediatePropagation();
      const { x, y } = this.pointer;
      this.pointer.x = event.clientX; this.pointer.y = event.clientY;
      this.options.move(event.clientX - x, event.clientY - y);
    } else if (!event.buttons && event.composedPath().includes(this.element)) {
      // Keep hover effects and selected-object cursors from taking over the hand.
      event.stopImmediatePropagation();
    }
    this.cursor();
  };

  private pointerUp = (event: PointerEvent): void => {
    if (this.pointer?.id !== event.pointerId || event.button !== 0) return;
    this.pointerMove(event);
    event.preventDefault(); event.stopImmediatePropagation();
    this.finish(); this.cursor();
  };

  private pointerCancel = (event: Event): void => {
    if (event instanceof PointerEvent && this.pointer?.id === event.pointerId) this.cancel();
  };

  private focusChanged = (): void => { if (this.held && this.blocked()) this.cancel(); };

  private finish(): void {
    const pointer = this.pointer; this.pointer = null;
    if (!pointer) return;
    if (this.element.hasPointerCapture(pointer.id)) this.element.releasePointerCapture(pointer.id);
    this.options.stop();
  }

  cancel = (): void => {
    if (!this.held && !this.active) return;
    this.held = false; this.finish();
    this.element.style.cursor = this.previousCursor;
    delete this.element.dataset.handPan;
  };

  dispose(): void {
    this.cancel();
    window.removeEventListener('keydown', this.keyDown, true);
    window.removeEventListener('keyup', this.keyUp, true);
    window.removeEventListener('pointerdown', this.pointerDown, true);
    window.removeEventListener('pointermove', this.pointerMove, true);
    window.removeEventListener('pointerup', this.pointerUp, true);
    window.removeEventListener('pointercancel', this.pointerCancel, true);
    window.removeEventListener('blur', this.cancel);
    document.removeEventListener('focusin', this.focusChanged);
    document.removeEventListener('visibilitychange', this.cancel);
    this.element.removeEventListener('lostpointercapture', this.pointerCancel);
  }
}
