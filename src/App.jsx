import { useState, useRef, useCallback, useEffect } from "react";

const FIELDS = [
  "Company Name",
  "Full Name",
  "Job Title",
  "Email / Other",
  "Phone / Other",
  "Fax / Other",
  "Address Line",
  "Address Line 2",
  "Web / Other",
];

const FIELD_KEYS = [
  "companyName",
  "fullName",
  "jobTitle",
  "email",
  "phone",
  "fax",
  "addressLine1",
  "addressLine2",
  "web",
];

const API_BASE = "/api";

async function fetchCards() {
  const response = await fetch(`${API_BASE}/cards`);
  if (!response.ok) throw new Error("Failed to fetch cards");
  return response.json();
}

async function extractCardData(base64Image, mimeType) {
  const response = await fetch(`${API_BASE}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Image, mimeType }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Server error: ${response.status}`);
  }
  return response.json();
}

async function updateCardInDB(id, data) {
  const response = await fetch(`${API_BASE}/cards/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update card");
  return response.json();
}

async function deleteCardFromDB(id) {
  const response = await fetch(`${API_BASE}/cards/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete card");
  return response.json();
}

function toCSV(rows) {
  const header = FIELDS.join(",");
  const lines = rows.map((r) =>
    FIELD_KEYS.map((k) => `"${(r[k] || "").toString().replace(/"/g, '""')}"`).join(",")
  );
  return [header, ...lines].join("\n");
}

function downloadCSV(rows) {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "business_cards_aggregate.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isEmptyExtraction(data) {
  return FIELD_KEYS.every((k) => !data[k] || data[k].toString().trim() === "");
}

const STATUS_COLORS = {
  pending: "#f59e0b",
  processing: "#3b82f6",
  done: "#10b981",
  error: "#ef4444",
  empty: "#f59e0b",
};

export default function App() {
  const [cards, setCards] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [editCell, setEditCell] = useState(null);
  const [editValue, setEditValue] = useState("");
  const fileInputRef = useRef();

  // Load cards on mount
  useEffect(() => {
    fetchCards()
      .then((data) => setCards(data.map(c => ({ id: c._id, data: c, status: c.status || 'done' }))))
      .catch((err) => console.error("Initial fetch failed:", err));
  }, []);

  const processFiles = useCallback(async (files) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return;

    const newEntries = imageFiles.map((file) => ({
      id: Math.random().toString(36).slice(2),
      file,
      preview: URL.createObjectURL(file),
      status: "pending",
      data: Object.fromEntries(FIELD_KEYS.map((k) => [k, ""])),
    }));

    setCards((prev) => [...newEntries, ...prev]);

    for (const entry of newEntries) {
      setCards((prev) =>
        prev.map((c) => (c.id === entry.id ? { ...c, status: "processing" } : c))
      );
      try {
        const base64 = await fileToBase64(entry.file);
        const savedCard = await extractCardData(base64, entry.file.type);
        const isEmpty = isEmptyExtraction(savedCard);

        setCards((prev) =>
          prev.map((c) =>
            c.id === entry.id
              ? { ...c, id: savedCard._id, status: isEmpty ? "empty" : "done", data: savedCard }
              : c
          )
        );
      } catch (e) {
        console.error("Extraction failed:", e);
        setCards((prev) =>
          prev.map((c) => (c.id === entry.id ? { ...c, status: "error" } : c))
        );
      }
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const startEdit = (cardId, key, value) => {
    setEditCell({ cardId, key });
    setEditValue(value);
  };

  const commitEdit = async () => {
    if (!editCell) return;
    const { cardId, key } = editCell;
    const originalValue = cards.find(c => c.id === cardId)?.data[key];

    if (editValue === originalValue) {
      setEditCell(null);
      return;
    }

    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId ? { ...c, data: { ...c.data, [key]: editValue } } : c
      )
    );

    try {
      await updateCardInDB(cardId, { [key]: editValue });
    } catch (err) {
      console.error("Failed to update database:", err);
      // Optional: rollback ui state on failure
    }
    setEditCell(null);
  };

  const removeCard = async (id) => {
    try {
      if (!id.toString().includes('.')) { // Only delete from DB if it's a real mongo ID
        await deleteCardFromDB(id);
      }
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const retryCard = useCallback(async (cardId) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card || !card.file) return;

    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, status: "processing" } : c))
    );
    try {
      const base64 = await fileToBase64(card.file);
      const savedCard = await extractCardData(base64, card.file.type);
      const isEmpty = isEmptyExtraction(savedCard);

      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? { ...c, id: savedCard._id, status: isEmpty ? "empty" : "done", data: savedCard }
            : c
        )
      );
    } catch (e) {
      console.error("Retry failed:", e);
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, status: "error" } : c))
      );
    }
  }, [cards]);

  const doneCount = cards.filter((c) => c.status === "done").length;

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.logoArea}>
          <span style={styles.logoIcon}>⬡</span>
          <span style={styles.logoText}>CardLens</span>
        </div>
        <p style={styles.tagline}>Shared Database Active: Drop business cards to sync with your team.</p>
      </header>

      <div
        style={{
          ...styles.dropZone,
          ...(dragging ? styles.dropZoneActive : {}),
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => processFiles(e.target.files)}
        />
        <div style={styles.dropIcon}>{dragging ? "⬇" : "＋"}</div>
        <p style={styles.dropText}>
          {dragging ? "Release to scan" : "Drop card images here or click to upload"}
        </p>
        <p style={styles.dropSub}>Shared repository · Everyone in Chat sees these results</p>
      </div>

      {cards.length > 0 && (
        <div style={styles.tableSection}>
          <div style={styles.tableHeader}>
            <span style={styles.tableTitle}>
              {cards.length} cards in shared aggregate
            </span>
            <button
              style={styles.exportBtn}
              onClick={() => downloadCSV(cards.map((c) => c.data))}
            >
              ↓ Export All to CSV
            </button>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, ...styles.thCard }}>Card</th>
                  <th style={{ ...styles.th, ...styles.thStatus }}>Status</th>
                  {FIELDS.map((f) => (
                    <th key={f} style={styles.th}>{f}</th>
                  ))}
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {cards.map((card, idx) => (
                  <tr key={card.id || idx} style={idx % 2 === 0 ? styles.trEven : styles.trOdd}>
                    <td style={styles.tdCard}>
                      {card.preview ? (
                        <img src={card.preview} alt="card" style={styles.cardThumb} />
                      ) : (
                        <div style={styles.cardPlaceholder}>🖼</div>
                      )}
                    </td>
                    <td style={styles.tdStatus}>
                      <span
                        style={{
                          ...styles.statusBadge,
                          background: STATUS_COLORS[card.status] + "22",
                          color: STATUS_COLORS[card.status],
                          borderColor: STATUS_COLORS[card.status] + "55",
                        }}
                      >
                        {card.status === "processing" ? (
                          <span style={styles.spinner}>◌</span>
                        ) : card.status === "done" ? "✓" : card.status === "error" ? "✕" : card.status === "empty" ? "⚠" : "…"}
                        {" "}{card.status}
                      </span>
                    </td>
                    {FIELD_KEYS.map((key) => (
                      <td
                        key={key}
                        style={styles.tdData}
                        onClick={() => startEdit(card.id, key, card.data[key])}
                      >
                        {editCell?.cardId === card.id && editCell?.key === key ? (
                          <input
                            autoFocus
                            style={styles.cellInput}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") setEditCell(null);
                            }}
                          />
                        ) : (
                          <span style={styles.cellText}>{card.data[key] || <span style={styles.empty}>—</span>}</span>
                        )}
                      </td>
                    ))}
                    <td style={styles.tdActions}>
                      {(card.status === "error" || card.status === "empty") && card.file && (
                        <button
                          style={styles.retryBtn}
                          onClick={() => retryCard(card.id)}
                          title="Retry extraction"
                        >↻</button>
                      )}
                      <button style={styles.deleteBtn} onClick={() => removeCard(card.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {cards.length === 0 && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No cards in the shared database yet.</p>
          <p style={styles.emptyHint}>Collaborate with your team to populate this list.</p>
        </div>
      )}
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background: "#0a0a0f",
    color: "#e8e4dc",
    fontFamily: "'Georgia', 'Times New Roman', serif",
    padding: "40px 24px 80px",
    boxSizing: "border-box",
  },
  header: {
    textAlign: "center",
    marginBottom: 40,
  },
  logoArea: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 8,
  },
  logoIcon: {
    fontSize: 28,
    color: "#c9a96e",
  },
  logoText: {
    fontSize: 32,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "#f0ebe0",
    fontFamily: "'Georgia', serif",
  },
  tagline: {
    color: "#7a7060",
    fontSize: 15,
    margin: 0,
    letterSpacing: "0.05em",
  },
  dropZone: {
    border: "1.5px dashed #3a3530",
    borderRadius: 12,
    padding: "48px 24px",
    textAlign: "center",
    cursor: "pointer",
    maxWidth: 560,
    margin: "0 auto 48px",
    transition: "all 0.2s ease",
    background: "#0f0e12",
  },
  dropZoneActive: {
    border: "1.5px dashed #c9a96e",
    background: "#14120a",
  },
  dropIcon: {
    fontSize: 36,
    color: "#c9a96e",
    marginBottom: 12,
    lineHeight: 1,
  },
  dropText: {
    margin: "0 0 6px",
    fontSize: 16,
    color: "#c8c0b0",
  },
  dropSub: {
    margin: 0,
    fontSize: 13,
    color: "#5a5248",
  },
  tableSection: {
    maxWidth: "100%",
    overflowX: "auto",
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  tableTitle: {
    fontSize: 14,
    color: "#7a7060",
    letterSpacing: "0.05em",
  },
  exportBtn: {
    background: "#c9a96e",
    color: "#0a0a0f",
    border: "none",
    borderRadius: 6,
    padding: "8px 18px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.04em",
    fontFamily: "inherit",
  },
  tableWrap: {
    overflowX: "auto",
    borderRadius: 10,
    border: "1px solid #1e1c18",
  },
  table: {
    borderCollapse: "collapse",
    width: "100%",
    fontSize: 13,
    minWidth: 900,
  },
  th: {
    background: "#111018",
    color: "#8a8070",
    padding: "10px 14px",
    textAlign: "left",
    fontWeight: 600,
    letterSpacing: "0.04em",
    fontSize: 11,
    textTransform: "uppercase",
    borderBottom: "1px solid #1e1c18",
    whiteSpace: "nowrap",
  },
  thCard: { width: 64 },
  thStatus: { width: 110 },
  trEven: { background: "#0c0b10" },
  trOdd: { background: "#0f0e12" },
  tdCard: {
    padding: "8px 12px",
    borderBottom: "1px solid #1a1818",
    verticalAlign: "middle",
  },
  cardThumb: {
    width: 52,
    height: 34,
    objectFit: "cover",
    borderRadius: 4,
    border: "1px solid #2a2820",
    display: "block",
  },
  cardPlaceholder: {
    width: 52,
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#1a1820",
    color: "#3a3530",
    borderRadius: 4,
    fontSize: 18,
  },
  tdStatus: {
    padding: "8px 12px",
    borderBottom: "1px solid #1a1818",
    verticalAlign: "middle",
  },
  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 4,
    border: "1px solid",
    letterSpacing: "0.04em",
    fontWeight: 600,
    textTransform: "capitalize",
    fontFamily: "'Courier New', monospace",
  },
  spinner: {
    display: "inline-block",
    animation: "spin 1s linear infinite",
  },
  tdData: {
    padding: "8px 12px",
    borderBottom: "1px solid #1a1818",
    verticalAlign: "middle",
    cursor: "text",
    minWidth: 120,
    maxWidth: 200,
  },
  cellText: {
    display: "block",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "#d4cfc5",
  },
  empty: {
    color: "#2e2c28",
  },
  cellInput: {
    background: "#1a1820",
    border: "1px solid #c9a96e",
    color: "#e8e4dc",
    padding: "3px 6px",
    borderRadius: 4,
    fontSize: 13,
    fontFamily: "inherit",
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
  },
  tdActions: {
    padding: "8px 8px",
    borderBottom: "1px solid #1a1818",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  retryBtn: {
    background: "none",
    border: "1px solid #c9a96e44",
    color: "#c9a96e",
    cursor: "pointer",
    fontSize: 16,
    padding: "2px 7px",
    borderRadius: 4,
    marginRight: 4,
    transition: "all 0.15s",
    fontFamily: "inherit",
  },
  deleteBtn: {
    background: "none",
    border: "none",
    color: "#3a3530",
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 6px",
    borderRadius: 4,
    transition: "color 0.15s",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 0",
    borderTop: "1px solid #1a1818",
  },
  emptyText: {
    color: "#4a4540",
    fontSize: 15,
    margin: "0 0 8px",
  },
  emptyHint: {
    color: "#2e2c28",
    fontSize: 12,
    margin: 0,
    letterSpacing: "0.03em",
  },
};
