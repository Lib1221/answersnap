// Hand-written CSS for the overlay's closed shadow root (Tailwind stays on extension pages).
export const OVERLAY_CSS = `
:host { all: initial; }
.layer {
  position: fixed;
  inset: 0;
  cursor: crosshair;
  background: rgba(20, 24, 33, 0.45);
  font: 500 12px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
.layer.has-box { background: transparent; }
.box {
  position: fixed;
  display: none;
  box-shadow: 0 0 0 100vmax rgba(20, 24, 33, 0.45);
  outline: 1px solid rgba(255, 255, 255, 0.7);
  pointer-events: none;
}
.layer.has-box .box { display: block; }
.box.preview { outline: 1px dashed rgba(255, 255, 255, 0.9); }
.mark {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 0 solid #2447B8;
}
.mark.tl { left: -4px; top: -4px; border-top-width: 2px; border-left-width: 2px; }
.mark.tr { right: -4px; top: -4px; border-top-width: 2px; border-right-width: 2px; }
.mark.bl { left: -4px; bottom: -4px; border-bottom-width: 2px; border-left-width: 2px; }
.mark.br { right: -4px; bottom: -4px; border-bottom-width: 2px; border-right-width: 2px; }
.size {
  position: absolute;
  left: 0;
  top: calc(100% + 8px);
  padding: 2px 6px;
  border-radius: 4px;
  background: #23262B;
  color: #FFFFFF;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.hint {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100vw - 32px);
  padding: 8px 14px;
  border-radius: 999px;
  background: #FFFFFF;
  color: #23262B;
  font-size: 13px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}
`;
