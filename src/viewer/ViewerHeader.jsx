import React from "react";

export default function ViewerHeader({
  logoSrc,
  currentStudyMeta,
  patientInfo,
  patientStudies,
  formatDate,
  setShowPatientModal,
  setShowStudiesModal,
  setShowShareModal,
}) {
  return (
    <>
      <div className="viewerHero">
        <img src={logoSrc} alt="Logo" className="viewerHeroLogo" />

        <div className="viewerHeroText">
          <h1 className="viewerHeroTitle">Entrega de resultados</h1>

          <div className="viewerHeroBadge">
            {currentStudyMeta ? (
              <>
                {currentStudyMeta.description}
                {currentStudyMeta.date && <> · {formatDate(currentStudyMeta.date)}</>}
              </>
            ) : (
              "Cargando estudio"
            )}
          </div>
        </div>
      </div>

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
          Compartir estudio
        </button>
      </div>
    </>
  );
}
