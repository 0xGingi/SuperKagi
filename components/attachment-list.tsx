"use client";

function extOf(name: string) {
  const m = name?.match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : "";
}

export type Attachment = {
  kind: string;
  name: string;
  text?: string;
  url?: string;
};

export function AttachmentList({
  attachments,
  removeAttachment,
}: {
  attachments: Attachment[];
  removeAttachment: (idx: number) => void;
}) {
  return (
    <div className="attach-list" id="hero-attachments">
      {attachments.map((a, idx) => {
        const ext = a.kind === "image" ? "image" : extOf(a.name) || a.kind;
        return (
          <span key={`${a.name}-${idx}`} className="attach-chip">
            <span className="ext">{ext}</span> {a.name}{" "}
            <button
              type="button"
              title="Remove"
              onClick={() => removeAttachment(idx)}
            >
              ×
            </button>
          </span>
        );
      })}
    </div>
  );
}
