"use client";

import { useState } from "react";
import { capturePOD } from "@/services/pod";

export default function PODCapturePage() {
  const [deliveryId, setDeliveryId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split("T")[0]);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [custSigName, setCustSigName] = useState("");
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLon, setGpsLon] = useState("");
  const [notes, setNotes] = useState("");

  const [photo1, setPhoto1] = useState<File | null>(null);
  const [photo2, setPhoto2] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);

  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [previewSig, setPreviewSig] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ pod_id: number; message: string } | null>(null);

  const handleFileChange = (
    file: File | null,
    setter: (f: File | null) => void,
    previewSetter: (url: string | null) => void
  ) => {
    setter(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        previewSetter(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      previewSetter(null);
    }
  };

  const handleSubmit = async () => {
    if (!deliveryId || !driverName || !custSigName || !photo1 || !signature) {
      setError("Delivery ID, driver name, customer signature name, photo 1, and signature are required.");
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await capturePOD(Number(deliveryId), {
        delivery_date: new Date(deliveryDate).toISOString(),
        driver_name: driverName,
        driver_phone: driverPhone,
        customer_signature_name: custSigName,
        photo_1: photo1,
        photo_2: photo2 || undefined,
        signature_image: signature,
        gps_latitude: gpsLat || undefined,
        gps_longitude: gpsLon || undefined,
        notes,
      });

      setSuccess({ pod_id: result.pod_id, message: result.message });

      // Reset form
      setDeliveryId("");
      setDriverName("");
      setDriverPhone("");
      setCustSigName("");
      setPhoto1(null);
      setPhoto2(null);
      setSignature(null);
      setPreview1(null);
      setPreview2(null);
      setPreviewSig(null);
      setNotes("");
    } catch {
      setError("Failed to capture POD. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Capture Proof of Delivery</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Record delivery proof: photos, signature, driver details, and GPS location for audit trail.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        {/* Delivery Info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Delivery ID *</label>
            <input
              type="number"
              value={deliveryId}
              onChange={(e) => setDeliveryId(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Delivery Date *</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Driver Name *</label>
            <input
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Driver Phone</label>
            <input
              value={driverPhone}
              onChange={(e) => setDriverPhone(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Customer Signature Name *</label>
            <input
              value={custSigName}
              onChange={(e) => setCustSigName(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1"
            />
          </div>
        </div>

        {/* GPS Location */}
        <div className="border-t border-border pt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">GPS Latitude</label>
            <input
              type="number"
              step="0.0001"
              placeholder="28.6139"
              value={gpsLat}
              onChange={(e) => setGpsLat(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">GPS Longitude</label>
            <input
              type="number"
              step="0.0001"
              placeholder="77.2090"
              value={gpsLon}
              onChange={(e) => setGpsLon(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm mt-1"
            />
          </div>
        </div>

        {/* Photos */}
        <div className="border-t border-border pt-4 space-y-3">
          <div className="text-xs font-semibold">Photos & Signature *</div>

          <div>
            <label className="text-xs text-muted-foreground">Photo 1: Item/Box *</label>
            <div className="flex gap-2 mt-1">
              <label className="flex-1 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/20 bg-muted/10">
                {preview1 ? (
                  <img src={preview1} alt="preview" className="w-full h-full object-cover rounded" />
                ) : (
                  <span className="text-xs text-muted-foreground">📷 Click to upload</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null, setPhoto1, setPreview1)}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Photo 2: Customer with Item (Optional)</label>
            <div className="flex gap-2 mt-1">
              <label className="flex-1 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/20 bg-muted/10">
                {preview2 ? (
                  <img src={preview2} alt="preview" className="w-full h-full object-cover rounded" />
                ) : (
                  <span className="text-xs text-muted-foreground">📷 Click to upload</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null, setPhoto2, setPreview2)}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Signature *</label>
            <div className="flex gap-2 mt-1">
              <label className="flex-1 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/20 bg-muted/10">
                {previewSig ? (
                  <img src={previewSig} alt="preview" className="w-full h-full object-cover rounded" />
                ) : (
                  <span className="text-xs text-muted-foreground">✍️ Click to upload</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null, setSignature, setPreviewSig)}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="border-t border-border pt-4">
          <label className="text-xs font-semibold text-muted-foreground">Delivery Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Delivered to customer, received safely…"
            rows={3}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm mt-1 resize-none"
          />
        </div>

        {/* Messages */}
        {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        {success && (
          <div className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
            ✓ POD #{success.pod_id} captured. {success.message}
          </div>
        )}

        {/* Submit */}
        <div className="border-t border-border pt-4">
          <button
            onClick={() => void handleSubmit()}
            disabled={busy}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Capturing…" : "Capture Proof of Delivery"}
          </button>
        </div>
      </div>
    </div>
  );
}
