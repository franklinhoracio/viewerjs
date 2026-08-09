import React from "react";

export default function ViewerToolbar({ activeTool, setActiveTool }) {
  return (
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
          <path d="M7.5 11.2V6.8a1.15 1.15 0 0 1 2.3 0v4.1h.7V5.4a1.15 1.15 0 0 1 2.3 0v5.5h.7V6a1.15 1.15 0 0 1 2.3 0v4.9h.7V7.4a1.15 1.15 0 0 1 2.3 0v6.1c0 .9-.17 1.76-.5 2.56l-.37.9A4.8 4.8 0 0 1 13.8 20h-2.3a4.5 4.5 0 0 1-3.6-1.8l-3.2-4.25a1.2 1.2 0 0 1 1.82-1.55l1.18 1.2V11.2z" />
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
          <path d="M21.71 11.29l-9-9a1 1 0 00-1.42 0l-9 9a1 1 0 000 1.42l9 9a1 1 0 001.42 0l9-9a1 1 0 000-1.42zM12 20.17L3.83 12 6 9.83l1.5 1.5 1.41-1.41-1.5-1.5L9 6.83l1.5 1.5 1.41-1.41-1.5-1.5L12 3.83 20.17 12 12 20.17z" />
        </svg>
      </button>
    </div>
  );
}
