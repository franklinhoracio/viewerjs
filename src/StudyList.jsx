// src/StudyList.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./StudyList.css";

// Soporta CRA y Vite
const ORTHANC_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_ORTHANC_BASE) ||
  process.env.REACT_APP_ORTHANC_BASE ||
  "https://testdcm.morisportal.com:50443/orthanc/";

// Normaliza para que SIEMPRE termine con "/"
const normalizeOrthancBase = (base) => {
  if (!base) return "";
  let b = String(base).trim();
  if (!b.endsWith("/")) b += "/";
  return b;
};

const BASE = normalizeOrthancBase(ORTHANC_BASE);

// Utils
const pad2 = (n) => String(n).padStart(2, "0");

const toYYYYMMDD = (yyyy_mm_dd) => {
  if (!yyyy_mm_dd) return "";
  const s = String(yyyy_mm_dd).trim();
  if (/^\d{8}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[1]}${m[2]}${m[3]}`;
};

const toInputDate = (d = new Date()) => {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
};

const formatDateDDMMYYYY = (yyyymmdd) => {
  if (!yyyymmdd || String(yyyymmdd).length !== 8) return "";
  const s = String(yyyymmdd);
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
};

const safe = (v, fallback = "") =>
  v == null || v === "" ? fallback : String(v);

/**
 * POST JSON a Orthanc SIN Content-Type para evitar preflight (CORS).
 * Esto suele arreglar el "NetworkError when attempting to fetch resource."
 */
async function postJsonNoPreflight(url, payload) {
  const resp = await fetch(url, {
    method: "POST",
    // NO headers -> el browser manda text/plain;charset=UTF-8 (simple request)
    body: JSON.stringify(payload),
  });
  return resp;
}

export default function StudyList({ onOpenStudy }) {
  const [dateInput, setDateInput] = useState(toInputDate());
  const [qName, setQName] = useState("");
  const [qPatientId, setQPatientId] = useState("");
  const [qQuick, setQQuick] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [studies, setStudies] = useState([]);

  const yyyymmdd = useMemo(() => toYYYYMMDD(dateInput), [dateInput]);

  // URL del viewer (quita page=study_list y pone study=<OrthancStudyID>)
  const buildViewerUrl = useCallback((studyOrthancId) => {
    const u = new URL(window.location.href);
    u.searchParams.delete("page");
    u.searchParams.set("study", studyOrthancId);
    return u.toString();
  }, []);

  const openViewer = useCallback(
    (studyOrthancId) => {
      if (typeof onOpenStudy === "function") {
        onOpenStudy(studyOrthancId);
        return;
      }
      window.location.href = buildViewerUrl(studyOrthancId);
    },
    [onOpenStudy, buildViewerUrl]
  );

  const downloadStudyZip = useCallback((studyOrthancId) => {
    const url = `${BASE}studies/${studyOrthancId}/archive`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const shareWhatsapp = useCallback(
    (studyOrthancId) => {
      const link = buildViewerUrl(studyOrthancId);
      const wa = `https://wa.me/?text=${encodeURIComponent(link)}`;
      window.open(wa, "_blank", "noopener,noreferrer");
    },
    [buildViewerUrl]
  );

  const fetchStudies = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (!BASE) throw new Error("ORTHANC base vacío");
      if (!yyyymmdd)
        throw new Error("Fecha inválida (no puedo formar YYYYMMDD)");

      // 1) Buscar series por StudyDate
      const findUrl = `${BASE}tools/find`;
      const findPayload = {
        Level: "Series",
        Expand: false,
        Query: { StudyDate: yyyymmdd },
      };

      const findResp = await postJsonNoPreflight(findUrl, findPayload);

      if (!findResp.ok) {
        const t = await findResp.text().catch(() => "");
        throw new Error(
          `Orthanc /tools/find HTTP ${findResp.status} ${t || ""}`.trim()
        );
      }

      const seriesIdsAll = await findResp.json();
      const seriesIds = Array.isArray(seriesIdsAll)
        ? seriesIdsAll.filter((x) => typeof x === "string" && x)
        : [];

      if (!seriesIds.length) {
        setStudies([]);
        return;
      }

      // 2) Series -> ParentStudy + Modality
      const modalityByStudy = new Map();
      const studyIdsSet = new Set();

      await Promise.all(
        seriesIds.map(async (sid) => {
          const r = await fetch(`${BASE}series/${sid}`);
          if (!r.ok) return;
          const data = await r.json();
          const studyId = data?.ParentStudy;
          if (!studyId) return;

          studyIdsSet.add(studyId);

          const mod = data?.MainDicomTags?.Modality || "";
          if (mod) modalityByStudy.set(studyId, mod);
        })
      );

      // 3) Cargar Studies (para PatientMainDicomTags)
      const studyIds = Array.from(studyIdsSet);

      const loaded = await Promise.all(
        studyIds.map(async (id) => {
          const r = await fetch(`${BASE}studies/${id}`);
          if (!r.ok) return null;
          const data = await r.json();

          const modalityFromStudy =
            modalityByStudy.get(id) ||
            data?.MainDicomTags?.Modality ||
            (Array.isArray(data?.MainDicomTags?.ModalitiesInStudy)
              ? data.MainDicomTags.ModalitiesInStudy.join(", ")
              : data?.MainDicomTags?.ModalitiesInStudy) ||
            "";

          return {
            id,
            description:
              data?.MainDicomTags?.StudyDescription || "Sin descripción",
            date: data?.MainDicomTags?.StudyDate || "",
            modality: modalityFromStudy || "",
            patientName:
              data?.PatientMainDicomTags?.PatientName || "Desconocido",
            patientID: data?.PatientMainDicomTags?.PatientID || "N/A",
          };
        })
      );

      const cleaned = loaded.filter(Boolean);

      cleaned.sort((a, b) => {
        const A = (a.patientName || "").toLowerCase();
        const B = (b.patientName || "").toLowerCase();
        if (A !== B) return A < B ? -1 : 1;
        const dA = (a.description || "").toLowerCase();
        const dB = (b.description || "").toLowerCase();
        if (dA !== dB) return dA < dB ? -1 : 1;
        return (a.id || "").localeCompare(b.id || "");
      });

      setStudies(cleaned);
    } catch (e) {
      setStudies([]);
      setError(e?.message || "Error cargando estudios");
    } finally {
      setLoading(false);
    }
  }, [yyyymmdd]);

  useEffect(() => {
    fetchStudies();
  }, [fetchStudies]);

  const filtered = useMemo(() => {
    const nameNeedle = qName.trim().toLowerCase();
    const pidNeedle = qPatientId.trim().toLowerCase();
    const quick = qQuick.trim().toLowerCase();

    return studies.filter((s) => {
      const patient = (s.patientName || "").toLowerCase();
      const pid = (s.patientID || "").toLowerCase();
      const mod = (s.modality || "").toLowerCase();
      const desc = (s.description || "").toLowerCase();

      const nameOk = !nameNeedle || patient.includes(nameNeedle);
      const pidOk = !pidNeedle || pid.includes(pidNeedle);

      const quickOk =
        !quick ||
        patient.includes(quick) ||
        pid.includes(quick) ||
        mod.includes(quick) ||
        desc.includes(quick);

      return nameOk && pidOk && quickOk;
    });
  }, [studies, qName, qPatientId, qQuick]);

  return (
    <div className="sl-page">
      <div className="sl-shell">
        <div className="sl-header">
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div
  className="sl-logoWrap"
>
            <img
              src="/logo.png"
              alt="Logo"
              className="sl-logo"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 className="sl-title" style={{ marginBottom: 2 }}>
                Lista de Estudios
              </h2>
              <div className="sl-pill">
                Fecha: {yyyymmdd ? formatDateDDMMYYYY(yyyymmdd) : "—"} ·{" "}
                {loading ? "Cargando..." : `${filtered.length}/${studies.length}`}
              </div>
            </div>
          </div>

          <img
            src="/banner.jpg"
            alt="Banner"
            style={{
              width: "100%",
              height: 140,
              objectFit: "cover",
              borderRadius: 12,
              marginBottom: 12,
              display: "block",
            }}
            onError={(e) => (e.currentTarget.style.display = "none")}
          />

          <div className="sl-controls">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Fecha</span>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                style={{
                  padding: "9px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.35)",
                  color: "#eaeef6",
                }}
              />
            </label>

            <div className="sl-searchWrap">
              <input
                className="sl-search"
                placeholder="Buscar por nombre"
                value={qName}
                onChange={(e) => setQName(e.target.value)}
              />
              {qName && (
                <button
                  className="sl-clear"
                  onClick={() => setQName("")}
                  title="Limpiar"
                >
                  ×
                </button>
              )}
            </div>

            <div className="sl-searchWrap" style={{ minWidth: 220 }}>
              <input
                className="sl-search"
                placeholder="Buscar por ID paciente"
                value={qPatientId}
                onChange={(e) => setQPatientId(e.target.value)}
              />
              {qPatientId && (
                <button
                  className="sl-clear"
                  onClick={() => setQPatientId("")}
                  title="Limpiar"
                >
                  ×
                </button>
              )}
            </div>

            <div className="sl-searchWrap" style={{ minWidth: 260 }}>
              <input
                className="sl-search"
                placeholder="Filtro rápido: paciente / ID / mod / desc…"
                value={qQuick}
                onChange={(e) => setQQuick(e.target.value)}
              />
              {qQuick && (
                <button
                  className="sl-clear"
                  onClick={() => setQQuick("")}
                  title="Limpiar"
                >
                  ×
                </button>
              )}
            </div>

            <button
              className="sl-btn sl-btnPrimary"
              onClick={fetchStudies}
              disabled={loading}
            >
              Refrescar
            </button>
          </div>

          {error && <div className="sl-error">{error}</div>}
        </div>

        <div className="sl-list">
          {!loading && filtered.length === 0 ? (
            <div className="sl-empty">
              No hay estudios para los filtros seleccionados.
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
                Mostrando {filtered.length} de {studies.length} estudios para la
                fecha {yyyymmdd ? formatDateDDMMYYYY(yyyymmdd) : "—"}.
              </div>
            </div>
          ) : (
            filtered.map((st) => (
              <div className="sl-card" key={st.id}>
                <div className="sl-cardTop">
                  <div className="sl-main">
                    <div className="sl-patient">
                      {safe(st.patientName, "Desconocido")}
                    </div>
                    <div className="sl-sub">
                      <span className="sl-muted">{safe(st.patientID, "N/A")}</span>
                      <span className="sl-dot">•</span>
                      <span className="sl-muted">
                        {st.date ? formatDateDDMMYYYY(st.date) : "Sin fecha"}
                      </span>
                    </div>
                    <div className="sl-desc">
                      {safe(st.description, "Sin descripción")}
                    </div>
                  </div>

                  <div className="sl-meta">
                    <div className={`sl-badge ${st.modality ? "" : "sl-badgeDim"}`}>
                      {st.modality ? st.modality : "—"}
                    </div>
                    <div className="sl-id" title={st.id}>
                      Orthanc ID: {st.id}
                    </div>
                  </div>
                </div>

                <div className="sl-actions">
                  <button
                    className="sl-btn sl-btnPrimary"
                    onClick={() => openViewer(st.id)}
                  >
                    Ver en ViewerJS
                  </button>

                  <button className="sl-btn" onClick={() => downloadStudyZip(st.id)}>
                    Descargar DICOM
                  </button>

                  <button className="sl-btn" onClick={() => shareWhatsapp(st.id)}>
                    WhatsApp
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>
          Base Orthanc: <span style={{ opacity: 0.9 }}>{BASE}</span>
        </div>
      </div>
    </div>
  );
}
