const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json());

// === CARGAR CONFIGURACIÓN ===
let config = {};
try {
  config = require("./config.js");
  console.log("✅ config.js cargado correctamente");
} catch (err) {
  console.log("⚠️ config.js no encontrado, usando variables de entorno");
  config = {
    PRESTASHOP_URL: process.env.PRESTASHOP_URL || "https://tiendadivertina.com",
    PRESTASHOP_API_KEY: process.env.PRESTASHOP_API_KEY
  };
}

const PRESTASHOP_URL = config.PRESTASHOP_URL;
const PRESTASHOP_API_KEY = config.PRESTASHOP_API_KEY;

// === DEBUG ===
console.log("🔍 PRESTASHOP_URL:", PRESTASHOP_URL);
console.log("🔍 PRESTASHOP_API_KEY existe:", !!PRESTASHOP_API_KEY);

// === CACHE ===
let productosCache = [];
let categoriasCache = {};
let ultimaActualizacion = 0;
const CACHE_TIEMPO = 5 * 60 * 1000;

// === OBTENER CATEGORÍAS ===
async function obtenerCategorias() {
  if (Object.keys(categoriasCache).length > 0) {
    return categoriasCache;
  }
  
  try {
    const response = await fetch(
      `${PRESTASHOP_URL}/api/categories?display=[id,name,link_rewrite]&output_format=JSON`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(PRESTASHOP_API_KEY + ':').toString('base64')}`
        }
      }
    );
    
    if (!response.ok) return {};
    
    const data = await response.json();
    
    categoriasCache = {};
    (data.categories || []).forEach(cat => {
      categoriasCache[cat.id] = cat.link_rewrite || cat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    });
    
    return categoriasCache;
  } catch (error) {
    console.error("❌ Error cargando categorías:", error.message);
    return {};
  }
}

// === OBTENER PRODUCTOS ===
async function obtenerProductos() {
  const ahora = Date.now();
  
  if (productosCache.length > 0 && ahora - ultimaActualizacion < CACHE_TIEMPO) {
    console.log("📦 Usando cache de productos");
    return productosCache;
  }
  
  if (!PRESTASHOP_API_KEY) {
    console.warn("⚠️ MODO DEMO: Sin clave API");
    return [];
  }
  
  try {
    console.log("🔄 Conectando con PrestaShop API...");
    
    // Obtener categorías primero
    const categorias = await obtenerCategorias();
    
    // Obtener productos
    const response = await fetch(
      `${PRESTASHOP_URL}/api/products?display=[id,name,price,link_rewrite,description_short,id_category_default]&output_format=JSON`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(PRESTASHOP_API_KEY + ':').toString('base64')}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.products || data.products.length === 0) {
      console.warn("⚠️ No hay productos activos");
      return [];
    }
    
    // Procesar productos con URLs CORRECTAS
    productosCache = data.products.map(p => {
      // Obtener link de categoría
      const categoryLink = categorias[p.id_category_default] || 'animales';
      
      // Construir URL en formato PrestaShop: /category/id-link_rewrite
      const url = `${PRESTASHOP_URL}/${categoryLink}/${p.id}-${p.link_rewrite}`;
      
      return {
        id: p.id,
        nombre: p.name,
        precio: `${parseFloat(p.price).toFixed(2)}€`,
        url: url,
        categoria: categoryLink,
        descripcion: p.description_short ? p.description_short.replace(/<[^>]*>/g, '').substring(0, 120) : '',
        activo: true
      };
    }).slice(0, 50);
    
    ultimaActualizacion = ahora;
    console.log(`✅ ${productosCache.length} productos cargados desde PrestaShop`);
    
    return productosCache;
  } catch (error) {
    console.error("❌ Error al obtener productos:", error.message);
    return productosCache;
  }
}

// === INFO TIENDA ===
const infoTienda = {
  envios: "Envíos gratis a partir de 50€. Entrega 24-48h a Península.",
  devoluciones: "30 días de garantía. Devolución gratuita.",
  pago: "Tarjeta, PayPal y contrareembolso.",
  contacto: "WhatsApp: 600 000 000 | Email: info@tiendadivertina.com"
};

// === GENERAR RESPUESTA ===
async function generarRespuesta(mensajeUsuario) {
  const productos = await obtenerProductos();
  const msg = mensajeUsuario.toLowerCase().trim();
  let respuesta = "";

  // === SALUDOS ===
  if (/^(hola|buenos|buenas|hey|hello)/i.test(msg)) {
    respuesta = "¡Hola! 👋 Bienvenido a TiendaDivertina. ¿Buscas algún producto?";
  }
  
  // === CATÁLOGO ===
  else if (/producto|catálogo|catalogo|tienda|qué tenéis|que teneis/i.test(msg)) {
    if (productos.length === 0) {
      respuesta = "No tenemos productos disponibles ahora. ¿Puedo ayudarte con otra cosa?";
    } else {
      const primeros = productos.slice(0, 5);
      respuesta = "Tenemos estos productos:\n\n";
      
      primeros.forEach((p, i) => {
        respuesta += `${i+1}. *${p.nombre}* - ${p.precio}\n`;
        if (p.descripcion) respuesta += `${p.descripcion}\n`;
        respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#FF6B9D;color:white;text-decoration:none;border-radius:20px;font-size:13px;font-weight:bold;">🛍️ Ver producto</a>\n\n`;
      });
      
      respuesta += `¿Te interesa alguno? Tenemos ${productos.length} productos.`;
    }
  }
  
  // === BÚSQUEDA ===
  else if (msg.length > 3) {
    const filtrados = productos.filter(p => 
      p.nombre.toLowerCase().includes(msg) ||
      (p.descripcion && p.descripcion.toLowerCase().includes(msg))
    );
    
    if (filtrados.length > 0) {
      respuesta = `Encontré ${filtrados.length} producto${filtrados.length > 1 ? 's' : ''}:\n\n`;
      
      filtrados.slice(0, 3).forEach(p => {
        respuesta += `🔍 *${p.nombre}* - ${p.precio}\n`;
        if (p.descripcion) respuesta += `${p.descripcion}\n`;
        respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#4ECDC4;color:white;text-decoration:none;border-radius:20px;font-size:13px;font-weight:bold;">🛍️ Ver producto</a>\n\n`;
      });
      
      respuesta += "¿Te interesa alguno?";
    }
    // Búsquedas específicas
    else if (/juguete|niño|niña|infantil/i.test(msg)) {
      respuesta = "Tenemos juguetes divertidos. Escribe 'productos' para ver el catálogo completo.";
    }
    else if (/peluche|suave|regalo/i.test(msg)) {
      respuesta = "Tenemos peluches muy suaves. Escribe 'productos' para ver el catálogo.";
    }
    else if (/juego|mesa|familia/i.test(msg)) {
      respuesta = "Tenemos juegos de mesa. Escribe 'productos' para ver el catálogo.";
    }
    else if (/perro|gato|mascota|animal/i.test(msg)) {
      respuesta = "Tenemos productos para mascotas. Escribe 'productos' para ver el catálogo.";
    }
    else {
      respuesta = "Puedo ayudarte con:\n\n🛍️ Productos\n📦 Envíos\n💳 Pagos\n🔄 Devoluciones\n\n¿En qué te ayudo?";
    }
  }
  
  // === PRECIOS ===
  else if (/precio|cuánto|cuanto|caro|barato|económico/i.test(msg)) {
    if (productos.length > 0) {
      const baratos = productos.filter(p => parseFloat(p.precio) <= 25).slice(0, 3);
      if (baratos.length > 0) {
        respuesta = "Productos económicos:\n\n";
        baratos.forEach(p => {
          respuesta += `💰 *${p.nombre}* - ${p.precio}\n`;
          respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#4ECDC4;color:white;text-decoration:none;border-radius:20px;font-size:13px;font-weight:bold;">🛍️ Ver producto</a>\n\n`;
        });
      } else {
        respuesta = "Tenemos productos para todos los presupuestos. Escribe 'productos' para ver el catálogo.";
      }
    }
  }
  
  // === ENVÍOS ===
  else if (/envío|envio|entrega|llega|cuándo llega/i.test(msg)) {
    respuesta = `📦 ${infoTienda.envios}\n\n¿Desde qué ciudad nos escribes?`;
  }
  
  // === DEVOLUCIONES ===
  else if (/devolución|devolucion|cambiar|garantía|reembolso/i.test(msg)) {
    respuesta = `✅ ${infoTienda.devoluciones}\n\n¿Tienes algún problema con un pedido?`;
  }
  
  // === PAGO ===
  else if (/pago|pagar|tarjeta|paypal|contrareembolso/i.test(msg)) {
    respuesta = `💳 ${infoTienda.pago}\n\n¿Con qué método prefieres pagar?`;
  }
  
  // === DESCUENTO ===
  else if (/descuento|oferta|promo|código|cupón/i.test(msg)) {
    respuesta = "🎁 ¡10% de descuento en tu primera compra! Usa el código: *BIENVENIDO10*";
  }
  
  // === CARRITO ===
  else if (/carrito|comprar|pedido|cesta|añadir/i.test(msg)) {
    respuesta = "🛒 Para comprar:\n\n1. Haz clic en 'Ver producto'\n2. Añádelo al carrito\n3. Ve al carrito (arriba derecha)\n4. Completa tus datos\n\n¿Necesitas ayuda?";
  }
  
  // === STOCK ===
  else if (/stock|disponible|hay|queda|agotado/i.test(msg)) {
    respuesta = "✅ Todos nuestros productos están en stock y listos para enviar. 📦\n\n¿Cuál te interesa?";
  }
  
  // === CONTACTO ===
  else if (/contacto|teléfono|whatsapp|email|ayuda humana/i.test(msg)) {
    respuesta = `📞 ${infoTienda.contacto}\n\n¿Prefieres que te llamemos o te escribimos?`;
  }
  
  // === DESPEDIDA ===
  else if (/gracias|adiós|adios|hasta|bye|chao/i.test(msg)) {
    respuesta = "¡Gracias por visitar TiendaDivertina! 🎉 Si necesitas algo más, aquí estaré. ¡Que tengas un día divertido! 😊";
  }
  
  // === DEFAULT ===
  else {
    respuesta = "¡Hola! 👋 Soy el asistente de TiendaDivertina. Puedo ayudarte con:\n\n🛍️ Productos\n📦 Envíos\n💳 Pagos\n🔄 Devoluciones\n\n¿En qué te ayudo?";
  }

  return respuesta;
}

// === RUTAS ===
app.get("/", (req, res) => {
  res.send("🛍️ Chatbot Vendedor - TiendaDivertina.com 🚀<br><br>Servidor funcionando. Usa POST /chat para enviar mensajes.");
});

app.post("/chat", async (req, res) => {
  try {
    const mensaje = req.body.message;
    
    if (!mensaje || mensaje.trim() === "") {
      return res.status(400).json({ reply: "Por favor, escribe un mensaje." });
    }
    
    console.log("📩 Mensaje recibido:", mensaje);
    const respuesta = await generarRespuesta(mensaje);
    console.log("💬 Respuesta enviada:", respuesta.substring(0, 100) + "...");
    
    res.json({ reply: respuesta });
    
  } catch (error) {
    console.error("❌ Error en /chat:", error);
    res.status(500).json({ reply: "⚠️ Lo siento, tuve un problema técnico. Intenta de nuevo." });
  }
});

// === INICIAR ===
if (PRESTASHOP_API_KEY) {
  console.log("🔄 Cargando productos y categorías de PrestaShop...");
  obtenerProductos();
} else {
  console.log("⚠️ Iniciando en MODO DEMO");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🛍️ Chatbot corriendo en puerto ${PORT}`);
  console.log(`🌐 URL: ${process.env.RAILWAY_STATIC_URL || 'http://localhost:' + PORT}`);
  console.log(`🏪 Tienda: ${PRESTASHOP_URL}`);
  console.log(`🔑 API: ${PRESTASHOP_API_KEY ? 'Configurada' : 'NO configurada'}`);
});
