// src/App.js
import React, { useEffect, useRef } from "react";
import dicomParser from "dicom-parser";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import { cornerstone } from "./cornerstoneConfig";
import "./App.css";

// Instancias reales (1 por serie) del estudio que pegaste
const INSTANCE_IDS = [
  "a3d21ade-9d191c4a-7fbd3562-d7cc400c-fcbfbd38", // Serie 1, Modality DX
  "122b1f13-47c9bd41-2aaaad2b-7e56bff6-b3ff43da"  // Serie 2, Modality DX
];

// Usamos rutas relativas para que pasen por el proxy del package.json
const BASE = ""; // <- importante que quede vacío
const wadouriFromInstanceId = (id) =>
  `wadouri:${BASE}/instances/${id}/file?contentType=application/dicom`;

export default function App() {
  const v1 = useRef(null);
  const v2 = useRef(null);
  const v3 = useRef(null);

  useEffect(() => {
    // Cableado base
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
    cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

    // Web worker + CÓDECS (JPEG-LS/JPEG2000), sin esto DX suele quedar negro
    const DIST = "https://unpkg.com/cornerstone-wado-image-loader@3.0.1/dist";
    cornerstoneWADOImageLoader.webWorkerManager.initialize({
      maxWebWorkers: Math.min(3, navigator.hardwareConcurrency || 2),
      startWebWorkersOnDemand: true,
      webWorkerPath: `${DIST}/cornerstoneWADOImageLoaderWebWorker.js`,
      taskConfiguration: {
        decodeTask: {
          codecsPath: `${DIST}`,
          initializeCodecsOnStartup: false,
          usePDFJS: false
        }
      }
    });

    const els = [v1.current, v2.current, v3.current];
    els.forEach((el) => { try { cornerstone.enable(el); } catch {} });

    (async () => {
      for (let i = 0; i < els.length; i++) {
        const id = INSTANCE_IDS[i];
        if (!id) continue;
        const imageId = wadouriFromInstanceId(id);
        try {
          console.log("Cargando:", imageId);
          const image = await cornerstone.loadAndCacheImage(imageId);
          cornerstone.displayImage(els[i], image);
        } catch (e) {
          console.error("Fallo al cargar", imageId, e);
        }
      }
    })();

    return () => { els.forEach((el) => { try { cornerstone.disable(el); } catch {} }); };
  }, []);

  return (
    <div style={{ padding: 12 }}>
      <h3>Viewer simple: 3 imágenes del estudio fijo (con códecs)</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div ref={v1} className="viewport" style={{ height: 420, background: "black" }} />
        <div ref={v2} className="viewport" style={{ height: 420, background: "black" }} />
        <div ref={v3} className="viewport" style={{ height: 420, background: "black" }} />
      </div>
      <p style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
        Fuente: <code>wadouri:/instances/&lt;id&gt;/file?contentType=application/dicom</code> via proxy · Códecs desde <code>unpkg</code>
      </p>
    </div>
  );
}
