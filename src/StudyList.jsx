import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./StudyList.css";

// Soporta CRA y Vite
const ORTHANC_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_ORTHANC_BASE) ||
  process.env.REACT_APP_ORTHANC_BASE ||
  "https://dcm.morisportal.com/orthanc/";

const REPORT_API_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_REPORT_API_BASE) ||
  process.env.REACT_APP_REPORT_API_BASE ||
  "https://viewer.morisportal.com/api";

// Normaliza para que SIEMPRE termine con "/"
const normalizeOrthancBase = (base) => {
  if (!base) return "";
  let b = String(base).trim();
  if (!b.endsWith("/")) b += "/";
  return b;
};

// Convierte "YYYY-MM-DD" => "YYYYMMDD"
const toYYYYMMDD = (inputDate) => {
  if (!inputDate) return "";
  const s = String(inputDate).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[1]}${m[2]}${m[3]}`;
};

// Convierte "YYYYMMDD" => "DD/MM/YYYY"
const formatDateDDMMYYYY = (yyyymmdd) => {
  const s = String(yyyymmdd || "");
  if (!/^\d{8}$/.test(s)) return "";
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
};

// POST JSON sin preflight
const postJsonNoPreflight = async (url, bodyObj) => {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(bodyObj),
  });
};

export default function StudyList() {
  const BASE = normalizeOrthancBase(ORTHANC_BASE);

  // Por defecto vacío: modo “Últimos 50”
  const [dateInput, setDateInput] = useState("");

  const [qName, setQName] = useState("");
  const [qPatientId, setQPatientId] = useState("");
  const [qQuick, setQQuick] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [studies, setStudies] = useState([]);

  // Estado reportes PDF
  const [reportStatus, setReportStatus] = useState({});
  const [uploadingStudyId, setUploadingStudyId] = useState(null);
  const [deletingStudyId, setDeletingStudyId] = useState(null);
  const fileInputRefs = useRef({});

  // WhatsApp modal
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState("");
  const [waStudyId, setWaStudyId] = useState(null);
  const [waErr, setWaErr] = useState("");

  const yyyymmdd = useMemo(() => toYYYYMMDD(dateInput), [dateInput]);

  const buildViewerUrl = useCallback((studyOrthancId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("study", studyOrthancId);
    url.searchParams.set("page", "viewer");
    return url.toString();
  }, []);

  const openViewer = useCallback(
    (studyOrthancId) => {
      const link = buildViewerUrl(studyOrthancId);
      window.open(link, "_blank", "noopener,noreferrer");
    },
    [buildViewerUrl]
  );

  const sanitizePhone = (raw) => String(raw || "").replace(/[^\d]/g, "");

  const openWhatsAppModal = useCallback((studyId) => {
    setWaStudyId(studyId);
    setWaPhone("");
    setWaErr("");
    setWaOpen(true);
  }, []);

  const sendWhatsApp = useCallback(() => {
    const phone = sanitizePhone(waPhone);

    if (!phone || phone.length < 10) {
      setWaErr("Número inválido. Usa código país + número (ej: 50371234567).");
      return;
    }
    if (!waStudyId) {
      setWaErr("No hay estudio seleccionado.");
      return;
    }

    const link = buildViewerUrl(waStudyId);
    const text = `Le compartimos el enlace con los resultados de su estudio: ${link}`;
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");

    setWaOpen(false);
  }, [waPhone, waStudyId, buildViewerUrl]);

  const fetchStudies = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (!BASE) throw new Error("ORTHANC base vacío");

      const safe = (v) => String(v || "").replace(/[^0-9]/g, "");

      const mapStudy = (id, data) => {
        const modality =
          data?.MainDicomTags?.Modality ||
          (Array.isArray(data?.MainDicomTags?.ModalitiesInStudy)
            ? data.MainDicomTags.ModalitiesInStudy.join(", ")
            : data?.MainDicomTags?.ModalitiesInStudy) ||
          "";

        return {
          id,
          description: data?.MainDicomTags?.StudyDescription || "Sin descripción",
          date: data?.MainDicomTags?.StudyDate || "",
          time: data?.MainDicomTags?.StudyTime || "",
          modality,
          patientName: data?.PatientMainDicomTags?.PatientName || "Desconocido",
          patientID: data?.PatientMainDicomTags?.PatientID || "N/A",
        };
      };

      const sortByDateDesc = (a, b) => {
        const aKey = `${safe(a.date)}${safe(a.time)}`;
        const bKey = `${safe(b.date)}${safe(b.time)}`;
        if (aKey !== bKey) return aKey < bKey ? 1 : -1;
        return (a.id || "").localeCompare(b.id || "");
      };

      if (yyyymmdd) {
        const findUrl = `${BASE}tools/find`;
        const findPayload = {
          Level: "Study",
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

        const studyIdsAll = await findResp.json();
        const studyIds = Array.isArray(studyIdsAll)
          ? studyIdsAll.filter((x) => typeof x === "string" && x)
          : [];

        if (!studyIds.length) {
          setStudies([]);
          return;
        }

        const loaded = await Promise.all(
          studyIds.map(async (id) => {
            const r = await fetch(`${BASE}studies/${id}`);
            if (!r.ok) return null;
            const data = await r.json();
            return mapStudy(id, data);
          })
        );

        setStudies(loaded.filter(Boolean).sort(sortByDateDesc));
        return;
      }

      const r = await fetch(`${BASE}studies?expand=true`);
      if (!r.ok) throw new Error(`Orthanc /studies HTTP ${r.status}`);

      const all = await r.json();
      const arr = Array.isArray(all) ? all : [];

      const mapped = arr
        .map((st) => mapStudy(st?.ID, st))
        .filter((x) => x && x.id)
        .sort(sortByDateDesc)
        .slice(0, 50);

      setStudies(mapped);
    } catch (e) {
      setStudies([]);
      setError(e?.message || "Error cargando estudios");
    } finally {
      setLoading(false);
    }
  }, [BASE, yyyymmdd]);

  const fetchReportStatus = useCallback(async (studyIds) => {
    const ids = Array.isArray(studyIds)
      ? [...new Set(studyIds.map((x) => String(x || "").trim()).filter(Boolean))]
      : [];

    if (!ids.length) {
      setReportStatus({});
      return;
    }

    try {
      const resp = await fetch(`${REPORT_API_BASE}/studies/reports/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ studyIds: ids }),
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(`API report status HTTP ${resp.status} ${t || ""}`.trim());
      }

      const data = await resp.json();
      const next = {};

      (data?.items || []).forEach((item) => {
        next[item.studyId] = {
          exists: !!item.exists,
          hasReport: !!item.hasReport,
        };
      });

      setReportStatus(next);
    } catch (e) {
      console.error("Error consultando estado de reportes:", e);
    }
  }, []);

  useEffect(() => {
    fetchStudies();
  }, [fetchStudies]);

  useEffect(() => {
    if (!studies.length) {
      setReportStatus({});
      return;
    }
    fetchReportStatus(studies.map((s) => s.id));
  }, [studies, fetchReportStatus]);

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

  const downloadStudyZip = async (studyOrthancId) => {
    try {
      const url = `${BASE}studies/${studyOrthancId}/archive`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e?.message || "Error descargando DICOM");
    }
  };

  const openPdf = useCallback((studyId) => {
    const url = `${REPORT_API_BASE}/studies/${encodeURIComponent(
      studyId
    )}/report/content`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const triggerPdfUpload = useCallback((studyId) => {
    const input = fileInputRefs.current[studyId];
    if (input) input.click();
  }, []);

  const handlePdfSelected = useCallback(
    async (studyId, file) => {
      if (!studyId || !file) return;

      if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name || "")) {
        setError("Solo se permiten archivos PDF.");
        return;
      }

      setUploadingStudyId(studyId);
      setError("");

      try {
        const formData = new FormData();
        formData.append("file", file);

        const resp = await fetch(
          `${REPORT_API_BASE}/studies/${encodeURIComponent(studyId)}/report`,
          {
            method: "POST",
            body: formData,
          }
        );

        const contentType = resp.headers.get("content-type") || "";
        const payload = contentType.includes("application/json")
          ? await resp.json()
          : await resp.text();

        if (!resp.ok) {
          const msg =
            typeof payload === "object" && payload?.message
              ? payload.message
              : `Error subiendo PDF (HTTP ${resp.status})`;
          throw new Error(msg);
        }

        setReportStatus((prev) => ({
          ...prev,
          [studyId]: {
            exists: true,
            hasReport: true,
            ...(typeof payload === "object" ? payload : {}),
          },
        }));
      } catch (e) {
        setError(e?.message || "Error subiendo PDF");
      } finally {
        setUploadingStudyId(null);
        const input = fileInputRefs.current[studyId];
        if (input) input.value = "";
      }
    },
    []
  );

  const deletePdf = useCallback(async (studyId) => {
    if (!studyId) return;

    const confirmed = window.confirm(
      "¿Deseas eliminar el reporte PDF asociado a este estudio?"
    );
    if (!confirmed) return;

    setDeletingStudyId(studyId);
    setError("");

    try {
      const resp = await fetch(
        `${REPORT_API_BASE}/studies/${encodeURIComponent(studyId)}/report`,
        {
          method: "DELETE",
        }
      );

      const contentType = resp.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await resp.json()
        : await resp.text();

      if (!resp.ok) {
        const msg =
          typeof payload === "object" && payload?.message
            ? payload.message
            : `Error eliminando PDF (HTTP ${resp.status})`;
        throw new Error(msg);
      }

      setReportStatus((prev) => ({
        ...prev,
        [studyId]: {
          exists: true,
          hasReport: false,
        },
      }));
    } catch (e) {
      setError(e?.message || "Error eliminando PDF");
    } finally {
      setDeletingStudyId(null);
    }
  }, []);

  return (
    <div className="sl-page">
      <div className="sl-shell">
        <div className="sl-card">
          <div className="sl-header">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44 }}>
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
                  Vista:{" "}
                  {yyyymmdd
                    ? `Fecha ${formatDateDDMMYYYY(yyyymmdd)}`
                    : "Últimos 50"}{" "}
                  · {loading ? "Cargando..." : `${filtered.length}/${studies.length}`}
                </div>
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
                value={dateInput || ""}
                onChange={(e) => setDateInput(e.target.value)}
                style={{
                  padding: "9px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(0,0,0,0.35)",
                  color: "#eaeef6",
                }}
              />
              {dateInput && (
                <button
                  type="button"
                  className="sl-clear"
                  style={{ position: "static", transform: "none" }}
                  onClick={() => setDateInput("")}
                  title="Quitar fecha"
                >
                  ×
                </button>
              )}
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

            <div className="sl-searchWrap">
              <input
                className="sl-search"
                placeholder="Buscar por Patient ID"
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

            <div className="sl-searchWrap" style={{ flex: 1 }}>
              <input
                className="sl-search"
                placeholder="Búsqueda rápida (nombre, ID, modalidad, descripción)"
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

            <button className="sl-btn" onClick={fetchStudies} disabled={loading}>
              Recargar
            </button>
          </div>

          {error && (
            <div className="sl-error" style={{ marginTop: 10 }}>
              {error}
            </div>
          )}

          <div className="sl-list" style={{ marginTop: 12 }}>
            {loading ? (
              <div className="sl-empty">Cargando...</div>
            ) : filtered.length === 0 ? (
              <div className="sl-empty">
                No hay estudios {yyyymmdd ? "para esa fecha" : "recientes"}.
              </div>
            ) : (
              filtered.map((st) => {
                const pdfInfo = reportStatus[st.id];
                const hasPdf = !!pdfInfo?.hasReport;
                const isUploading = uploadingStudyId === st.id;
                const isDeleting = deletingStudyId === st.id;

                return (
                  <div className="sl-row" key={st.id}>
                    <div className="sl-main">
                      <div className="sl-top">
                        <div className="sl-desc" title={st.description}>
                          {st.description}
                        </div>

                        <div
                          className="sl-meta"
                          style={{ display: "flex", alignItems: "center", gap: 8 }}
                        >
                          <span className="sl-chip">{st.modality || "—"}</span>
                          <span className="sl-chip">
                            {st.date ? formatDateDDMMYYYY(st.date) : "—"}
                          </span>
                          {hasPdf && <span className="sl-chip">PDF</span>}
                        </div>
                      </div>

                      <div className="sl-sub">
                        <div className="sl-patient" title={st.patientName}>
                          {st.patientName}
                        </div>
                        <div className="sl-pid">ID: {st.patientID}</div>
                      </div>

                      <div className="sl-id" title={st.id}>
                        Orthanc ID: {st.id}
                      </div>

                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        style={{ display: "none" }}
                        ref={(el) => {
                          if (el) fileInputRefs.current[st.id] = el;
                        }}
                        onChange={(e) =>
                          handlePdfSelected(st.id, e.target.files?.[0] || null)
                        }
                      />
                    </div>

                    <div className="sl-actions">
                      <button
                        className="sl-btn sl-btnPrimary"
                        onClick={() => openViewer(st.id)}
                      >
                        Ver en ViewerJS
                      </button>

                      <button className="sl-btn" onClick={() => downloadStudyZip(st.id)}>
                        DICOM
                      </button>

                      <button className="sl-btn" onClick={() => openWhatsAppModal(st.id)}>
                        WhatsApp
                      </button>

                      <button
                        className="sl-btn"
                        onClick={() => triggerPdfUpload(st.id)}
                        disabled={isUploading}
                        title={hasPdf ? "Reemplazar PDF" : "Subir PDF"}
                      >
                        {isUploading
                          ? "Subiendo..."
                          : hasPdf
                          ? "Reemplazar PDF"
                          : "Subir PDF"}
                      </button>

                      {hasPdf && (
                        <button className="sl-btn" onClick={() => openPdf(st.id)}>
                          Ver PDF
                        </button>
                      )}

                      {hasPdf && (
                        <button
                          className="sl-btn"
                          onClick={() => deletePdf(st.id)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? "Eliminando..." : "Eliminar PDF"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>
            Base Orthanc: <span style={{ opacity: 0.9 }}>{BASE}</span>
          </div>
        </div>
      </div>

      {waOpen && (
        <div className="sl-modalBackdrop" onClick={() => setWaOpen(false)}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sl-modalTitle">Enviar por WhatsApp</div>

            <div className="sl-modalHint">
              Escribe el número con <b>código país</b>. Ej: <code>50371234567</code>
            </div>

            <input
              className="sl-modalInput"
              placeholder="50371234567"
              value={waPhone}
              onChange={(e) => setWaPhone(e.target.value)}
              inputMode="numeric"
            />

            {waErr && (
              <div className="sl-error" style={{ marginTop: 10 }}>
                {waErr}
              </div>
            )}

            <div className="sl-modalActions">
              <button className="sl-btn" onClick={() => setWaOpen(false)}>
                Cancelar
              </button>
              <button className="sl-btn sl-btnPrimary" onClick={sendWhatsApp}>
                Enviar
              </button>
            </div>

            <div className="sl-modalFoot">
              Nota: esto abre WhatsApp (web/app). Debes estar logueado para enviar.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}