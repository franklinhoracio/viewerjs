// src/App.js
import React, { useEffect, useRef, useState } from "react";
import dicomParser from "dicom-parser";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import { cornerstone, cornerstoneTools } from "./cornerstoneConfig";
import "./App.css";
import StudyList from "./StudyList";
import { ORTHANC_BASE } from "./config";

//const ORTHANC_BASE =
  //process.env.REACT_APP_ORTHANC_BASE ||
  //"https://testdcm.morisportal.com:50443/orthanc/";
  //"https://dcm.morisportal.com/orthanc/";

const BASE = ORTHANC_BASE;
const ORTHANC_DOWNLOAD_BASE = ORTHANC_BASE;

const wadouriFromInstanceId = (id) =>
  `wadouri:${BASE}/instances/${id}/file?contentType=application/dicom`;

const studySeriesExpanded = (studyId) =>
  `${BASE}/studies/${studyId}/series?expand=true`;
const seriesInstancesEx = (seriesId) =>
  `${BASE}/series/${seriesId}/instances?expand=true`;

// Helpers de orden
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const safeLower = (s) => (typeof s === "string" ? s.toLowerCase() : "");

const sortSeries = (arr) =>
  [...arr].sort((a, b) => {
    const A = a.MainDicomTags || {};
    const B = b.MainDicomTags || {};
    const snA = num(A.SeriesNumber);
    const snB = num(B.SeriesNumber);
    if (snA != null && snB != null && snA !== snB) return snA - snB;
    const dtA = safeLower(A.SeriesDate) + safeLower(A.SeriesTime);
    const dtB = safeLower(B.SeriesDate) + safeLower(B.SeriesTime);
    if (dtA && dtB && dtA !== dtB) return dtA < dtB ? -1 : 1;
    return a.ID < b.ID ? -1 : 1;
  });

const sortInstances = (arr) =>
  [...arr].sort((a, b) => {
    const A = a.MainDicomTags || {};
    const B = b.MainDicomTags || {};
    const inA = num(A.InstanceNumber);
    const inB = num(B.InstanceNumber);
    if (inA != null && inB != null && inA !== inB) return inA - inB;
    const zA =
      Array.isArray(A.ImagePositionPatient) && A.ImagePositionPatient.length >= 3
        ? num(A.ImagePositionPatient[2])
        : null;
    const zB =
      Array.isArray(B.ImagePositionPatient) && B.ImagePositionPatient.length >= 3
        ? num(B.ImagePositionPatient[2])
        : null;
    if (zA != null && zB != null && zA !== zB) return zA - zB;
    const sA = safeLower(A.SOPInstanceUID);
    const sB = safeLower(B.SOPInstanceUID);
    if (sA && sB && sA !== sB) return sA < sB ? -1 : 1;
    return a.ID < b.ID ? -1 : 1;
  });

// --------- formato fecha para cabecera ----------
const formatDate = (yyyymmdd) => {
  if (!yyyymmdd || yyyymmdd.length !== 8) return "";
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${d}/${m}/${y}`;
};

export default function App() {
  // --- router mini por query ---
  const params = new URLSearchParams(window.location.search);
  const page = params.get("page");
  const isStudyList = page === "study_list";
  const studyIdFromUrl = params.get("study");

  const viewportRef = useRef(null);
  const titleRef = useRef(null);
  const counterRef = useRef(null);
  const seriesCounterRef = useRef(null);

  // auto-scroll por botones (triángulos)
  const btnScrollRef = useRef({
    timerId: null,
    delay: 220,
    dir: 0,
    type: null, // 'series' | 'instance'
  });

  // header: paciente y estudios
  const [patientInfo, setPatientInfo] = useState(null);
  const [patientStudies, setPatientStudies] = useState([]); // historial
  const [currentStudyMeta, setCurrentStudyMeta] = useState(null);

  const [showPatientModal, setShowPatientModal] = useState(false);
  const [showStudiesModal, setShowStudiesModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // tool state
  const [activeTool, setActiveTool] = useState("navigate");
  const activeToolRef = useRef(activeTool);
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  // WL/WW, Pan y Zoom state
  const lastWlState = useRef({ wc: null, ww: null });
  const isDraggingRef = useRef(false);
  const panStateRef = useRef({
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
  });
  const zoomStateRef = useRef({
    startY: 0,
    baseScale: 1,
  });

  // navegación
  const seriesListRef = useRef([]); // [{ seriesId, description, instances: [...] }]
  const sIdxRef = useRef(0);
  const iIdxRef = useRef(0);

  // touch scrub navegación
  const touchRef = useRef({
    startX: null,
    startY: null,
    axis: null, // "x" | "y"
    accX: 0,
    accY: 0,
  });

  const wheelLockRef = useRef(false);

  // auto-scroll en bordes (instancias)
  const edgeScrollRef = useRef({
    dir: 0, // -1 izquierda, +1 derecha
    timerId: null, // setInterval id
  });

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const seriesCount = () => seriesListRef.current.length;
  const instCount = () =>
    seriesListRef.current[sIdxRef.current]?.instances.length || 0;

  const showImage = async () => {
    const el = viewportRef.current;
    if (!el) return;
    const s = seriesListRef.current[sIdxRef.current];
    if (!s) return;
    const inst = s.instances[iIdxRef.current];
    if (!inst) return;

    const imageId = wadouriFromInstanceId(inst.ID);
    try {
      const image = await cornerstone.loadAndCacheImage(imageId);
      cornerstone.displayImage(el, image);

      console.log("IMAGE LOADED", image);
      console.log("PIXEL SPACING", image.rowPixelSpacing, image.columnPixelSpacing);
      console.log("ACTIVE TOOL", activeToolRef.current);

      cornerstone.updateImage(el);
      // título dinámico por serie
      const desc =
        s?.description ||
        s?.instances?.[0]?.MainDicomTags?.SeriesDescription ||
        "Serie sin descripción";
      if (titleRef.current) titleRef.current.textContent = desc;

      // contador i/total
      const i = iIdxRef.current + 1;
      const total = s.instances.length;
      if (counterRef.current) counterRef.current.textContent = `${i}/${total}`;

      // contador series
      const totalSeries = seriesCount();
      if (seriesCounterRef.current) {
        const currentSeries = totalSeries ? sIdxRef.current + 1 : 0;
        seriesCounterRef.current.textContent = `${currentSeries}/${totalSeries}`;
      }
    } catch (e) {
      console.error("display error", imageId, e);
    }
  };

  const goTo = (sIdx, iIdx) => {
    const sMax = seriesCount() - 1;
    if (sMax < 0) return;
    const S = clamp(sIdx, 0, sMax);
    const iMax = (seriesListRef.current[S]?.instances.length || 1) - 1;
    const I = clamp(iIdx, 0, Math.max(iMax, 0));
    sIdxRef.current = S;
    iIdxRef.current = I;
    showImage();
  };

  const stepSeries = (delta) => {
    const next = clamp(sIdxRef.current + delta, 0, seriesCount() - 1);
    if (next !== sIdxRef.current) goTo(next, 0);
  };

  const stepInstance = (delta) => {
    const n = instCount();
    if (n <= 1) return;
    const next = clamp(iIdxRef.current + delta, 0, n - 1);
    if (next !== iIdxRef.current) goTo(sIdxRef.current, next);
  };

  // --------- auto-scroll por triángulos (con aceleración) ----------
  const stopButtonScroll = () => {
    const st = btnScrollRef.current;
    if (st.timerId) {
      clearTimeout(st.timerId);
      st.timerId = null;
    }
    st.dir = 0;
    st.type = null;
    st.delay = 220;
  };

  const runButtonStep = () => {
    const st = btnScrollRef.current;
    if (!st.type || !st.dir) return;

    // solo funcionan en modo "navigate"
    if (activeToolRef.current !== "navigate") {
      stopButtonScroll();
      return;
    }

    if (st.type === "series") stepSeries(st.dir);
    else if (st.type === "instance") stepInstance(st.dir);

    // aceleración
    st.delay = Math.max(70, st.delay * 0.8);
    st.timerId = setTimeout(runButtonStep, st.delay);
  };

  const startButtonScroll = (type, dir) => {
    stopButtonScroll();
    const st = btnScrollRef.current;
    st.type = type;
    st.dir = dir;
    st.delay = 220;

    // primer paso inmediato
    runButtonStep();
  };

  const makeTriangleHandlers = (type, dir) => ({
    onMouseDown: (e) => {
      e.preventDefault();
      startButtonScroll(type, dir);
    },
    onMouseUp: stopButtonScroll,
    onMouseLeave: stopButtonScroll,
    onTouchStart: (e) => {
      e.preventDefault();
      startButtonScroll(type, dir);
    },
    onTouchEnd: stopButtonScroll,
    onTouchCancel: stopButtonScroll,
  });

  // ----------- loadStudy: carga estudio + paciente + historial -----------
  const loadStudy = async (studyId) => {
    if (!studyId) return;

    try {
      // 1) Metadatos del estudio
      const studyResp = await fetch(`${BASE}/studies/${studyId}`);
      if (!studyResp.ok) throw new Error(`Study HTTP ${studyResp.status}`);
      const studyJson = await studyResp.json();
      const sTags = studyJson.MainDicomTags || {};

      setCurrentStudyMeta({
        id: studyId,
        description: sTags.StudyDescription || "Estudio sin descripción",
        date: sTags.StudyDate || "",
      });

      // 2) Paciente + estudios del paciente
      const patientId = studyJson.ParentPatient;
      if (patientId) {
        const pResp = await fetch(`${BASE}/patients/${patientId}`);
        if (pResp.ok) {
          const pJson = await pResp.json();
          const pTags = pJson.PatientMainDicomTags || pJson.MainDicomTags || {};
          setPatientInfo({
            id: patientId,
            name: pTags.PatientName || "Paciente sin nombre",
            sex: pTags.PatientSex || "",
            birthDate: pTags.PatientBirthDate || "",
            patientId: pTags.PatientID || "",
          });
        }

        const listResp = await fetch(
          `${BASE}/patients/${patientId}/studies?expand=true`
        );
        if (listResp.ok) {
          const listJson = await listResp.json();
          const mapped = listJson.map((st) => {
            const t = st.MainDicomTags || {};
            return {
              id: st.ID,
              description: t.StudyDescription || "Estudio sin descripción",
              date: t.StudyDate || "",
              modality: t.Modality || t.ModalitiesInStudy || "",
            };
          });
          setPatientStudies(mapped);
        }
      }

      // 3) Series + instancias
      const sResp = await fetch(studySeriesExpanded(studyId));
      if (!sResp.ok) throw new Error(`Series HTTP ${sResp.status}`);
      const seriesExp = await sResp.json();
      const orderedSeries = sortSeries(seriesExp);

      const seriesWithInstances = [];
      for (const s of orderedSeries) {
        const sTags = s.MainDicomTags || {};
        const modality = sTags.Modality || "";

        // Filtrar SR a nivel de serie
        if (modality === "SR") continue;

        const r = await fetch(seriesInstancesEx(s.ID));
        if (!r.ok) continue;
        const instExp = await r.json();

        let orderedInst = sortInstances(instExp);

        // filtrar SR por SOPClassUID
        orderedInst = orderedInst.filter((inst) => {
          const t = inst.MainDicomTags || {};
          const sop = t.SOPClassUID || "";
          return !sop.startsWith("1.2.840.10008.5.1.4.1.1.88.");
        });

        if (orderedInst.length) {
          const desc =
            sTags.SeriesDescription ||
            sTags.ProtocolName ||
            `Serie ${seriesWithInstances.length + 1}`;
          seriesWithInstances.push({
            seriesId: s.ID,
            description: desc,
            instances: orderedInst,
          });
        }
      }

      if (!seriesWithInstances.length) {
        console.warn("Sin instancias visibles");
        return;
      }

      seriesListRef.current = seriesWithInstances;
      sIdxRef.current = 0;
      iIdxRef.current = 0;
      showImage();
    } catch (e) {
      console.error("loadStudy error", e);
    }
  };

  // -------- Visor: init / listeners / resize / loadStudy --------
  useEffect(() => {
    if (isStudyList) return; // modo lista: no tocar cornerstone

    // Bridge
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

const wadouriMetaProvider =
  cornerstoneWADOImageLoader?.wadouri?.metaData?.metaDataProvider ||
  cornerstoneWADOImageLoader?.wadouri?.metaDataProvider;

if (wadouriMetaProvider) {
  cornerstone.metaData.addProvider(wadouriMetaProvider);
}

    const DIST = "https://unpkg.com/cornerstone-wado-image-loader@3.0.1/dist";
    cornerstoneWADOImageLoader.webWorkerManager.initialize({
      maxWebWorkers: Math.min(3, navigator.hardwareConcurrency || 2),
      startWebWorkersOnDemand: true,
      webWorkerPath: `${DIST}/cornerstoneWADOImageLoaderWebWorker.js`,
      taskConfiguration: {
        decodeTask: {
          codecsPath: `${DIST}`,
          initializeCodecsOnStartup: false,
          usePDFJS: false,
        },
      },
    });

    const el = viewportRef.current;
    if (!el) return;

    try {
      cornerstone.enable(el);
    } catch {}

  try {
  cornerstoneTools.addToolForElement(el, cornerstoneTools.LengthTool);
  cornerstoneTools.setToolPassiveForElement(el, "Length");
} catch (err) {
  console.error("Error inicializando LengthTool", err);
}

    // focus para teclas
    try {
      el.setAttribute("tabindex", "0");
      el.focus({ preventScroll: true });
    } catch {}

    // helpers para auto-scroll de instancias (touch edges)
    const startEdgeScroll = (dir) => {
      const state = edgeScrollRef.current;
      if (state.dir === dir) return;
      state.dir = dir;
      if (state.timerId) clearInterval(state.timerId);
      if (dir === 0) {
        state.timerId = null;
        return;
      }
      state.timerId = setInterval(() => {
        if (activeToolRef.current !== "navigate") return;
        stepInstance(dir);
      }, 90);
    };

    const stopEdgeScroll = () => {
      const state = edgeScrollRef.current;
      state.dir = 0;
      if (state.timerId) {
        clearInterval(state.timerId);
        state.timerId = null;
      }
    };

    // Cargar estudio inicial desde ?study=
    if (!studyIdFromUrl) {
      console.warn("Falta ?study=<StudyID>");
    } else {
      loadStudy(studyIdFromUrl);
    }

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      try {
        cornerstone.resize(el, true);
      } catch {}
    });
    ro.observe(el);

    const onWinResize = () => {
      try {
        cornerstone.resize(el, true);
      } catch {}
    };
    window.addEventListener("resize", onWinResize);

    // Navegación (solo navigate)
    const onWheel = (evt) => {
      if (activeToolRef.current !== "navigate") return;
      evt.preventDefault();
      if (wheelLockRef.current) return;
      wheelLockRef.current = true;
      const dy = evt.deltaY || 0;
      if (dy > 0) stepSeries(+1);
      else if (dy < 0) stepSeries(-1);
      setTimeout(() => (wheelLockRef.current = false), 120);
    };

    const onKey = (evt) => {
      if (activeToolRef.current !== "navigate") return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(evt.key)) {
        evt.preventDefault();
      }
      if (evt.key === "ArrowDown") stepSeries(+1);
      else if (evt.key === "ArrowUp") stepSeries(-1);
      else if (evt.key === "ArrowRight") stepInstance(+1);
      else if (evt.key === "ArrowLeft") stepInstance(-1);
    };

    // Touch scrub + edge autoscroll
    const stepPxX = 40;
    const stepPxY = 60;

    const onTouchStart = (evt) => {
      if (activeToolRef.current !== "navigate") return;
      if (!evt.touches || evt.touches.length !== 1) return;
      const t = evt.touches[0];
      touchRef.current = {
        startX: t.clientX,
        startY: t.clientY,
        axis: null,
        accX: 0,
        accY: 0,
      };
      stopEdgeScroll();
    };

    const onTouchMove = (evt) => {
      if (activeToolRef.current !== "navigate") return;
      const s = touchRef.current;
      const t = evt.touches && evt.touches[0];
      if (!t || s.startX == null || s.startY == null) return;

      let dx = t.clientX - s.startX;
      let dy = t.clientY - s.startY;

      if (!s.axis) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        s.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }

      evt.preventDefault();

      if (s.axis === "x") {
        s.accX += dx;
        while (Math.abs(s.accX) >= stepPxX) {
          if (s.accX > 0) stepInstance(+1);
          else stepInstance(-1);
          s.accX += s.accX > 0 ? -stepPxX : stepPxX;
        }
        s.startX = t.clientX;

        const rect = el.getBoundingClientRect();
        const margin = 24;
        if (t.clientX >= rect.right - margin) startEdgeScroll(+1);
        else if (t.clientX <= rect.left + margin) startEdgeScroll(-1);
        else startEdgeScroll(0);
      } else {
        s.accY += dy;
        while (Math.abs(s.accY) >= stepPxY) {
          if (s.accY > 0) stepSeries(-1);
          else stepSeries(+1);
          s.accY += s.accY > 0 ? -stepPxY : stepPxY;
        }
        s.startY = t.clientY;
        startEdgeScroll(0);
      }
    };

    const onTouchEnd = () => {
      if (activeToolRef.current !== "navigate") return;
      touchRef.current = {
        startX: null,
        startY: null,
        axis: null,
        accX: 0,
        accY: 0,
      };
      stopEdgeScroll();
    };

    // Pointer: WL/WW, Pan, Zoom
    let wlDragStart = { x: 0, y: 0 };

    const onPointerDown = (evt) => {
  const tool = activeToolRef.current;

  if (tool === "measure") {
    return;
  }

  if (tool !== "window" && tool !== "pan" && tool !== "zoom") return;

  evt.preventDefault();
  isDraggingRef.current = true;

      if (tool === "window") {
        wlDragStart = { x: evt.clientX, y: evt.clientY };
        const viewport = cornerstone.getViewport(viewportRef.current);
        if (viewport) {
          lastWlState.current = {
            wc: viewport.voi.windowCenter,
            ww: viewport.voi.windowWidth,
          };
        }
      } else if (tool === "pan") {
        const viewport = cornerstone.getViewport(viewportRef.current);
        if (!viewport) return;
        panStateRef.current = {
          startX: evt.clientX,
          startY: evt.clientY,
          baseX: viewport.translation?.x || 0,
          baseY: viewport.translation?.y || 0,
        };
      } else if (tool === "zoom") {
        const viewport = cornerstone.getViewport(viewportRef.current);
        if (!viewport) return;
        zoomStateRef.current = {
          startY: evt.clientY,
          baseScale: viewport.scale || 1,
        };
      }
    };

    const onPointerMove = (evt) => {
      if (!isDraggingRef.current) return;
      const tool = activeToolRef.current;
      if (tool !== "window" && tool !== "pan" && tool !== "zoom") return;

      evt.preventDefault();

      if (tool === "window") {
        const dx = evt.clientX - wlDragStart.x;
        const dy = evt.clientY - wlDragStart.y;
        const factor = 0.5;

        const newWW = Math.max(1, lastWlState.current.ww + dx * factor);
        const newWC = lastWlState.current.wc - dy * factor;

        const viewport = cornerstone.getViewport(viewportRef.current);
        if (viewport) {
          viewport.voi.windowWidth = newWW;
          viewport.voi.windowCenter = newWC;
          cornerstone.setViewport(viewportRef.current, viewport);
        }
      } else if (tool === "pan") {
        const { startX, startY, baseX, baseY } = panStateRef.current;
        const dx = evt.clientX - startX;
        const dy = evt.clientY - startY;

        const viewport = cornerstone.getViewport(viewportRef.current);
        if (viewport) {
          viewport.translation.x = baseX + dx;
          viewport.translation.y = baseY + dy;
          cornerstone.setViewport(viewportRef.current, viewport);
        }
      } else if (tool === "zoom") {
        const { startY, baseScale } = zoomStateRef.current;
        const dy = evt.clientY - startY;
        const factor = Math.exp(-dy * 0.01);
        const newScale = Math.max(0.1, Math.min(10, baseScale * factor));

        const viewport = cornerstone.getViewport(viewportRef.current);
        if (viewport) {
          viewport.scale = newScale;
          cornerstone.setViewport(viewportRef.current, viewport);
        }
      }
    };

    const onPointerUp = () => {
      isDraggingRef.current = false;
    };

    // Listeners
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("keydown", onKey, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    //el.addEventListener("pointerdown", onPointerDown);
    //el.addEventListener("pointermove", onPointerMove);
    //window.addEventListener("pointerup", onPointerUp);
    el.addEventListener("mousedown", onPointerDown);
    el.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);

    return () => {
      stopEdgeScroll();
      stopButtonScroll();

      try {
        ro.disconnect();
      } catch {}
      window.removeEventListener("resize", onWinResize);

      if (el) {
        el.removeEventListener("wheel", onWheel);
        el.removeEventListener("keydown", onKey);
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);

        //el.removeEventListener("pointerdown", onPointerDown);
        //el.removeEventListener("pointermove", onPointerMove);
        //window.removeEventListener("pointerup", onPointerUp);
        el.removeEventListener("mousedown", onPointerDown);
        el.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("mouseup", onPointerUp);

        try {
          cornerstone.disable(el);
        } catch {}
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudyList, studyIdFromUrl]);

useEffect(() => {
  if (isStudyList) return;

  const el = viewportRef.current;
  if (!el) return;

  try {
    if (activeTool === "measure") {
      cornerstoneTools.setToolActiveForElement(
        el,
        "Length",
        { mouseButtonMask: 1 },
        ["Mouse"]
      );
      el.style.cursor = "crosshair";
    } else {
      cornerstoneTools.setToolPassiveForElement(el, "Length");

      if (activeTool === "pan") {
        el.style.cursor = "grab";
      } else if (activeTool === "zoom") {
        el.style.cursor = "zoom-in";
      } else {
        el.style.cursor = "default";
      }
    }

    cornerstone.updateImage(el);
  } catch (err) {
    console.error("Error cambiando LengthTool", err);
  }
}, [activeTool, isStudyList]);

  // -------- Reportes demo --------
  const REPORT_COLUMNA = `ESTUDIO COLUMNA

Densidad ósea normal.
La estatura de los cuerpos vertebrales y de los espacios intervertebrales está conservada.
Hay rectificación de la lordosis lumbar fisiológica por espasmo muscular.
Pedículos, arcos posteriores y articulaciones sacroilíacas normales.

CONCLUSIÓN:
- Espasmo muscular.`;

  const REPORT_TOBILLO = `REPORTE ESTUDIO DE TOBILLO

Estructuras óseas de densidad y morfología normales, no hay fracturas.
Mortaja tibioperoneoastragalina con adecuada congruencia, espacios y superficies normales.
No hay diástasis tibioperonea.
Se aprecia aumento de tejidos blandos alrededor del maléolo externo.

Conclusión:
- Esguince de tobillo grado I`;

  const getCurrentReport = () => {
    if (!currentStudyMeta) return null;
    const desc = (currentStudyMeta.description || "").toLowerCase();
    if (desc.includes("columna")) return REPORT_COLUMNA;
    if (desc.includes("tobillo")) return REPORT_TOBILLO;
    return null;
  };

  const currentReport = getCurrentReport();

  // ✅ Render: si es lista, mostramos lista. Si no, visor.
  if (isStudyList) {
    return (
      <StudyList
        orthancBase={BASE}
        onOpenStudy={(id) => {
          window.location.href = `${window.location.pathname}?study=${encodeURIComponent(
            id
          )}`;
        }}
      />
    );
  }

  return (
    <div className="page">
      {/* Barra superior: paciente + lista de estudios + share */}
      <div className="topGroup">
        <button
          type="button"
          className="topButton"
          onClick={() => setShowPatientModal(true)}
          disabled={!patientInfo}
        >
          {patientInfo ? patientInfo.name : "Paciente sin nombre"}
        </button>

        <button
          type="button"
          className="topButton"
          onClick={() => setShowStudiesModal(true)}
          disabled={!patientStudies.length}
        >
          Lista de estudios ({patientStudies.length || 0})
        </button>

        <button
          type="button"
          className="topButton"
          onClick={() => setShowShareModal(true)}
          disabled={!currentStudyMeta}
        >
          {currentStudyMeta ? (
            <>
              {currentStudyMeta.description}
              {currentStudyMeta.date && <> · {formatDate(currentStudyMeta.date)}</>}
            </>
          ) : (
            "Sin estudio seleccionado"
          )}
        </button>


      </div>

      {/* Título por serie */}
      <h3 className="title" ref={titleRef}>
        Cargando...
      </h3>

      <div className="viewportBox">
        {/* Triángulos */}
        <button
          type="button"
          className="vp-triangle vp-triangle-top"
          {...makeTriangleHandlers("series", +1)}
          aria-label="Serie siguiente"
        />
        <button
          type="button"
          className="vp-triangle vp-triangle-bottom"
          {...makeTriangleHandlers("series", -1)}
          aria-label="Serie anterior"
        />
        <button
          type="button"
          className="vp-triangle vp-triangle-left"
          {...makeTriangleHandlers("instance", -1)}
          aria-label="Instancia anterior"
        />
        <button
          type="button"
          className="vp-triangle vp-triangle-right"
          {...makeTriangleHandlers("instance", +1)}
          aria-label="Instancia siguiente"
        />

        {/* Viewport DICOM */}
        <div
          ref={viewportRef}
          className={`viewport ${
  activeTool === "window"
    ? "mode-wl"
    : activeTool === "pan"
    ? "mode-pan"
    : activeTool === "zoom"
    ? "mode-zoom"
    : activeTool === "measure"
    ? "mode-measure"
    : ""
}`}
        />

        {/* Contador instancias */}
        <div ref={counterRef} className="vp-counter" aria-label="instance-counter">
          0/0
        </div>

        {/* Contador series */}
        <div
          ref={seriesCounterRef}
          className="vp-series-counter"
          aria-label="series-counter"
        >
          0/0
        </div>
      </div>

      {/* Toolbar */}
      <div className="viewportToolbar" role="toolbar" aria-label="Herramientas del visor">
        <button
          type="button"
          className={`toolButton ${activeTool === "navigate" ? "active" : ""}`}
          aria-pressed={activeTool === "navigate"}
          title="Navegar"
          onClick={() => setActiveTool("navigate")}
        >
          <svg viewBox="0 0 24 24" className="toolIcon" aria-hidden="true">
            <path d="M12 3l2.5 4h-5L12 3zM12 21l-2.5-4h5L12 21zM3 12l4-2.5v5L3 12zM21 12l-4 2.5v-5L21 12z" />
          </svg>
        </button>

        <button
          type="button"
          className={`toolButton ${activeTool === "window" ? "active" : ""}`}
          aria-pressed={activeTool === "window"}
          title="Brillo/Contraste"
          onClick={() => setActiveTool("window")}
        >
          <svg viewBox="0 0 24 24" className="toolIcon" aria-hidden="true">
            <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 2v14a7 7 0 010-14z" />
          </svg>
        </button>

        <button
          type="button"
          className={`toolButton ${activeTool === "pan" ? "active" : ""}`}
          aria-pressed={activeTool === "pan"}
          title="Pan"
          onClick={() => setActiveTool("pan")}
        >
          <svg viewBox="0 0 24 24" className="toolIcon" aria-hidden="true">
            <path d="M12 3l2 3h-1v4h-2V6h-1l2-3zm0 18l-2-3h1v-4h2v4h1l-2 3zM3 12l3-2v1h4v2H6v1l-3-2zm18 0l-3 2v-1h-4v-2h4v-1l3 2z" />
          </svg>
        </button>

        <button
          type="button"
          className={`toolButton ${activeTool === "zoom" ? "active" : ""}`}
          aria-pressed={activeTool === "zoom"}
          title="Zoom"
          onClick={() => setActiveTool("zoom")}
        >
        
          <svg viewBox="0 0 24 24" className="toolIcon" aria-hidden="true">
            <path d="M10 3a7 7 0 015.657 11.313l3.515 3.515-1.414 1.414-3.515-3.515A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z" />
          </svg>
        </button>

<button
  type="button"
  className={`toolButton ${activeTool === "measure" ? "active" : ""}`}
  aria-pressed={activeTool === "measure"}
  title="Medir"
  onClick={() => setActiveTool("measure")}
>
  <svg viewBox="0 0 24 24" className="toolIcon" aria-hidden="true">
    <path d="M21.71 11.29l-9-9a1 1 0 00-1.42 0l-9 9a1 1 0 000 1.42l9 9a1 1 0 001.42 0l9-9a1 1 0 000-1.42zM12 20.17L3.83 12 6 9.83l1.5 1.5 1.41-1.41-1.5-1.5L9 6.83l1.5 1.5 1.41-1.41-1.5-1.5L12 3.83 20.17 12 12 20.17z"/>
  </svg>
</button>

      </div>

      {/* Botón reporte */}
      <div className="bottomActions">
        <button
          type="button"
          className="topButton"
          disabled={!currentStudyMeta}
          onClick={() => {
            setShowReport(true);
            setTimeout(() => {
              window.scrollTo({
                top: document.body.scrollHeight,
                behavior: "smooth",
              });
            }, 0);
          }}
        >
          Ver reporte del estudio
        </button>
      </div>

      {/* Modal paciente */}
      {showPatientModal && patientInfo && (
        <div className="modalOverlay" onClick={() => setShowPatientModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h4>Datos del paciente</h4>
            <p>
              <strong>Nombre:</strong> {patientInfo.name}
            </p>
            {patientInfo.patientId && (
              <p>
                <strong>ID:</strong> {patientInfo.patientId}
              </p>
            )}
            {patientInfo.birthDate && (
              <p>
                <strong>Fecha de nacimiento:</strong> {formatDate(patientInfo.birthDate)}
              </p>
            )}
            {patientInfo.sex && (
              <p>
                <strong>Sexo:</strong> {patientInfo.sex}
              </p>
            )}
            <button
              type="button"
              className="modalCloseBtn"
              onClick={() => setShowPatientModal(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Modal lista de estudios del paciente */}
      {showStudiesModal && (
        <div className="modalOverlay" onClick={() => setShowStudiesModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <h4>Estudios del paciente</h4>
            <ul className="studyList">
              {patientStudies.map((st) => (
                <li key={st.id}>
                  <button
                    type="button"
                    className="studyItemBtn"
                    onClick={() => {
                      setShowStudiesModal(false);
                      loadStudy(st.id);
                      // y actualiza URL para que el link sea estable
                      window.history.replaceState(
                        null,
                        "",
                        `${window.location.pathname}?study=${encodeURIComponent(st.id)}`
                      );
                    }}
                  >
                    <span className="studyItemTitle">{st.description}</span>
                    <span className="studyItemMeta">
                      {st.modality && `${st.modality} · `}
                      {st.date && formatDate(st.date)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="modalCloseBtn"
              onClick={() => setShowStudiesModal(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Modal compartir */}
      {showShareModal && currentStudyMeta && (
        <div className="modalOverlay" onClick={() => setShowShareModal(false)}>
          <div className="modalCard" onClick={(e) => e.stopPropagation()}>
            <button
              className="downloadIconBtn"
              onClick={() => {
                const url = `${ORTHANC_DOWNLOAD_BASE}/studies/${currentStudyMeta.id}/archive`;
                window.open(url, "_blank");
              }}
              title="Descargar estudio"
            >
              <svg viewBox="0 0 24 24" className="downloadIcon">
                <path d="M5 20h14v-2H5v2z" />
                <path d="M11 4v9.17L8.41 10.6 7 12l5 5 5-5-1.41-1.4L13 13.17V4h-2z" />
              </svg>
            </button>

            <h4>Compartir estudio</h4>

            <div className="qrContainer">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  window.location.href
                )}`}
                alt="QR del estudio"
                className="qrImage"
              />
            </div>

            <div className="shareButtons">
              <a
                href={`mailto:?subject=Estudio DICOM&body=${encodeURIComponent(
                  window.location.href
                )}`}
                className="shareBtn"
              >
                Enviar por correo
              </a>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(window.location.href)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shareBtn"
              >
                Compartir por WhatsApp
              </a>
            </div>

            <button
              type="button"
              className="modalCloseBtn"
              onClick={() => setShowShareModal(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Reporte demo */}
      {showReport && (
        <div className="reportBox">
          <h4>Reporte del estudio</h4>
          {currentReport ? (
            <pre className="reportText">{currentReport}</pre>
          ) : (
            <p className="reportEmpty">
              No hay reporte disponible para este estudio en el demo.
            </p>
          )}
        </div>
      )}

      <p className="footnote">
        ↑/↓ serie · ←/→ instancia · Swipe vertical = serie · Swipe horizontal = instancia
        (scrub continuo) · Hold en bordes = auto-scroll
      </p>
    </div>
  );
}
