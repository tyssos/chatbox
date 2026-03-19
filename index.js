const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json());

// === CONFIGURACIÓN ===
let config = {};
try {
  config = require("./config.js");
  console.log("✅ config.js cargado");
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

// === OBTENER CATEGORÍAS ===
async function obtenerCategorias() {
  if (Object.keys(categoriasCache).length > 0) return categoriasCache;
  
  try {
    const response = await fetch(
      `${PRESTASHOP_URL}/api/categories?ws_key=${PRESTASHOP_API_KEY}&output_format=JSON&display=[id,link_rewrite,name]`,
      {
        headers: {
          'Accept': 'application/json'
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
  
  if (productosCache.length > 0 && ahora - ultimaActualizacion < 300000) {
    console.log("📦 Usando cache");
    return productosCache;
  }
  
  if (!PRESTASHOP_API_KEY) {
    console.warn("⚠️ MODO DEMO");
    return [];
  }
  
  try {
    console.log("🔄 Conectando con PrestaShop...");
    
    // Obtener categorías primero
    const categorias = await obtenerCategorias();
    
    // === OBTENER TODOS LOS PRODUCTOS ACTIVOS CON PRECIO CON IVA ===
    const apiUrl = `${PRESTASHOP_URL}/api/products?ws_key=${PRESTASHOP_API_KEY}&output_format=JSON&display=[id,name,price,price_tax_incl,link_rewrite,id_category_default]&filter[active]=1&limit=1000`;
    
    console.log("📡 URL API:", apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log("📊 Status:", response.status);
    
    if (!response.ok) {
      const text = await response.text();
      console.log("❌ Respuesta:", text.substring(0, 200));
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log("📦 Productos recibidos:", data.products ? data.products.length : 0);
    
    if (!data.products || data.products.length === 0) {
      console.warn("⚠️ No hay productos activos");
      return [];
    }
    
    // Procesar TODOS los productos
    productosCache = data.products.map(p => {
      const categoria = categorias[p.id_category_default] || 'animales';
      
      // URL SIN ID: /category/link_rewrite
      const url = `${PRESTASHOP_URL}/${categoria}/${p.link_rewrite}`;
      
      // === USAR PRECIO CON IVA (price_tax_incl) ===
      const precioConIVA = p.price_tax_incl ? parseFloat(p.price_tax_incl) : parseFloat(p.price);
      
      return {
        id: p.id,
        nombre: p.name,
        precio: `${precioConIVA.toFixed(2)}€`,
        url: url,
        categoria: categoria,
        descripcion: "",
        precioSinIVA: parseFloat(p.price),
        precioConIVA: precioConIVA
      };
    }); // SIN slice - mostrar TODOS los productos
    
    ultimaActualizacion = ahora;
    console.log(`✅ ${productosCache.length} productos activos cargados con IVA`);
    
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
      const primeros = productos.slice(0, 10); // Mostrar hasta 10 productos
      respuesta = `Tenemos ${productos.length} productos disponibles:\n\n`;
      
      primeros.forEach((p, i) => {
        respuesta += `${i+1}. *${p.nombre}* - ${p.precio} (IVA incl.)\n`;
        if (p.descripcion) respuesta += `${p.descripcion}\n`;
        respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#FF6B9D;color:white;text-decoration:none;border-radius:20px;font-size:13px;font-weight:bold;">🛍️ Ver producto</a>\n\n`;
      });
      
      if (productos.length > 10) {
        respuesta += `... y ${productos.length - 10} productos más. ¿Buscas algo específico?`;
      } else {
        respuesta += `¿Te interesa alguno?`;
      }
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
      
      filtrados.slice(0, 5).forEach(p => {
        respuesta += `🔍 *${p.nombre}* - ${p.precio} (IVA incl.)\n`;
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
      const baratos = productos.filter(p => p.precioConIVA <= 25).slice(0, 5);
      respuesta = "Productos económicos:\n\n";
      baratos.forEach(p => {
        respuesta += `💰 *${p.nombre}* - ${p.precio} (IVA incl.)\n`;
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
  console.log("🔄 Cargando productos activos...");
  obtenerProductos();
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🛍️ Chatbot en puerto ${PORT}`);
  console.log(`🔑 API: ${PRESTASHOP_API_KEY ? 'Configurada' : 'NO configurada'}`);
});
