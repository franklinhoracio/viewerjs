// src/cornerstoneConfig.js
import * as cornerstone from "cornerstone-core";
import * as cornerstoneMath from "cornerstone-math";
import * as cornerstoneTools from "cornerstone-tools";
import Hammer from "hammerjs";

// ===== Configuración obligatoria de Tools =====
cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
cornerstoneTools.external.Hammer = Hammer;

// Inicializa las herramientas
cornerstoneTools.init({
  showSVGCursors: true,
});

// Exporta cornerstone y tools para usarlos en otros componentes
export { cornerstone, cornerstoneTools };
