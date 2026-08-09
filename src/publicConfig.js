export async function loadPublicConfig() {
  try {
    const resp = await fetch("/config.json", { cache: "no-store" });

    if (!resp.ok) {
      throw new Error("No se pudo cargar config.json");
    }

    return await resp.json();
  } catch {
    return {
      whatsappNumber: "50372000000",
      whatsappLabel: "+50372000000",
    };
  }
}