import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 34,
    fontSize: 11,
    color: "#222",
    fontFamily: "Helvetica",
    lineHeight: 1.35,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    alignItems: "flex-start",
  },

  brandBlock: {
    width: "48%",
  },

  brandLogo: {
    width: 170,
    height: 62,
    objectFit: "contain",
    marginBottom: 4,
  },

  brandSubtitle: {
    fontSize: 9,
    color: "#555",
    letterSpacing: 1.2,
  },

  contactBlock: {
    width: "38%",
    alignItems: "flex-end",
    textAlign: "right",
    fontSize: 10,
    color: "#5d7f7b",
    lineHeight: 1.45,
  },

  infoGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 18,
  },

  infoCol: {
    width: "48%",
  },

  infoRow: {
    flexDirection: "row",
    marginBottom: 5,
  },

  label: {
    width: 120,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },

  value: {
    flex: 1,
  },

  section: {
    marginTop: 8,
    marginBottom: 10,
  },

  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginBottom: 4,
  },

  paragraph: {
    marginBottom: 4,
    textAlign: "justify",
  },

  footer: {
    marginTop: 26,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },

  footerLeft: {
    width: "22%",
    fontSize: 10,
  },

  footerCenter: {
    width: "28%",
    alignItems: "center",
  },

  signatureImg: {
    width: 110,
    height: 70,
    objectFit: "contain",
    marginBottom: 4,
  },

  stampImg: {
    width: 105,
    height: 70,
    objectFit: "contain",
    marginTop: -10,
  },

  footerRight: {
    width: "36%",
    alignItems: "flex-start",
    fontSize: 10,
    lineHeight: 1.55,
  },

  doctorName: {
    fontFamily: "Helvetica-Bold",
  },
});

const safe = (v) => String(v || "").trim();

export default function ReportPdfDocument({ data }) {
  const assetBase = window.location.origin;
const logoSrc = `${assetBase}/logo.png`;
const signatureSrc = data.signatureUrl
  ? `${assetBase}${data.signatureUrl.startsWith("/") ? "" : "/"}${data.signatureUrl}`
  : null;
const stampSrc = data.stampUrl
  ? `${assetBase}${data.stampUrl.startsWith("/") ? "" : "/"}${data.stampUrl}`
  : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Image src={logoSrc} style={styles.brandLogo} />
            <Text style={styles.brandSubtitle}>DIAGNÓSTICO POR IMÁGENES</Text>
          </View>

          <View style={styles.contactBlock}>
            <Text>95 ave nte y calle El Mirador,</Text>
            <Text>#629, Col. Escalón</Text>
            <Text>San Salvador, El Salvador</Text>
            <Text>asistente@clinicaangelessv.com</Text>
            <Text>+503 2508 9500</Text>
            <Text>+503 7215 0906</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <View style={styles.infoCol}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Nombre:</Text>
              <Text style={styles.value}>{safe(data.patientName)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Documento:</Text>
              <Text style={styles.value}>{safe(data.documentNumber)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Edad:</Text>
              <Text style={styles.value}>{safe(data.age)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Fecha nacimiento:</Text>
              <Text style={styles.value}>{safe(data.birthDate)}</Text>
            </View>
          </View>

          <View style={styles.infoCol}>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Expediente:</Text>
              <Text style={styles.value}>{safe(data.patientId)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Fecha adquisición:</Text>
              <Text style={styles.value}>{safe(data.acquisitionDate)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Referente:</Text>
              <Text style={styles.value}>{safe(data.referrer)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Sede:</Text>
              <Text style={styles.value}>{safe(data.site)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Indicación:</Text>
          <Text style={styles.paragraph}>{safe(data.indication)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Técnica:</Text>
          <Text style={styles.paragraph}>{safe(data.technique)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hallazgos:</Text>
          {safe(data.findings)
            .split("\n")
            .filter(Boolean)
            .map((line, idx) => (
              <Text key={idx} style={styles.paragraph}>
                {line}
              </Text>
            ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conclusión: hallazgos compatibles con:</Text>
          {safe(data.conclusion)
            .split("\n")
            .filter(Boolean)
            .map((line, idx) => (
              <Text key={idx} style={styles.paragraph}>
                {line}
              </Text>
            ))}
        </View>

        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text>{safe(data.reportDate)}</Text>
          </View>

          <View style={styles.footerCenter}>
            {signatureSrc ? <Image src={signatureSrc} style={styles.signatureImg} /> : null}
            {stampSrc ? <Image src={stampSrc} style={styles.stampImg} /> : null}
          </View>

          <View style={styles.footerRight}>
            <Text style={styles.doctorName}>{safe(data.doctorName)}</Text>
            <Text>{safe(data.doctorSpecialty || "Médico Radiólogo")}</Text>
            <Text>J.V.P.M.: {safe(data.jvpm)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}