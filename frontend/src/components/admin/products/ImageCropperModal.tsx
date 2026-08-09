import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface Area {
  width: number;
  height: number;
  x: number;
  y: number;
}

interface Props {
  imageSrc: string;
  onCropComplete: (croppedImageBlob: Blob) => void;
  onCancel: () => void;
}

export default function ImageCropperModal({ imageSrc, onCropComplete, onCancel }: Props) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropCompleteHandler = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area
  ): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No 2d context');
    }

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob((file) => {
        if (file) {
          resolve(file);
        } else {
          reject(new Error('Canvas is empty'));
        }
      }, 'image/jpeg', 0.9);
    });
  };

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(croppedBlob);
    } catch (e) {
      console.error(e);
      onCancel();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative flex h-[80vh] w-[90vw] max-w-2xl flex-col rounded-2xl bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">Crop Image</h2>
          <button type="button" onClick={onCancel} className="rounded-full p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="relative flex-1 bg-black overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={4 / 3}
            onCropChange={setCrop}
            onCropComplete={onCropCompleteHandler}
            onZoomChange={setZoom}
          />
        </div>

        <div className="flex items-center justify-between border-t p-4">
          <div className="flex w-full max-w-xs items-center gap-3">
            <span className="text-sm">Zoom</span>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Save Crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
