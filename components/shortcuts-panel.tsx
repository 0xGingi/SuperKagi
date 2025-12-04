"use client";

import {
  type CustomShortcuts,
  formatShortcutDisplay,
  isShortcutValid,
  parseKeyboardEvent,
  SHORTCUT_CONFIGS,
  saveCustomShortcuts,
} from "@/lib/keyboard-shortcuts";

type Props = {
  customShortcuts: CustomShortcuts;
  setCustomShortcuts: (value: CustomShortcuts) => void;
  editingShortcut: string | null;
  setEditingShortcut: (value: string | null) => void;
  recordingKey: string;
  setRecordingKey: (value: string) => void;
};

export function ShortcutsPanel({
  customShortcuts,
  setCustomShortcuts,
  editingShortcut,
  setEditingShortcut,
  recordingKey,
  setRecordingKey,
}: Props) {
  return (
    <div className="section">
      <div className="section-title">Keyboard Shortcuts</div>
      <div
        style={{
          marginBottom: "20px",
          color: "var(--muted)",
          fontSize: "14px",
        }}
      >
        Click on a shortcut to record a new key combination.
      </div>

      {SHORTCUT_CONFIGS.map((config) => {
        const currentKey = customShortcuts[config.action] || config.defaultKey;
        const isEditing = editingShortcut === config.action;
        const hasConflict =
          recordingKey &&
          isEditing &&
          SHORTCUT_CONFIGS.some(
            (c) =>
              c.action !== config.action &&
              (customShortcuts[c.action] || c.defaultKey) === recordingKey,
          );

        return (
          <div
            key={config.action}
            className="settings-row"
            style={{ alignItems: "center" }}
          >
            <div className="row-label">{config.label}</div>
            <div className="row-content">
              {isEditing ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                >
                  <input
                    className="field"
                    value={
                      recordingKey
                        ? formatShortcutDisplay(recordingKey)
                        : "Press a key combination..."
                    }
                    readOnly
                    style={{
                      cursor: "pointer",
                      background: hasConflict
                        ? "var(--error-bg, #fee)"
                        : "var(--input-bg)",
                    }}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      const parsed = parseKeyboardEvent(e.nativeEvent);
                      if (parsed) {
                        setRecordingKey(parsed);
                      }
                    }}
                  />
                  {hasConflict && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--error, #c00)",
                      }}
                    >
                      This shortcut is already in use
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        if (
                          recordingKey &&
                          isShortcutValid(recordingKey) &&
                          !hasConflict
                        ) {
                          const next = {
                            ...customShortcuts,
                            [config.action]: recordingKey,
                          };
                          setCustomShortcuts(next);
                          saveCustomShortcuts(next);
                        }
                        setEditingShortcut(null);
                        setRecordingKey("");
                      }}
                      disabled={!recordingKey || !!hasConflict}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        setEditingShortcut(null);
                        setRecordingKey("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "monospace",
                      padding: "8px 12px",
                      background: "var(--input-bg)",
                      borderRadius: "6px",
                      fontSize: "14px",
                      minWidth: "120px",
                    }}
                  >
                    {formatShortcutDisplay(currentKey)}
                  </div>
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => {
                      setEditingShortcut(config.action);
                      setRecordingKey("");
                    }}
                  >
                    Edit
                  </button>
                  {customShortcuts[config.action] && (
                    <button
                      type="button"
                      className="mini-btn"
                      onClick={() => {
                        const updated = { ...customShortcuts };
                        delete updated[config.action];
                        setCustomShortcuts(updated);
                        saveCustomShortcuts(updated);
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: "20px" }}>
        <button
          type="button"
          className="chip"
          onClick={() => {
            setCustomShortcuts({});
            saveCustomShortcuts({});
            setEditingShortcut(null);
            setRecordingKey("");
          }}
        >
          Reset All to Defaults
        </button>
      </div>
    </div>
  );
}
