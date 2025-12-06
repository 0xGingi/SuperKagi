import type { Attachment } from "@/components/attachment-list";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function readAttachment(file: File): Promise<Attachment | null> {
  const name = file.name;
  const type = (file.type || "").toLowerCase();
  const ext = name?.match(/\.([^.]+)$/)?.[1]?.toLowerCase() || "";
  try {
    if (
      type.startsWith("image/") ||
      ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
    ) {
      let url = await readAsDataURL(file);
      url = await optimizeImage(url, 1600, 0.85);
      if (url.length > MAX_UPLOAD_BYTES)
        url = await optimizeImage(url, 1200, 0.8);
      if (url.length > MAX_UPLOAD_BYTES)
        url = await optimizeImage(url, 900, 0.75);
      if (url.length > MAX_UPLOAD_BYTES)
        return {
          kind: "note",
          name,
          text: `[Image too large to attach: ${name}]`,
        };
      return { kind: "image", name, url };
    }
    if (
      ["txt", "md", "csv", "json", "log", "html", "htm"].includes(ext) ||
      type.startsWith("text/")
    ) {
      let text = await readAsText(file);
      text = String(text || "").slice(0, 20000);
      return { kind: "text", name, text };
    }
    if (ext === "pdf" || type === "application/pdf") {
      return { kind: "note", name, text: `[Attached PDF: ${name}]` };
    }
  } catch {}
  return { kind: "note", name, text: `[Attached file: ${name}]` };
}

export function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read error"));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsDataURL(file);
  });
}

export function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read error"));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsText(file);
  });
}

export async function optimizeImage(
  dataUrl: string,
  maxDim = 1600,
  quality = 0.85,
) {
  try {
    // Check if we are in environment with Image/Canvas (Client side)
    if (typeof document === "undefined") return dataUrl;

    const img = document.createElement("img");
    img.decoding = "async";
    img.src = dataUrl;
    await img.decode();
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", quality);
    return out && out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}
