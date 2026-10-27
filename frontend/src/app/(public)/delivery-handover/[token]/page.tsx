"use client";

import React, { useEffect, useState, use } from "react";
import SignatureCanvas from "@/components/forms/SignatureCanvas";
import {
  getPublicHandoverInfo,
  submitPublicHandoverPOD,
  type PublicHandoverInfo,
} from "@/services/pod";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface FurniturePhotoItem {
  id: string;
  file: File;
  preview: string;
  label: string;
}

export default function DeliveryHandoverPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const token = resolvedParams?.token || "";

  const [loading, setLoading] = useState(true);
  const [orderInfo, setOrderInfo] = useState<PublicHandoverInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form states
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [customerSigName, setCustomerSigName] = useState("");
  const [notes, setNotes] = useState("");
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLon, setGpsLon] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  // Multiple furniture photos for multi-item Rent / Lease orders
  const [furniturePhotos, setFurniturePhotos] = useState<FurniturePhotoItem[]>([]);

  // Optional Recipient Photo
  const [recipientPhoto, setRecipientPhoto] = useState<File | null>(null);
  const [recipientPreview, setRecipientPreview] = useState<string | null>(null);
  const [showRecipientPhotoInput, setShowRecipientPhotoInput] = useState(false);

  // Customer signature drawn on delivery boy's phone
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    pod_id: number;
    message: string;
    totalPhotos: number;
  } | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError("Invalid or missing delivery link.");
      setLoading(false);
      return;
    }

    getPublicHandoverInfo(token)
      .then((data) => {
        setOrderInfo(data);
        if (data.driver_name) setDriverName(data.driver_name);
        if (data.driver_phone) setDriverPhone(data.driver_phone);
        if (data.customer_name) setCustomerSigName(data.customer_name);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Failed to load delivery details.";
        setLoadError(msg);
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Request GPS automatically or on-demand
  const handleCaptureGPS = () => {
    if (!navigator.geolocation) {
      setGpsStatus("GPS is not supported by your mobile browser.");
      return;
    }

    setGpsLoading(true);
    setGpsStatus("Fetching precise GPS coordinates...");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        setGpsLat(lat);
        setGpsLon(lon);
        setGpsStatus(`📍 GPS Tagged: ${lat}, ${lon}`);
        setGpsLoading(false);
      },
      (err) => {
        setGpsStatus(`Could not acquire GPS: ${err.message}. (Optional)`);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    // Attempt automatic GPS tagging when opening handover page on driver device
    if (typeof window !== "undefined" && navigator?.geolocation) {
      handleCaptureGPS();
    }
  }, []);

  const handleAddFurniturePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const newItem: FurniturePhotoItem = {
        id: `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        file,
        preview: reader.result as string,
        label: `Furniture Item #${furniturePhotos.length + 1}`,
      };
      setFurniturePhotos((prev) => [...prev, newItem]);
    };
    reader.readAsDataURL(file);

    // Reset input value so same camera action can trigger again
    e.target.value = "";
  };

  const handleRemoveFurniturePhoto = (id: string) => {
    setFurniturePhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUpdatePhotoLabel = (id: string, newLabel: string) => {
    setFurniturePhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, label: newLabel } : p))
    );
  };

  const handleRecipientPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRecipientPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setRecipientPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (furniturePhotos.length === 0) {
      setSubmitError(
        "Please take at least one furniture photo to capture product quality and assembly before completing delivery."
      );
      return;
    }

    if (!signatureFile && !signatureDataUrl) {
      setSubmitError(
        "Customer signature is required. Please hand your phone to the customer to sign on the screen."
      );
      return;
    }

    if (!customerSigName.trim()) {
      setSubmitError("Please confirm the name of the person receiving the delivery.");
      return;
    }

    setSubmitting(true);

    try {
      // Map photos:
      // photo_1 = first furniture photo
      // photo_2 = recipient photo (if present) OR second furniture photo
      // furniture_photos = remaining furniture photos
      const photo1File = furniturePhotos[0].file;
      let photo2File: File | undefined = undefined;
      const additionalFurnitureFiles: File[] = [];

      if (recipientPhoto) {
        photo2File = recipientPhoto;
        // All furniture photos from index 1 onwards go to additional
        for (let i = 1; i < furniturePhotos.length; i++) {
          additionalFurnitureFiles.push(furniturePhotos[i].file);
        }
      } else {
        if (furniturePhotos.length > 1) {
          photo2File = furniturePhotos[1].file;
        }
        for (let i = 2; i < furniturePhotos.length; i++) {
          additionalFurnitureFiles.push(furniturePhotos[i].file);
        }
      }

      // Add item labels into notes if provided
      const photoLabelsNote = furniturePhotos
        .map((p, idx) => `Item #${idx + 1}: ${p.label}`)
        .join("; ");
      const combinedNotes = notes.trim()
        ? `${notes.trim()} | [Items Captured: ${photoLabelsNote}]`
        : `[Items Captured: ${photoLabelsNote}]`;

      const result = await submitPublicHandoverPOD(token, {
        delivery_date: new Date().toISOString(),
        driver_name: driverName.trim() || "Delivery Agent",
        driver_phone: driverPhone.trim(),
        customer_signature_name: customerSigName.trim(),
        photo_1: photo1File,
        photo_2: photo2File,
        furniture_photos: additionalFurnitureFiles,
        signature_image: signatureFile || undefined,
        signature_data: signatureDataUrl || undefined,
        gps_latitude: gpsLat || undefined,
        gps_longitude: gpsLon || undefined,
        notes: combinedNotes,
      });

      setSuccessData({
        pod_id: result.pod_id,
        message: result.message,
        totalPhotos: furniturePhotos.length + (recipientPhoto ? 1 : 0),
      });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : "Submission failed. Please try again.";
      const cleanMsg =
        typeof rawMsg === "string" && (rawMsg.includes("<html") || rawMsg.includes("<!doctype") || /<[a-z][\s\S]*>/i.test(rawMsg))
          ? "The server encountered an error while securing delivery proof. Please try again or contact support."
          : rawMsg;
      setSubmitError(cleanMsg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center max-w-sm w-full">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <h2 className="text-base font-semibold text-slate-800">Loading Delivery Details...</h2>
          <p className="text-xs text-slate-500 mt-1">Verifying handover security token</p>
        </div>
      </main>
    );
  }

  if (loadError || !orderInfo) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-rose-200 p-8 shadow-sm text-center max-w-sm w-full">
          <div className="text-4xl mb-3">⚠️</div>
          <h2 className="text-base font-semibold text-rose-700">Link Invalid or Expired</h2>
          <p className="text-xs text-slate-600 mt-2 leading-relaxed">
            {loadError || "The delivery handover link is invalid or has expired."}
          </p>
          <p className="text-[11px] text-slate-400 mt-4">
            Please ask the store manager or administrator to send an updated delivery link.
          </p>
        </div>
      </main>
    );
  }

  // Already completed screen
  if (orderInfo.is_completed || successData) {
    return (
      <main className="min-h-screen bg-slate-50 py-10 px-4">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-emerald-200 shadow-md p-6 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl">
            ✓
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Delivery Completed & Verified</h1>
            <p className="text-xs text-emerald-700 font-medium mt-1">
              Proof of Delivery (POD) recorded successfully.
            </p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 text-left border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Delivery Ref:</span>
              <span className="font-semibold text-slate-800">{orderInfo.delivery_reference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Recipient:</span>
              <span className="font-semibold text-slate-800">{orderInfo.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Product / Plan:</span>
              <span className="font-semibold text-slate-800">
                {orderInfo.product_name} ({orderInfo.plan_type})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status:</span>
              <span className="font-semibold text-emerald-600 uppercase">DELIVERED</span>
            </div>
            {successData && (
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500">Furniture Photos Saved:</span>
                <span className="font-semibold text-indigo-600">{successData.totalPhotos} Photos</span>
              </div>
            )}
            {successData?.pod_id && (
              <div className="flex justify-between">
                <span className="text-slate-500">POD Record ID:</span>
                <span className="font-semibold text-indigo-600">#{successData.pod_id}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            All furniture condition photos and the customer's on-screen digital signature are permanently preserved in the SUBIDHA CORE audit vault for future return and warranty inspections.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-6 px-3 sm:px-6">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Header Banner */}
        <header className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                Subidha Furniture • Field Handover
              </span>
              <h1 className="text-lg font-bold mt-0.5">Proof of Delivery (POD)</h1>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              {orderInfo.plan_type || "RENT / LEASE"}
            </span>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 text-[10px] uppercase">Customer</span>
              <p className="font-medium text-slate-200 truncate">{orderInfo.customer_name}</p>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] uppercase">Phone</span>
              <p className="font-medium text-slate-200">{orderInfo.customer_phone || "—"}</p>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400 text-[10px] uppercase">Delivery Address</span>
              <p className="text-slate-300 text-xs mt-0.5 leading-snug">
                {orderInfo.delivery_address || "Customer Address On File"}
              </p>
            </div>
          </div>
        </header>

        {/* Digital Verification Banner */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-900 flex items-start gap-2.5">
          <span className="text-base shrink-0">🛡️</span>
          <div>
            <strong className="font-semibold">Recipient Identity Verified Digitally</strong>
            <p className="text-[11px] text-emerald-800 mt-0.5">
              Customer identity and booking approval have already been verified from the store admin side.
            </p>
          </div>
        </div>

        {/* Error Notification */}
        {submitError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 font-medium flex items-start gap-2">
            <span className="text-base">⚠️</span>
            <div className="flex-1">{submitError}</div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-6">
          {/* Step 1: Multi-Furniture Photos */}
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                    1
                  </span>
                  Capture Delivered Furniture Photos <span className="text-rose-500">*</span>
                </h2>
                <p className="text-[11px] text-slate-500 ml-7">
                  Take photos of every furniture piece delivered (e.g. Sofa, Bed, Table, Wardrobe). You can take multiple photos to document condition for future return inspection.
                </p>
              </div>
              {furniturePhotos.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {furniturePhotos.length} {furniturePhotos.length === 1 ? "Photo" : "Photos"}
                </span>
              )}
            </div>

            {/* List of captured furniture photos */}
            {furniturePhotos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {furniturePhotos.map((item, idx) => (
                  <div
                    key={item.id}
                    className="relative rounded-xl border border-slate-200 bg-slate-50 overflow-hidden flex flex-col group shadow-sm"
                  >
                    <div className="relative aspect-video w-full bg-slate-200">
                      <img
                        src={item.preview}
                        alt={item.label}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveFurniturePhoto(item.id)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white flex items-center justify-center text-xs transition-colors"
                        title="Remove photo"
                      >
                        ✕
                      </button>
                      <span className="absolute bottom-1 left-1 bg-slate-900/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                        #{idx + 1}
                      </span>
                    </div>

                    <div className="p-2">
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => handleUpdatePhotoLabel(item.id, e.target.value)}
                        placeholder="Item name (e.g. Sofa)"
                        className="w-full text-[11px] bg-white border border-slate-200 rounded px-1.5 py-1 text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Furniture Photo Action Button */}
            <div className="pt-1">
              <label className="flex items-center justify-center gap-2 w-full h-14 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 hover:bg-indigo-50 text-indigo-700 font-semibold text-xs cursor-pointer transition-colors">
                <span className="text-xl">📷</span>
                <span>
                  {furniturePhotos.length === 0
                    ? "Take First Furniture Photo (Camera)"
                    : "+ Take Another Furniture Photo"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleAddFurniturePhoto}
                />
              </label>
            </div>

            {/* Optional: Add photo of recipient with furniture */}
            <div className="pt-2">
              {!showRecipientPhotoInput && !recipientPhoto && (
                <button
                  type="button"
                  onClick={() => setShowRecipientPhotoInput(true)}
                  className="text-xs text-slate-600 hover:text-indigo-600 underline font-medium flex items-center gap-1"
                >
                  <span>👤</span>
                  <span>Optional: Add photo of customer with furniture</span>
                </button>
              )}

              {(showRecipientPhotoInput || recipientPhoto) && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Customer with Furniture (Optional)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRecipientPhoto(null);
                        setRecipientPreview(null);
                        setShowRecipientPhotoInput(false);
                      }}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>

                  <label className="relative flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 cursor-pointer overflow-hidden transition-colors">
                    {recipientPreview ? (
                      <img
                        src={recipientPreview}
                        alt="Customer with furniture"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-2">
                        <span className="text-xl">👤</span>
                        <p className="text-xs font-medium text-slate-700 mt-0.5">
                          Take Photo of Customer with Furniture
                        </p>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleRecipientPhotoChange}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Step 2: Customer Signature ON Delivery Boy's Phone */}
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                  2
                </span>
                Customer Touchscreen Signature <span className="text-rose-500">*</span>
              </h2>
              <div className="mt-1 ml-7 rounded-lg bg-indigo-50 p-2.5 border border-indigo-200 text-xs text-indigo-900 font-medium">
                📱 <strong>Delivery Instructions:</strong> Hand this phone to{" "}
                <span className="underline">{customerSigName || "the customer"}</span> to sign
                directly on the screen below with their finger.
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Recipient Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={customerSigName}
                  onChange={(e) => setCustomerSigName(e.target.value)}
                  placeholder="Recipient full name"
                  required
                  className="w-full h-10 rounded-xl border border-slate-300 px-3 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* On-screen signature canvas designed for smartphone screens */}
              <SignatureCanvas
                required
                height={180}
                label="Sign Below on Screen (Using Finger)"
                onChange={(file, dataUrl) => {
                  setSignatureFile(file);
                  setSignatureDataUrl(dataUrl);
                }}
              />
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Step 3: Delivery Details & GPS */}
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                  3
                </span>
                Delivery Details & GPS Tag
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Delivery Agent / Driver Name
                </label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="Delivery staff name"
                  className="w-full h-9 rounded-xl border border-slate-300 px-3 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">Driver Phone</label>
                <input
                  type="tel"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder="Staff phone number"
                  className="w-full h-9 rounded-xl border border-slate-300 px-3 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* GPS capture */}
            <div className="pt-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCaptureGPS}
                  disabled={gpsLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
                >
                  <span>📍</span>
                  {gpsLoading
                    ? "Acquiring GPS..."
                    : gpsLat
                    ? "Update GPS Coordinates"
                    : "Auto-Capture Delivery GPS"}
                </button>
                {gpsStatus && (
                  <span className="text-[11px] text-slate-600 font-medium">{gpsStatus}</span>
                )}
              </div>
            </div>

            {/* Handover condition notes */}
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Condition Remarks / Delivery Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observations on assembly, room placement, or pre-existing natural wood grain notes..."
                className="w-full rounded-xl border border-slate-300 p-2.5 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Submission button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving {furniturePhotos.length} Photos & Signature...
                </>
              ) : (
                `✓ Complete Delivery & Submit Proof (${furniturePhotos.length} Furniture Photos)`
              )}
            </button>
            <p className="text-[11px] text-slate-400 text-center mt-2">
              Submitting permanently archives photos for return inspection and marks this order DELIVERED under Rule CTRL-RENT-2.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
