// src/StudyList.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./StudyList.css";

// Soporta CRA y Vite
const ORTHANC_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_ORTHANC_BASE) ||
  process.env.REACT_APP_ORTHANC_BASE ||
  //"https://testdcm.morisportal.com:50443/orthanc/";
  "https://dcm.morisportal.com/orthanc/";

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

// POST JSON sin preflight (para evitar CORS cuando el server no permite OPTIONS)
// Usa text/plain pero envía JSON real.
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

  // WhatsApp modal
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState("");
  const [waStudyId, setWaStudyId] = useState(null);
  const [waErr, setWaErr] = useState("");

  const yyyymmdd = useMemo(() => toYYYYMMDD(dateInput), [dateInput]);

  const buildViewerUrl = useCallback((studyOrthancId) => {
    // Ajusta aquí si tu viewer usa otra ruta/parámetro
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

    // Regla mínima: debe venir con código país. Ej: 5037XXXXXXX, 39123..., etc.
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

    // Esto abre WhatsApp Web/App con el mensaje prellenado.
    // Para “enviar automático” necesitarías WhatsApp Business API (backend + costos).
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
        if (aKey !== bKey) return aKey < bKey ? 1 : -1; // DESC
        return (a.id || "").localeCompare(b.id || "");
      };

      // MODO FECHA: todos los estudios del día seleccionado
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

      // MODO GLOBAL: últimos 50 estudios
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

  const downloadStudyZip = async (studyOrthancId) => {
    try {
      // Orthanc devuelve ZIP con los DICOM del estudio
      const url = `${BASE}studies/${studyOrthancId}/archive`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e?.message || "Error descargando DICOM");
    }
  };

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
              filtered.map((st) => (
                <div className="sl-row" key={st.id}>
                  <div className="sl-main">
                    <div className="sl-top">
                      <div className="sl-desc" title={st.description}>
                        {st.description}
                      </div>

                      <div className="sl-meta">
                        <span className="sl-chip">{st.modality || "—"}</span>
                        <span className="sl-chip">
                          {st.date ? formatDateDDMMYYYY(st.date) : "—"}
                        </span>
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

      {/* WhatsApp Modal */}
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
