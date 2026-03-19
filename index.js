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

console.log("🔍 URL:", PRESTASHOP_URL);
console.log("🔍 API Key:", PRESTASHOP_API_KEY ? "EXISTS" : "NO");

// === CACHE ===
let productosCache = [];
let categoriasCache = {};
let ultimaActualizacion = 0;
const CACHE_TIEMPO = 5 * 60 * 1000;

// === OBTENER CATEGORÍAS ===
async function obtenerCategorias() {
  if (Object.keys(categoriasCache).length > 0) return categoriasCache;
  
  try {
    const response = await fetch(
      `${PRESTASHOP_URL}/api/categories?display=[id,link_rewrite]&output_format=JSON`,
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
      if (cat.id && cat.link_rewrite) {
        categoriasCache[cat.id] = cat.link_rewrite;
      }
    });
    
    return categoriasCache;
  } catch (error) {
    console.error("❌ Error categorías:", error.message);
    return {};
  }
}

// === OBTENER PRODUCTOS ===
async function obtenerProductos() {
  const ahora = Date.now();
  
  if (productosCache.length > 0 && ahora - ultimaActualizacion < CACHE_TIEMPO) {
    console.log("📦 Usando cache");
    return productosCache;
  }
  
  if (!PRESTASHOP_API_KEY) {
    console.warn("⚠️ MODO DEMO");
    return [];
  }
  
  try {
    console.log("🔄 Conectando con PrestaShop API...");
    
    // Obtener categorías primero
    const categorias = await obtenerCategorias();
    
    // Obtener productos CON categoría
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
      console.warn("⚠️ No hay productos");
      return [];
    }
    
    // Procesar productos con URL CORRECTA
    productosCache = data.products.map(p => {
      const categoria = categorias[p.id_category_default] || 'animales';
      
      return {
        id: p.id,
        nombre: p.name,
        precio: `${parseFloat(p.price).toFixed(2)}€`,
        // === URL FORMATO PRESTASHOP REAL ===
        url: `${PRESTASHOP_URL}/${categoria}/${p.id}-${p.link_rewrite}`,
        categoria: categoria,
        descripcion: p.description_short ? p.description_short.replace(/<[^>]*>/g, '').substring(0, 120) : '',
        activo: true
      };
    }).slice(0, 50);
    
    ultimaActualizacion = ahora;
    console.log(`✅ ${productosCache.length} productos cargados`);
    
    return productosCache;
  } catch (error) {
    console.error("❌ Error:", error.message);
    return productosCache;
  }
}

// === INFO TIENDA ===
const infoTienda = {
  envios: "Envíos gratis a partir de 50€. Entrega 24-48h.",
  devoluciones: "30 días de garantía. Devolución gratuita.",
  pago: "Tarjeta, PayPal y contrareembolso.",
  contacto: "WhatsApp: 600 000 000 | Email: info@tiendadivertina.com"
};

// === GENERAR RESPUESTA ===
async function generarRespuesta(mensajeUsuario) {
  const productos = await obtenerProductos();
  const msg = mensajeUsuario.toLowerCase().trim();
  let respuesta = "";

  // SALUDOS
  if (/^(hola|buenos|buenas|hey)/i.test(msg)) {
    respuesta = "¡Hola! 👋 Bienvenido a TiendaDivertina. ¿Buscas algún producto?";
  }
  
  // CATÁLOGO
  else if (/producto|catálogo|catalogo|tienda|qué tenéis/i.test(msg)) {
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
  
  // BÚSQUEDA
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
    else if (/juguete|niño|niña/i.test(msg)) {
      respuesta = "Tenemos juguetes divertidos. Escribe 'productos' para ver el catálogo.";
    }
    else if (/peluche|suave/i.test(msg)) {
      respuesta = "Tenemos peluches muy suaves. Escribe 'productos' para ver el catálogo.";
    }
    else if (/juego|mesa/i.test(msg)) {
      respuesta = "Tenemos juegos de mesa. Escribe 'productos' para ver el catálogo.";
    }
    else {
      respuesta = "Puedo ayudarte con:\n\n🛍️ Productos\n📦 Envíos\n💳 Pagos\n🔄 Devoluciones\n\n¿En qué te ayudo?";
    }
  }
  
  // PRECIOS
  else if (/precio|cuánto|barato/i.test(msg)) {
    if (productos.length > 0) {
      const baratos = productos.filter(p => parseFloat(p.precio) <= 25).slice(0, 3);
      respuesta = "Productos económicos:\n\n";
      baratos.forEach(p => {
        respuesta += `💰 *${p.nombre}* - ${p.precio}\n`;
        respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#4ECDC4;color:white;text-decoration:none;border-radius:20px;font-size:13px;font-weight:bold;">🛍️ Ver producto</a>\n\n`;
      });
    }
  }
  
  // ENVÍOS
  else if (/envío|entrega|llega/i.test(msg)) {
    respuesta = `📦 ${infoTienda.envios}`;
  }
  
  // DEVOLUCIONES
  else if (/devolución|cambiar|garantía/i.test(msg)) {
    respuesta = `✅ ${infoTienda.devoluciones}`;
  }
  
  // PAGO
  else if (/pago|tarjeta|paypal/i.test(msg)) {
    respuesta = `💳 ${infoTienda.pago}`;
  }
  
  // DESCUENTO
  else if (/descuento|oferta|promo/i.test(msg)) {
    respuesta = "🎁 ¡10% de descuento! Usa: *BIENVENIDO10*";
  }
  
  // CARRITO
  else if (/carrito|comprar/i.test(msg)) {
    respuesta = "🛒 Haz clic en 'Ver producto' y añádelo al carrito.";
  }
  
  // CONTACTO
  else if (/contacto|whatsapp|email/i.test(msg)) {
    respuesta = `📞 ${infoTienda.contacto}`;
  }
  
  // DESPEDIDA
  else if (/gracias|adiós/i.test(msg)) {
    respuesta = "¡Gracias por visitar TiendaDivertina! 🎉";
  }
  
  // DEFAULT
  else {
    respuesta = "¡Hola! 👋 Puedo ayudarte con:\n\n🛍️ Productos\n📦 Envíos\n💳 Pagos\n🔄 Devoluciones\n\n¿En qué te ayudo?";
  }

  return respuesta;
}

// === RUTAS ===
app.get("/", (req, res) => {
  res.send("🛍️ Chatbot - TiendaDivertina.com 🚀");
});

app.post("/chat", async (req, res) => {
  try {
    const mensaje = req.body.message;
    
    if (!mensaje || mensaje.trim() === "") {
      return res.status(400).json({ reply: "Escribe un mensaje." });
    }
    
    console.log("📩 Mensaje:", mensaje);
    const respuesta = await generarRespuesta(mensaje);
    console.log("💬 Respuesta:", respuesta.substring(0, 100) + "...");
    
    res.json({ reply: respuesta });
    
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ reply: "⚠️ Tuve un problema. Intenta de nuevo." });
  }
});

// === INICIAR ===
if (PRESTASHOP_API_KEY) {
  console.log("🔄 Cargando productos...");
  obtenerProductos();
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🛍️ Chatbot en puerto ${PORT}`);
  console.log(`🔑 API: ${PRESTASHOP_API_KEY ? 'Configurada' : 'NO configurada'}`);
});
