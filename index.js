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
let ultimaActualizacion = 0;

// === OBTENER PRODUCTOS ===
async function obtenerProductos() {
  const ahora = Date.now();
  
  if (productosCache.length > 0 && ahora - ultimaActualizacion < 300000) {
    return productosCache;
  }
  
  if (!PRESTASHOP_API_KEY) {
    return [
      { id: 1, nombre: "Producto Demo", precio: "10.00€", url: "#", descripcion: "Modo demo" }
    ];
  }
  
  try {
    const response = await fetch(
      `${PRESTASHOP_URL}/api/products?display=[id,name,price,link_rewrite]&output_format=JSON`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(PRESTASHOP_API_KEY + ':').toString('base64')}`
        }
      }
    );
    
    if (!response.ok) throw new Error(response.status);
    
    const data = await response.json();
    
    productosCache = (data.products || []).map(p => ({
      id: p.id,
      nombre: p.name,
      precio: `${parseFloat(p.price).toFixed(2)}€`,
      url: `${PRESTASHOP_URL}/${p.link_rewrite}-${p.id}.html`,
      descripcion: ""
    })).slice(0, 50);
    
    ultimaActualizacion = ahora;
    console.log(`✅ ${productosCache.length} productos cargados`);
    
    return productosCache;
  } catch (error) {
    console.error("❌ Error:", error.message);
    return productosCache;
  }
}

// === RESPUESTAS ===
async function generarRespuesta(msg) {
  const productos = await obtenerProductos();
  const mensaje = msg.toLowerCase().trim();
  
  if (/^(hola|buenos)/i.test(mensaje)) {
    return "¡Hola! 👋 ¿En qué te ayudo?";
  }
  
  if (/producto|catálogo|tienda/i.test(mensaje)) {
    if (productos.length === 0) return "No hay productos disponibles.";
    
    let respuesta = "Productos disponibles:\n\n";
    productos.slice(0, 5).forEach((p, i) => {
      respuesta += `${i+1}. *${p.nombre}* - ${p.precio}\n`;
      respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:5px 0;padding:8px 16px;background:#FF6B9D;color:white;text-decoration:none;border-radius:15px;">🛍️ Ver</a>\n\n`;
    });
    
    return respuesta;
  }
  
  if (mensaje.length > 3) {
    const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(mensaje));
    
    if (filtrados.length > 0) {
      let respuesta = `Encontré ${filtrados.length}:\n\n`;
      filtrados.slice(0, 3).forEach(p => {
        respuesta += `🔍 ${p.nombre} - ${p.precio}\n`;
        respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:5px 0;padding:8px 16px;background:#4ECDC4;color:white;text-decoration:none;border-radius:15px;">🛍️ Ver</a>\n\n`;
      });
      return respuesta;
    }
  }
  
  return "Puedo ayudarte con:\n\n🛍️ Productos\n📦 Envíos\n💳 Pagos\n\n¿Qué necesitas?";
}

// === RUTAS ===
app.get("/", (req, res) => {
  res.send("🛍️ Chatbot funcionando");
});

app.post("/chat", async (req, res) => {
  try {
    const mensaje = req.body.message;
    if (!mensaje) return res.status(400).json({ reply: "Escribe algo" });
    
    console.log("📩 Mensaje:", mensaje);
    const respuesta = await generarRespuesta(mensaje);
    console.log("💬 Respuesta:", respuesta.substring(0, 50));
    
    res.json({ reply: respuesta });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ reply: "Error técnico" });
  }
});

// === INICIAR ===
if (PRESTASHOP_API_KEY) {
  obtenerProductos();
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🛍️ Chatbot en puerto ${PORT}`);
  console.log(`🔑 API: ${PRESTASHOP_API_KEY ? 'OK' : 'NO'}`);
});
