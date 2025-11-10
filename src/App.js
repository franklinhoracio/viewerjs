// src/App.js
import React, { useEffect, useRef } from "react";
import dicomParser from "dicom-parser";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import { cornerstone } from "./cornerstoneConfig";
import "./App.css";

// Instancias (1 por serie)
const INSTANCE_IDS = [
  "a3d21ade-9d191c4a-7fbd3562-d7cc400c-fcbfbd38",
  "122b1f13-47c9bd41-2aaaad2b-7e56bff6-b3ff43da",
  // agrega más si quieres
];

const BASE = "";
const wadouriFromInstanceId = (id) =>
  `wadouri:${BASE}/instances/${id}/file?contentType=application/dicom`;

export default function App() {
  const v1 = useRef(null);
  const v2 = useRef(null);
  const v3 = useRef(null);

  useEffect(() => {
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

    const els = [v1.current, v2.current, v3.current].filter(Boolean);
    els.forEach((el) => { try { cornerstone.enable(el); } catch {} });

    (async () => {
      for (let i = 0; i < els.length; i++) {
        const id = INSTANCE_IDS[i];
        if (!id) continue;
        const imageId = wadouriFromInstanceId(id);
        try {
          const image = await cornerstone.loadAndCacheImage(imageId);
          cornerstone.displayImage(els[i], image);
        } catch (e) {
          console.error("Fallo al cargar", imageId, e);
        }
      }
    })();

    const ro = new ResizeObserver(() => {
      els.forEach((el) => { try { cornerstone.resize(el, true); } catch {} });
    });
    els.forEach((el) => ro.observe(el));

    const onWinResize = () => {
      els.forEach((el) => { try { cornerstone.resize(el, true); } catch {} });
    };
    window.addEventListener("resize", onWinResize);

    return () => {
      try { ro.disconnect(); } catch {}
      window.removeEventListener("resize", onWinResize);
      els.forEach((el) => { try { cornerstone.disable(el); } catch {} });
    };
  }, []);

  return (
    <div className="page">
      <h3>Viewer vertical (responsive)</h3>

      <div className="viewport-stack">
        <div className="viewportBox">
          <div ref={v1} className="viewport" />
        </div>
        <div className="viewportBox">
          <div ref={v2} className="viewport" />
        </div>
        <div className="viewportBox">
          <div ref={v3} className="viewport" />
        </div>
      </div>

      <p className="footnote">
        Fuente: <code>wadouri:/instances/&lt;id&gt;/file?contentType=application/dicom</code> · Códecs <code>unpkg</code>
      </p>
    </div>
  );
}
