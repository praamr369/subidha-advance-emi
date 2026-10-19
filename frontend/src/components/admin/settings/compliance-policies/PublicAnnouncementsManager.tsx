"use client";

import { useEffect, useState, useTransition, type ChangeEvent } from "react";
import {
  AlertCircle,
  Bell,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Flame,
  ImageIcon,
  Megaphone,
  Pencil,
  Plus,
  Radio,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import {
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  getAdminAnnouncements,
  updateAdminAnnouncement,
  uploadAdminAnnouncementImage,
  type PublicAnnouncement,
  type PublicAnnouncementType,
} from "@/services/public-site";

const TYPE_CONFIG: Record<
  PublicAnnouncementType,
  { label: string; bg: string; text: string; border: string; icon: typeof Megaphone }
> = {
  OFFER: {
    label: "Offer / Deal",
    bg: "bg-amber-500/10 dark:bg-amber-500/20",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-500/30",
    icon: Flame,
  },
  NEWS: {
    label: "News / Update",
    bg: "bg-blue-500/10 dark:bg-blue-500/20",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-500/30",
    icon: Megaphone,
  },
  ALERT: {
    label: "Important Notice",
    bg: "bg-rose-500/10 dark:bg-rose-500/20",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-500/30",
    icon: AlertCircle,
  },
  GENERAL: {
    label: "General Bulletin",
    bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-500/30",
    icon: Bell,
  },
};

type FormState = {
  id?: number;
  title: string;
  message: string;
  banner_type: PublicAnnouncementType;
  badge_text: string;
  action_label: string;
  action_url: string;
  priority: number;
  is_active: boolean;
  image_url: string;
  image_aspect_ratio: "BANNER" | "POSTER" | "HERO";
  display_placement: "TOP_BANNER" | "PROMO_CARD" | "POPUP_MODAL";
  start_date: string;
  end_date: string;
};

const INITIAL_FORM: FormState = {
  title: "",
  message: "",
  banner_type: "OFFER",
  badge_text: "SPECIAL OFFER",
  action_label: "View Offer",
  action_url: "/products",
  priority: 0,
  is_active: true,
  image_url: "",
  image_aspect_ratio: "BANNER",
  display_placement: "TOP_BANNER",
  start_date: "",
  end_date: "",
};

export function PublicAnnouncementsManager() {
  const [announcements, setAnnouncements] = useState<PublicAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState<FormState>(INITIAL_FORM);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await getAdminAnnouncements();
      setAnnouncements(data);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openCreateModal = () => {
    setFormData(INITIAL_FORM);
    setErrorMessage(null);
    setFormOpen(true);
  };

  const openEditModal = (item: PublicAnnouncement) => {
    setFormData({
      id: item.id,
      title: item.title,
      message: item.message || "",
      banner_type: item.banner_type,
      badge_text: item.badge_text || "",
      action_label: item.action_label || "",
      action_url: item.action_url || "",
      priority: item.priority ?? 0,
      is_active: item.is_active ?? true,
      image_url: item.image_url || "",
      image_aspect_ratio: item.image_aspect_ratio || "BANNER",
      display_placement: item.display_placement || "TOP_BANNER",
      start_date: item.start_date ? item.start_date.slice(0, 16) : "",
      end_date: item.end_date ? item.end_date.slice(0, 16) : "",
    });
    setErrorMessage(null);
    setFormOpen(true);
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      setErrorMessage(null);
      const url = await uploadAdminAnnouncementImage(file);
      setFormData((prev) => ({ ...prev, image_url: url }));
      setSuccessMessage("Banner photo uploaded successfully!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to upload photo banner");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleToggleActive = (item: PublicAnnouncement) => {
    startTransition(async () => {
      try {
        const nextState = !item.is_active;
        await updateAdminAnnouncement(item.id, { is_active: nextState });
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, is_active: nextState } : a))
        );
        setSuccessMessage(`Announcement "${item.title}" ${nextState ? "activated" : "deactivated"}.`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to update status");
      }
    });
  };

  const handleDelete = (item: PublicAnnouncement) => {
    if (!window.confirm(`Are you sure you want to delete "${item.title}"?`)) return;

    startTransition(async () => {
      try {
        await deleteAdminAnnouncement(item.id);
        setAnnouncements((prev) => prev.filter((a) => a.id !== item.id));
        setSuccessMessage(`Announcement "${item.title}" removed.`);
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setErrorMessage("Please enter an announcement title.");
      return;
    }

    startTransition(async () => {
      try {
        setErrorMessage(null);
        const payload: Partial<PublicAnnouncement> = {
          title: formData.title.trim(),
          message: formData.message.trim(),
          banner_type: formData.banner_type,
          badge_text: formData.badge_text.trim(),
          action_label: formData.action_label.trim(),
          action_url: formData.action_url.trim(),
          priority: Number(formData.priority) || 0,
          is_active: formData.is_active,
          image_url: formData.image_url.trim(),
          image_aspect_ratio: formData.image_aspect_ratio,
          display_placement: formData.display_placement,
          start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null,
          end_date: formData.end_date ? new Date(formData.end_date).toISOString() : null,
        };

        if (formData.id) {
          const updated = await updateAdminAnnouncement(formData.id, payload);
          setAnnouncements((prev) => prev.map((a) => (a.id === formData.id ? updated : a)));
          setSuccessMessage("Announcement & photo banner updated successfully.");
        } else {
          const created = await createAdminAnnouncement(payload);
          setAnnouncements((prev) => [created, ...prev]);
          setSuccessMessage("New announcement & photo banner published successfully.");
        }

        setFormOpen(false);
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to save announcement");
      }
    });
  };

  const ActiveIcon = TYPE_CONFIG[formData.banner_type]?.icon || Megaphone;

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Radio className="h-5 w-5 text-amber-500 animate-pulse" />
            Public Home Page Banners, Ads & Offers (CMS)
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full control to add, edit, and delete photo banners, promotional ad cards, festival deals, and news notifications on the storefront.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Create Banner / Ad
        </button>
      </div>

      {/* Notifications / Alerts */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-medium text-rose-700 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Announcements Table */}
      {loading ? (
        <div className="flex h-44 items-center justify-center text-xs text-muted-foreground">
          Loading active banners and advertisements...
        </div>
      ) : announcements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/60 mb-2" />
          <h3 className="text-sm font-semibold text-foreground">No banners or advertisements created yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Create your first promotional photo banner, festival ad, or announcement to display on the storefront home page.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
            Add First Photo Banner
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-3 font-semibold">Visual Preview</th>
                <th className="px-4 py-3 font-semibold">Type & Placement</th>
                <th className="px-4 py-3 font-semibold">Headline & Content</th>
                <th className="px-4 py-3 font-semibold">Badge & Link</th>
                <th className="px-4 py-3 font-semibold">Priority & Schedule</th>
                <th className="px-4 py-3 font-semibold text-center">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {announcements.map((item) => {
                const conf = TYPE_CONFIG[item.banner_type] || TYPE_CONFIG.GENERAL;
                const Icon = conf.icon;
                return (
                  <tr key={item.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-3 py-3 align-top whitespace-nowrap">
                      {item.image_url ? (
                        <div className="relative h-12 w-20 overflow-hidden rounded-lg border border-border bg-muted shadow-xs">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.image_url}
                            alt={item.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-12 w-20 items-center justify-center rounded-lg border border-dashed border-border/80 bg-muted/40 text-muted-foreground/60 text-[10px]">
                          Text Banner
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap space-y-1">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${conf.bg} ${conf.text} ${conf.border}`}
                      >
                        <Icon className="h-3 w-3" />
                        {conf.label}
                      </span>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {item.display_placement === "TOP_BANNER" && "📌 Top Banner"}
                        {item.display_placement === "PROMO_CARD" && "🗂️ Promo Card"}
                        {item.display_placement === "POPUP_MODAL" && "✨ Popup Modal"}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top max-w-xs">
                      <div className="font-semibold text-foreground text-sm">{item.title}</div>
                      {item.message && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {item.message}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="space-y-1">
                        {item.badge_text && (
                          <span className="inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
                            {item.badge_text}
                          </span>
                        )}
                        {item.action_url && (
                          <div className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                            <ExternalLink className="h-2.5 w-2.5" />
                            {item.action_label || "Link"} ({item.action_url})
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground text-[11px] whitespace-nowrap">
                      <div>Priority: <strong className="text-foreground">{item.priority ?? 0}</strong></div>
                      {(item.start_date || item.end_date) && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/80 mt-1">
                          <Calendar className="h-3 w-3" />
                          {item.start_date ? new Date(item.start_date).toLocaleDateString() : "Now"} –{" "}
                          {item.end_date ? new Date(item.end_date).toLocaleDateString() : "Always"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(item)}
                        disabled={isPending}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                          item.is_active
                            ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            item.is_active ? "bg-emerald-500" : "bg-muted-foreground"
                          }`}
                        />
                        {item.is_active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          title="Edit Banner & Ad"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          disabled={isPending}
                          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-600"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Drawer Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                {formData.id ? "Edit Photo Banner & Ad" : "New Photo Banner & Announcement"}
              </h3>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
              {/* Type and Placement */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Banner Category
                  </label>
                  <select
                    value={formData.banner_type}
                    onChange={(e) =>
                      setFormData({ ...formData, banner_type: e.target.value as PublicAnnouncementType })
                    }
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-ring"
                  >
                    <option value="OFFER">Offer / Promotional Deal</option>
                    <option value="NEWS">News / Announcement</option>
                    <option value="ALERT">Important Notice / Alert</option>
                    <option value="GENERAL">General Bulletin</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Placement Style
                  </label>
                  <select
                    value={formData.display_placement}
                    onChange={(e) =>
                      setFormData({ ...formData, display_placement: e.target.value as FormState["display_placement"] })
                    }
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-ring"
                  >
                    <option value="TOP_BANNER">Top Home Banner</option>
                    <option value="PROMO_CARD">Promotional Card in Showcase</option>
                    <option value="POPUP_MODAL">Welcome Offer Popup</option>
                  </select>
                </div>
              </div>

              {/* Photo Banner Upload Section */}
              <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-foreground uppercase text-[10px] tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-primary" />
                    Promotional Photo / Poster Image
                  </label>
                  {formData.image_url && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, image_url: "" })}
                      className="text-[10px] text-rose-500 hover:underline flex items-center gap-1"
                    >
                      <Trash2 className="h-3 w-3" /> Remove Photo
                    </button>
                  )}
                </div>

                {formData.image_url ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={formData.image_url}
                      alt="Banner Preview"
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <label className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-3 cursor-pointer hover:border-primary/50 transition w-full">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-semibold text-foreground">
                        {uploadingImage ? "Uploading Photo..." : "Upload Banner Photo"}
                      </span>
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        className="hidden"
                        disabled={uploadingImage}
                        onChange={(e) => void handleFileUpload(e)}
                      />
                    </label>

                    <div className="text-[10px] text-muted-foreground text-center">or</div>

                    <input
                      type="url"
                      value={formData.image_url}
                      onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                      placeholder="Paste image URL (https://...)"
                      className="flex-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Photo Aspect Ratio</label>
                    <select
                      value={formData.image_aspect_ratio}
                      onChange={(e) =>
                        setFormData({ ...formData, image_aspect_ratio: e.target.value as FormState["image_aspect_ratio"] })
                      }
                      className="mt-0.5 w-full rounded-lg border border-input bg-background px-2 py-1 text-xs"
                    >
                      <option value="BANNER">Wide Banner (16:9 / 3:1)</option>
                      <option value="POSTER">Vertical Poster (4:5 / 1:1)</option>
                      <option value="HERO">Full Hero Cover</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Priority (Higher shows first)</label>
                    <input
                      type="number"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                      className="mt-0.5 w-full rounded-lg border border-input bg-background px-2 py-1 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                  Headline Title *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Mega Furniture Fest: Flat ₹2,000 Voucher on Living Room Sets"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold"
                />
              </div>

              {/* Message */}
              <div>
                <label className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                  Sub-text / Message (Optional)
                </label>
                <textarea
                  rows={2}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="e.g. Valid until Diwali night across Asansol showroom and online booking."
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs leading-relaxed"
                />
              </div>

              {/* Badge and Button Link */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Badge Text
                  </label>
                  <input
                    type="text"
                    value={formData.badge_text}
                    onChange={(e) => setFormData({ ...formData, badge_text: e.target.value })}
                    placeholder="LIMITED DEAL"
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs uppercase"
                  />
                </div>
                <div>
                  <label className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Action Label
                  </label>
                  <input
                    type="text"
                    value={formData.action_label}
                    onChange={(e) => setFormData({ ...formData, action_label: e.target.value })}
                    placeholder="Claim Offer"
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Target URL
                  </label>
                  <input
                    type="text"
                    value={formData.action_url}
                    onChange={(e) => setFormData({ ...formData, action_url: e.target.value })}
                    placeholder="/products or /lucky-plan"
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Start Showing From (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Expire / Hide After (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {/* Active Switch */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="announcement_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-input text-primary focus:ring-primary"
                />
                <label htmlFor="announcement_active" className="text-xs font-medium text-foreground cursor-pointer">
                  Publish immediately (Active on public site)
                </label>
              </div>

              {/* Live Preview Box */}
              <div className="rounded-xl border border-border/80 bg-muted/30 p-3 mt-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Live Preview on Storefront:
                </div>
                <div
                  className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border p-3 ${
                    TYPE_CONFIG[formData.banner_type]?.bg
                  } ${TYPE_CONFIG[formData.banner_type]?.border}`}
                >
                  <div className="flex items-start gap-3">
                    {formData.image_url ? (
                      <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-border/60">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={formData.image_url}
                          alt="preview"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <ActiveIcon className={`h-4 w-4 shrink-0 mt-0.5 ${TYPE_CONFIG[formData.banner_type]?.text}`} />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        {formData.badge_text && (
                          <span className="rounded bg-foreground px-1.5 py-0.5 text-[9px] font-extrabold text-background uppercase">
                            {formData.badge_text}
                          </span>
                        )}
                        <span className="font-semibold text-foreground text-xs">
                          {formData.title || "Headline Title"}
                        </span>
                      </div>
                      {formData.message && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{formData.message}</p>
                      )}
                    </div>
                  </div>
                  {formData.action_url && (
                    <span className="rounded-md bg-foreground px-2.5 py-1 text-[10px] font-bold text-background shadow-xs shrink-0">
                      {formData.action_label || "Explore"} →
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || uploadingImage}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {isPending ? "Saving..." : formData.id ? "Save Changes" : "Publish Banner & Ad"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
