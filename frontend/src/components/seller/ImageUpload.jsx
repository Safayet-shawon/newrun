import React, { useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import { api, resolveImage } from "@/lib/api";
import { toast } from "sonner";

export default function ImageUpload({ value, onChange, label = "Image", multiple = false, values = [], onChangeMulti, testid = "upload" }) {
  const [uploading, setUploading] = useState(false);

  const handle = async (files) => {
    const selected = Array.from(files);
    const invalid = selected.find((file) => !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024);
    if (invalid) {
      toast.error("Use a JPG, PNG, GIF or WEBP image up to 8 MB");
      return;
    }
    setUploading(true);
    try {
      const urls = [];
      for (const file of selected) {
        const fd = new FormData();
        fd.append("file", file);
        const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        urls.push(data.url);
      }
      if (multiple) onChangeMulti([...(values || []), ...urls]);
      else onChange(urls[0]);
      toast.success("Image uploaded");
    } catch { toast.error("Upload failed"); } finally { setUploading(false); }
  };

  if (multiple) {
    return (
      <div>
        <label className="mb-1.5 block text-sm font-medium text-nexora-ink">{label}</label>
        <div className="flex flex-wrap gap-3">
          {(values || []).map((u, i) => (
            <div key={i} className="relative h-20 w-20 overflow-hidden rounded-xl border border-nexora-border">
              <img src={resolveImage(u)} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => onChangeMulti(values.filter((_, idx) => idx !== i))} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-nexora-coral"><X size={12} /></button>
            </div>
          ))}
          <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-xl border border-dashed border-nexora-border text-nexora-muted hover:border-nexora-emerald" data-testid={testid}>
            {uploading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple className="hidden" onChange={(e) => e.target.files && handle(e.target.files)} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-nexora-ink">{label}</label>
      <div className="flex items-center gap-3">
        {value && <div className="h-16 w-16 overflow-hidden rounded-xl border border-nexora-border"><img src={resolveImage(value)} alt="" className="h-full w-full object-cover" /></div>}
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-nexora-border px-4 py-3 text-sm text-nexora-muted hover:border-nexora-emerald" data-testid={testid}>
          {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />} {value ? "Replace" : "Upload"}
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && handle(e.target.files)} />
        </label>
        {value && <button type="button" onClick={() => onChange(null)} className="text-sm text-nexora-coral">Remove</button>}
      </div>
    </div>
  );
}
