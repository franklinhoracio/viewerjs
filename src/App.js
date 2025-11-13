// src/App.js
import React, { useEffect, useRef, useState } from "react";
import dicomParser from "dicom-parser";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import { cornerstone } from "./cornerstoneConfig";
import "./App.css";

const BASE = "";

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

export default function App() {
  const viewportRef = useRef(null);
  const titleRef = useRef(null);
  const counterRef = useRef(null);

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
    dir: 0,        // -1 izquierda, +1 derecha
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
    // Bridge
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
    try {
      cornerstone.enable(el);
    } catch {}

    // viewport focus para teclas
    try {
      el.setAttribute("tabindex", "0");
      el.focus({ preventScroll: true });
    } catch {}

    // helpers para auto-scroll de instancias
    const startEdgeScroll = (dir) => {
      const state = edgeScrollRef.current;
      if (state.dir === dir) return; // ya está
      state.dir = dir;
      if (state.timerId) clearInterval(state.timerId);
      if (dir === 0) {
        state.timerId = null;
        return;
      }
      state.timerId = setInterval(() => {
        // auto-avance mientras siga en navigate
        if (activeToolRef.current !== "navigate") return;
        stepInstance(dir);
      }, 90); // velocidad del carrusel
    };

    const stopEdgeScroll = () => {
      const state = edgeScrollRef.current;
      state.dir = 0;
      if (state.timerId) {
        clearInterval(state.timerId);
        state.timerId = null;
      }
    };

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
            const desc =
              s?.MainDicomTags?.SeriesDescription ||
              s?.MainDicomTags?.ProtocolName ||
              `Serie ${seriesWithInstances.length + 1}`;
            seriesWithInstances.push({
              seriesId: s.ID,
              description: desc,
              instances: orderedInst,
            });
          }
        }

        if (!seriesWithInstances.length)
          return console.warn("Sin instancias visibles");
        seriesListRef.current = seriesWithInstances;
        goTo(0, 0);
      } catch (e) {
        console.error("boot error", e);
      }
    };
    boot();

    // Resize
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

    // Navegación (solo en modo navigate)
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
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(
          evt.key
        )
      )
        evt.preventDefault();
      if (evt.key === "ArrowDown") stepSeries(+1);
      else if (evt.key === "ArrowUp") stepSeries(-1);
      else if (evt.key === "ArrowRight") stepInstance(+1);
      else if (evt.key === "ArrowLeft") stepInstance(-1);
    };

    // Touch scrub navegación + auto-scroll en bordes
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
        // Sentido corregido:
        // derecha (dx > 0) -> siguiente instancia
        // izquierda (dx < 0) -> instancia anterior
        s.accX += dx;
        while (Math.abs(s.accX) >= stepPxX) {
          if (s.accX > 0) stepInstance(+1);
          else stepInstance(-1);
          s.accX += s.accX > 0 ? -stepPxX : stepPxX;
        }
        s.startX = t.clientX;

        // --- auto-scroll en bordes ---
        const rect = el.getBoundingClientRect();
        const margin = 24; // px desde el borde
        if (t.clientX >= rect.right - margin) {
          // borde derecho -> avanzar continuamente
          startEdgeScroll(+1);
        } else if (t.clientX <= rect.left + margin) {
          // borde izquierdo -> retroceder continuamente
          startEdgeScroll(-1);
        } else {
          // dedo volvió a zona media
          startEdgeScroll(0);
        }
      } else {
        // Eje vertical = cambia series
        s.accY += dy;
        while (Math.abs(s.accY) >= stepPxY) {
          if (s.accY > 0) stepSeries(-1);
          else stepSeries(+1);
          s.accY += s.accY > 0 ? -stepPxY : stepPxY;
        }
        s.startY = t.clientY;
        // si estamos en eje Y, aseguramos parar auto-scroll
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

    // Pointer: WL/WW, Pan, Zoom (según tool)
    let wlDragStart = { x: 0, y: 0 };

    const onPointerDown = (evt) => {
      const tool = activeToolRef.current;
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
        // dy hacia arriba -> zoom in, hacia abajo -> zoom out
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

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      // apagar auto-scroll si quedaba algo vivo
      const st = edgeScrollRef.current;
      if (st.timerId) clearInterval(st.timerId);
      edgeScrollRef.current = { dir: 0, timerId: null };

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

        el.removeEventListener("pointerdown", onPointerDown);
        el.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);

        try {
          cornerstone.disable(el);
        } catch {}
      }
    };
  }, []);

  return (
    <div className="page">
      <h3 className="title" ref={titleRef}>
        Cargando...
      </h3>

      <div className="viewportBox">
        <div
          ref={viewportRef}
          className={`viewport ${
            activeTool === "window"
              ? "mode-wl"
              : activeTool === "pan"
              ? "mode-pan"
              : activeTool === "zoom"
              ? "mode-zoom"
              : ""
          }`}
        />
        <div
          ref={counterRef}
          className="vp-counter"
          aria-label="instance-counter"
        >
          0/0
        </div>
      </div>

      {/* Toolbar */}
      <div
        className="viewportToolbar"
        role="toolbar"
        aria-label="Herramientas del visor"
      >
        {/* 1. Navegar */}
        <button
          type="button"
          className={`toolButton ${activeTool === "navigate" ? "active" : ""}`}
          aria-pressed={activeTool === "navigate"}
          title="Navegar (series e instancias)"
          onClick={() => setActiveTool("navigate")}
        >
          <svg viewBox="0 0 24 24" className="toolIcon" aria-hidden="true">
            <path d="M12 3l2.5 4h-5L12 3zM12 21l-2.5-4h5L12 21zM3 12l4-2.5v5L3 12zM21 12l-4 2.5v-5L21 12z" />
          </svg>
        </button>

        {/* 2. Window/Level */}
        <button
          type="button"
          className={`toolButton ${activeTool === "window" ? "active" : ""}`}
          aria-pressed={activeTool === "window"}
          title="Brillo/Contraste (WL/WW)"
          onClick={() => setActiveTool("window")}
        >
          <svg viewBox="0 0 24 24" className="toolIcon" aria-hidden="true">
            {/* círculo con mitad sombreada */}
            <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 2v14a7 7 0 010-14z" />
          </svg>
        </button>

        {/* 3. Pan */}
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

        {/* 4. Zoom */}
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
      </div>

      <p className="footnote">
        ↑/↓ serie · ←/→ instancia · Swipe vertical = serie · Swipe horizontal =
        instancia (scrub continuo) · Hold en bordes = auto-scroll
      </p>
    </div>
  );
}
