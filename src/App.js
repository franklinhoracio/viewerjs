// src/App.js
import React, { useEffect, useRef } from "react";
import dicomParser from "dicom-parser";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import { cornerstone } from "./cornerstoneConfig";
import "./App.css";

const BASE = "";

const wadouriFromInstanceId = (id) =>
  `wadouri:${BASE}/instances/${id}/file?contentType=application/dicom`;

const studySeriesExpanded  = (studyId) => `${BASE}/studies/${studyId}/series?expand=true`;
const seriesInstancesEx    = (seriesId) => `${BASE}/series/${seriesId}/instances?expand=true`;

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
    const zA = Array.isArray(A.ImagePositionPatient) && A.ImagePositionPatient.length >= 3 ? num(A.ImagePositionPatient[2]) : null;
    const zB = Array.isArray(B.ImagePositionPatient) && B.ImagePositionPatient.length >= 3 ? num(B.ImagePositionPatient[2]) : null;
    if (zA != null && zB != null && zA !== zB) return zA - zB;
    const sA = safeLower(A.SOPInstanceUID);
    const sB = safeLower(B.SOPInstanceUID);
    if (sA && sB && sA !== sB) return sA < sB ? -1 : 1;
    return a.ID < b.ID ? -1 : 1;
  });

export default function App() {
  const viewportRef = useRef(null);

  // Navegación
  const seriesListRef = useRef([]); // [{ seriesId, instances: [{ID, MainDicomTags...}, ...] }]
  const sIdxRef = useRef(0);
  const iIdxRef = useRef(0);

  // Touch state para scrub
  const touchRef = useRef({
    startX: null,
    startY: null,
    axis: null,         // "x" | "y"
    accX: 0,            // acumulador horizontal en px
    accY: 0             // acumulador vertical en px
  });

  const wheelLockRef = useRef(false);

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const seriesCount = () => seriesListRef.current.length;
  const instCount = () => seriesListRef.current[sIdxRef.current]?.instances.length || 0;

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

  useEffect(() => {
    // Cornerstone bridge
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
    cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

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
    try { cornerstone.enable(el); } catch {}
    try { el.setAttribute("tabindex", "0"); el.focus({ preventScroll: true }); } catch {}

    // Cargar estudio
    const studyId = new URLSearchParams(window.location.search).get("study");
    const boot = async () => {
      if (!studyId) return console.warn("Falta ?study=<StudyID>");
      try {
        const sResp = await fetch(studySeriesExpanded(studyId));
        if (!sResp.ok) throw new Error(`Series HTTP ${sResp.status}`);
        const seriesExp = await sResp.json();
        const orderedSeries = sortSeries(seriesExp);

        const seriesWithInstances = [];
        for (const s of orderedSeries) {
          const r = await fetch(seriesInstancesEx(s.ID));
          if (!r.ok) continue;
          const instExp = await r.json();
          const orderedInst = sortInstances(instExp);
          if (orderedInst.length) {
            seriesWithInstances.push({ seriesId: s.ID, instances: orderedInst });
          }
        }

        if (!seriesWithInstances.length) return console.warn("Sin instancias visibles");
        seriesListRef.current = seriesWithInstances;
        goTo(0, 0);
      } catch (e) {
        console.error("boot error", e);
      }
    };
    boot();

    // Resize
    const ro = new ResizeObserver(() => { try { cornerstone.resize(el, true); } catch {} });
    ro.observe(el);
    const onWinResize = () => { try { cornerstone.resize(el, true); } catch {} };
    window.addEventListener("resize", onWinResize);

    // Rueda = series
    const onWheel = (evt) => {
      evt.preventDefault();
      if (wheelLockRef.current) return;
      wheelLockRef.current = true;
      const dy = evt.deltaY || 0;
      if (dy > 0) stepSeries(+1);
      else if (dy < 0) stepSeries(-1);
      setTimeout(() => (wheelLockRef.current = false), 120);
    };

    // Teclas: ↑↓ serie, ←→ instancia
    const onKey = (evt) => {
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(evt.key)) evt.preventDefault();
      if (evt.key === "ArrowDown") stepSeries(+1);
      else if (evt.key === "ArrowUp") stepSeries(-1);
      else if (evt.key === "ArrowRight") stepInstance(+1);
      else if (evt.key === "ArrowLeft") stepInstance(-1);
    };

    // ---------- Touch: SCRUB continuo ----------
    // Reglas:
    //  - Eje dominante decide modo: horizontal = instancias, vertical = series
    //  - Mientras mueves el dedo, cada 'stepPx' se avanza/retrocede una unidad
    const stepPxX = 40; // píxeles por paso horizontal
    const stepPxY = 60; // píxeles por paso vertical

    const onTouchStart = (evt) => {
      if (!evt.touches || evt.touches.length !== 1) return;
      const t = evt.touches[0];
      touchRef.current = { startX: t.clientX, startY: t.clientY, axis: null, accX: 0, accY: 0 };
    };

    const onTouchMove = (evt) => {
      const s = touchRef.current;
      const t = evt.touches && evt.touches[0];
      if (!t || s.startX == null || s.startY == null) return;

      let dx = t.clientX - s.startX;
      let dy = t.clientY - s.startY;

      // decidir eje
      if (!s.axis) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return; // aguanta un poco de ruido
        s.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }

      // Tomamos control del gesto
      evt.preventDefault();

      if (s.axis === "x") {
        // scrub de instancias
        s.accX += dx;
        // cada stepPxX avanzamos una instancia
        while (Math.abs(s.accX) >= stepPxX) {
          if (s.accX > 0) stepInstance(-1); // mover hacia la derecha -> instancia anterior
          else stepInstance(+1);           // hacia la izquierda -> siguiente
          s.accX += s.accX > 0 ? -stepPxX : stepPxX;
        }
        // anclar nuevo origen para suavizar
        s.startX = t.clientX;
      } else {
        // scrub de series
        s.accY += dy;
        while (Math.abs(s.accY) >= stepPxY) {
          if (s.accY > 0) stepSeries(-1);  // abajo -> serie anterior
          else stepSeries(+1);             // arriba -> serie siguiente
          s.accY += s.accY > 0 ? -stepPxY : stepPxY;
        }
        s.startY = t.clientY;
      }
    };

    const onTouchEnd = () => {
      // reset
      touchRef.current = { startX: null, startY: null, axis: null, accX: 0, accY: 0 };
    };
    // -------------------------------------------

    // Listeners en el viewport
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("keydown", onKey, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false }); // importante: passive false
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener("resize", onWinResize);
      if (el) {
        el.removeEventListener("wheel", onWheel);
        el.removeEventListener("keydown", onKey);
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        try { cornerstone.disable(el); } catch {}
      }
    };
  }, []);

  return (
    <div className="page">
      <h3>Viewer multi-serie / multi-instancia</h3>
      <div className="viewportBox">
        <div ref={viewportRef} className="viewport" />
      </div>
      <p className="footnote">
        ↑/↓ serie · ←/→ instancia · Swipe vertical = serie · Swipe horizontal = instancia (scrub continuo)
      </p>
    </div>
  );
}
