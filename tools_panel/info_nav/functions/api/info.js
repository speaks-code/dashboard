/**
 * Cloudflare Pages Function
 * Ruta: /api/info
 *
 * Devuelve la IP real del visitante y datos geográficos
 * que Cloudflare conoce desde el borde de su red.
 *
 * El objeto `request.cf` contiene los datos de geolocalización
 * que Cloudflare calcula según la IP de origen.
 */

export async function onRequestGet(context) {
  const { request } = context;
  const cf = request.cf || {};

  // La IP real viene en la cabecera CF-Connecting-IP
  // request.headers.get('CF-Connecting-IP') es la forma fiable.
  // Fallback a 'X-Forwarded-For' por si acaso.
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "desconocida";

  // Datos que expone Cloudflare en request.cf
  // (disponibles tanto en plan gratuito como de pago)
  const data = {
    ip,
    country: cf.country || "desconocido",
    city: cf.city || "desconocida",
    region: cf.region || "desconocida",
    regionCode: cf.regionCode || "desconocido",
    postalCode: cf.postalCode || "desconocido",
    latitude: cf.latitude || "desconocida",
    longitude: cf.longitude || "desconocida",
    timezone: cf.timezone || "desconocida",
    continent: cf.continent || "desconocido",
    asn: cf.asn || "desconocido",
    organization: cf.asOrganization || "desconocida",
    colo: cf.colo || "desconocido",
    httpProtocol: cf.httpProtocol || "desconocido",
    tlsVersion: cf.tlsVersion || "desconocido",
    tlsCipher: cf.tlsCipher || "desconocido",
    clientTcpRtt: cf.clientTcpRtt ?? "desconocido",
    requestPriority: cf.requestPriority || "desconocida",
    botManagement: cf.botManagement
      ? {
          score: cf.botManagement.score,
          verifiedBot: cf.botManagement.verifiedBot,
        }
      : "no disponible",
  };

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      "Cache-Control": "no-store",
      // CORS por si sirves el HTML desde otro dominio
      "Access-Control-Allow-Origin": "*",
    },
  });
}
