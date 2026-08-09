import { Camera, Move, RotateCcw, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import {
  drawSquareCrop,
  normalizeCropState,
  panCropByPreviewDelta,
  zoomAndPanCrop,
  type CropPoint,
  type CropPreviewSize,
  type CropState,
} from './memberAvatarCrop';

const OUTPUT_SIZE = 512;
const MAX_OUTPUT_BYTES = 1_000_000;
const DEFAULT_CROP: CropState = { position: { x: 50, y: 50 }, zoom: 1 };

type Gesture =
  | {
      kind: 'drag';
      pointer: CropPoint;
      preview: CropPreviewSize;
      state: CropState;
    }
  | {
      anchor: CropPoint;
      distance: number;
      kind: 'pinch';
      preview: CropPreviewSize;
      state: CropState;
    };

export function MemberAvatarDialog({
  file,
  memberName,
  saving,
  serverError,
  onCancel,
  onSave,
}: {
  file: File;
  memberName: string;
  saving: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSave: (dataBase64: string) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropRef = useRef<CropState>(DEFAULT_CROP);
  const pointersRef = useRef(new Map<number, CropPoint>());
  const gestureRef = useRef<Gesture | null>(null);
  const instructionsId = useId();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState>(DEFAULT_CROP);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    const nextImage = new Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setLocalError('Hearth could not open that photo. Try a JPEG or PNG.');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') nextImage.src = reader.result;
    };
    reader.onerror = () => setLocalError('Hearth could not read that photo. Try another file.');
    reader.readAsDataURL(file);
    return () => {
      nextImage.onload = null;
      nextImage.onerror = null;
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || image === null) return;
    drawSquareCrop(canvas, image, crop.zoom, crop.position);
  }, [crop, image]);

  function applyCrop(nextCrop: CropState): void {
    const normalized = normalizeCropState(nextCrop);
    cropRef.current = normalized;
    setCrop(normalized);
  }

  function restartGesture(element: HTMLElement): void {
    const pointers = [...pointersRef.current.values()];
    const rect = element.getBoundingClientRect();
    const preview = { height: rect.height, width: rect.width };
    const first = pointers[0];
    if (first === undefined || preview.height === 0 || preview.width === 0) {
      gestureRef.current = null;
      return;
    }
    const second = pointers[1];
    if (second === undefined) {
      gestureRef.current = {
        kind: 'drag',
        pointer: first,
        preview,
        state: cropRef.current,
      };
      return;
    }
    gestureRef.current = {
      anchor: relativePoint(midpoint(first, second), rect),
      distance: Math.max(distance(first, second), 1),
      kind: 'pinch',
      preview,
      state: cropRef.current,
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>): void {
    if (image === null || saving) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic test events are not registered as active browser pointers.
    }
    restartGesture(event.currentTarget);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>): void {
    if (!pointersRef.current.has(event.pointerId) || image === null || saving) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    const pointers = [...pointersRef.current.values()];
    if (gesture?.kind === 'drag' && pointers.length === 1) {
      const pointer = pointers[0];
      if (pointer === undefined) return;
      applyCrop(
        panCropByPreviewDelta(
          image,
          gesture.state,
          { x: pointer.x - gesture.pointer.x, y: pointer.y - gesture.pointer.y },
          gesture.preview,
        ),
      );
      return;
    }
    if (gesture?.kind === 'pinch' && pointers.length >= 2) {
      const first = pointers[0];
      const second = pointers[1];
      if (first === undefined || second === undefined) return;
      const rect = event.currentTarget.getBoundingClientRect();
      applyCrop(
        zoomAndPanCrop(
          image,
          gesture.state,
          gesture.state.zoom * (distance(first, second) / gesture.distance),
          gesture.anchor,
          relativePoint(midpoint(first, second), rect),
          gesture.preview,
        ),
      );
    }
  }

  function handlePointerEnd(event: PointerEvent<HTMLButtonElement>): void {
    pointersRef.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The browser may already have released a cancelled pointer.
    }
    restartGesture(event.currentTarget);
  }

  function handleCropKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (image === null || saving) return;
    const current = cropRef.current;
    const key = event.key;
    if (key === 'Home') {
      event.preventDefault();
      applyCrop(DEFAULT_CROP);
      return;
    }
    if (key === '+' || key === '=') {
      event.preventDefault();
      applyCrop(
        zoomAndPanCrop(
          image,
          current,
          current.zoom + 0.1,
          { x: 50, y: 50 },
          { x: 50, y: 50 },
          { height: 100, width: 100 },
        ),
      );
      return;
    }
    if (key === '-') {
      event.preventDefault();
      applyCrop(
        zoomAndPanCrop(
          image,
          current,
          current.zoom - 0.1,
          { x: 50, y: 50 },
          { x: 50, y: 50 },
          { height: 100, width: 100 },
        ),
      );
      return;
    }
    const nudge = event.shiftKey ? 10 : 4;
    const position = { ...current.position };
    if (key === 'ArrowLeft') position.x += nudge;
    else if (key === 'ArrowRight') position.x -= nudge;
    else if (key === 'ArrowUp') position.y += nudge;
    else if (key === 'ArrowDown') position.y -= nudge;
    else return;
    event.preventDefault();
    applyCrop({ ...current, position });
  }

  async function save(): Promise<void> {
    const canvas = canvasRef.current;
    if (canvas === null || image === null) return;
    setLocalError(null);
    const blob = await canvasToJpeg(canvas);
    if (blob.size > MAX_OUTPUT_BYTES) {
      setLocalError('That crop is still too large. Choose a simpler or smaller photo.');
      return;
    }
    try {
      await onSave(await blobToBase64(blob));
    } catch {
      // The parent keeps the dialog open and renders the family-safe API error.
    }
  }

  return (
    <dialog
      aria-labelledby="member-avatar-title"
      className="member-avatar-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onCancel();
      }}
      ref={dialogRef}
    >
      <div className="member-avatar-dialog__panel">
        <header>
          <span className="member-avatar-dialog__icon" aria-hidden="true">
            <Camera />
          </span>
          <div>
            <h2 id="member-avatar-title">Position {memberName}&apos;s photo</h2>
            <p>Move and zoom the photo until it looks right.</p>
          </div>
          <button
            aria-label="Cancel photo change"
            className="member-avatar-dialog__close"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            <X />
          </button>
        </header>

        <button
          aria-describedby={instructionsId}
          aria-label={`Photo crop for ${memberName}. Zoom ${Math.round(crop.zoom * 100)} percent. Horizontal position ${Math.round(crop.position.x)} percent. Vertical position ${Math.round(crop.position.y)} percent.`}
          aria-roledescription="photo crop area"
          className="member-avatar-dialog__preview"
          disabled={image === null || saving}
          onKeyDown={handleCropKeyDown}
          onPointerCancel={handlePointerEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onWheel={(event) => {
            if (image === null || saving) return;
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            const current = cropRef.current;
            applyCrop(
              zoomAndPanCrop(
                image,
                current,
                current.zoom * Math.exp(-event.deltaY * 0.002),
                point,
                point,
                { height: rect.height, width: rect.width },
              ),
            );
          }}
          type="button"
        >
          {image === null && localError === null ? <span>Preparing photo…</span> : null}
          <canvas aria-hidden="true" height={OUTPUT_SIZE} ref={canvasRef} width={OUTPUT_SIZE} />
        </button>

        <div className="member-avatar-dialog__gesture-tools">
          <p id={instructionsId}>
            <Move aria-hidden="true" /> Drag <span aria-hidden="true">·</span> Pinch to zoom
            <span className="sr-only">
              Scroll also zooms. Arrow keys move the photo, plus and minus change zoom, and Home
              resets it.
            </span>
          </p>
          <button
            className="admin-secondary member-avatar-dialog__reset"
            disabled={image === null || saving}
            onClick={() => applyCrop(DEFAULT_CROP)}
            type="button"
          >
            <RotateCcw aria-hidden="true" /> Reset
          </button>
        </div>

        {localError !== null || serverError !== null ? (
          <p className="member-avatar-dialog__error" role="alert">
            {localError ?? serverError}
          </p>
        ) : null}
        <p className="member-avatar-dialog__privacy">
          The cropped copy stays in Hearth on your home server. The original file is not uploaded.
        </p>
        <div className="member-avatar-dialog__actions">
          <button className="admin-secondary" disabled={saving} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="admin-submit"
            disabled={image === null || saving}
            onClick={() => void save()}
            type="button"
          >
            {saving ? 'Saving photo…' : 'Use this photo'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function distance(first: CropPoint, second: CropPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first: CropPoint, second: CropPoint): CropPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function relativePoint(point: CropPoint, rect: DOMRect): CropPoint {
  return { x: point.x - rect.left, y: point.y - rect.top };
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) reject(new Error('Hearth could not prepare that photo.'));
        else resolve(blob);
      },
      'image/jpeg',
      0.88,
    );
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return btoa(chunks.join(''));
}
