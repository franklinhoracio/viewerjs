import React, { useMemo, useState } from "react";

export default function ReportFormModal({
  open,
  onClose,
  onGenerate,
  initialData,
  loading,
}) {
  const [form, setForm] = useState(initialData);

  React.useEffect(() => {
    if (open) setForm(initialData);
  }, [open, initialData]);

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const disabled = useMemo(() => {
    return !form.patientName || !form.indication || !form.technique || !form.findings || !form.conclusion;
  }, [form]);

  if (!open) return null;

  return (
    <div className="sl-modalBackdrop" onClick={onClose}>
      <div className="sl-modal sl-reportModal" onClick={(e) => e.stopPropagation()}>
        <div className="sl-modalTitle">Generar reporte PDF</div>

        <div className="sl-reportGrid">
          <label>
            <span>Nombre</span>
            <input value={form.patientName} onChange={(e) => update("patientName", e.target.value)} />
          </label>

          <label>
            <span>Expediente</span>
            <input value={form.patientId} onChange={(e) => update("patientId", e.target.value)} />
          </label>

          <label>
            <span>Documento</span>
            <input value={form.documentNumber} onChange={(e) => update("documentNumber", e.target.value)} />
          </label>

          <label>
            <span>Edad</span>
            <input value={form.age} onChange={(e) => update("age", e.target.value)} />
          </label>

          <label>
            <span>Fecha de nacimiento</span>
            <input value={form.birthDate} onChange={(e) => update("birthDate", e.target.value)} placeholder="dd/mm/yyyy" />
          </label>

          <label>
            <span>Fecha adquisición</span>
            <input value={form.acquisitionDate} onChange={(e) => update("acquisitionDate", e.target.value)} placeholder="dd/mm/yyyy" />
          </label>

          <label>
            <span>Referente</span>
            <input value={form.referrer} onChange={(e) => update("referrer", e.target.value)} />
          </label>

          <label>
            <span>Sede</span>
            <input value={form.site} onChange={(e) => update("site", e.target.value)} />
          </label>

          <label>
            <span>Documento clínico</span>
            <input value={form.studyCode} onChange={(e) => update("studyCode", e.target.value)} />
          </label>

          <label>
            <span>Fecha reporte</span>
            <input value={form.reportDate} onChange={(e) => update("reportDate", e.target.value)} placeholder="dd/mm/yyyy" />
          </label>

          <label>
            <span>Dra./Dr.</span>
            <input value={form.doctorName} onChange={(e) => update("doctorName", e.target.value)} />
          </label>

          <label>
            <span>J.V.P.M.</span>
            <input value={form.jvpm} onChange={(e) => update("jvpm", e.target.value)} />
          </label>
        </div>

        <label className="sl-reportBlock">
          <span>Indicación</span>
          <textarea rows={3} value={form.indication} onChange={(e) => update("indication", e.target.value)} />
        </label>

        <label className="sl-reportBlock">
          <span>Técnica</span>
          <textarea rows={4} value={form.technique} onChange={(e) => update("technique", e.target.value)} />
        </label>

        <label className="sl-reportBlock">
          <span>Hallazgos</span>
          <textarea rows={8} value={form.findings} onChange={(e) => update("findings", e.target.value)} />
        </label>

        <label className="sl-reportBlock">
          <span>Conclusión</span>
          <textarea rows={4} value={form.conclusion} onChange={(e) => update("conclusion", e.target.value)} />
        </label>

        <div className="sl-modalActions">
          <button className="sl-btn" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
  className="sl-btn sl-btnPrimary"
  onClick={() => onGenerate(form)}
  disabled={disabled || loading}
>
  {loading ? "Generando..." : "Generar y guardar PDF"}
</button>
        </div>
      </div>
    </div>
  );
}