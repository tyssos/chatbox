const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json());

// === CONFIGURACIÓN DESDE VARIABLES DE ENTORNO ===
const PRESTASHOP_URL = process.env.PRESTASHOP_URL || "https://tiendadivertina.com";
const PRESTASHOP_API_KEY = process.env.PRESTASHOP_API_KEY;

// === CACHE DE PRODUCTOS ===
let productosCache = [];
let ultimaActualizacion = 0;
const CACHE_TIEMPO = 5 * 60 * 1000; // 5 minutos

// === OBTENER PRODUCTOS DE PRESTASHOP ===
async function obtenerProductos() {
  const ahora = Date.now();
  
  // Usar cache si está vigente
  if (productosCache.length > 0 && ahora - ultimaActualizacion < CACHE_TIEMPO) {
    console.log("📦 Usando cache de productos");
    return productosCache;
  }
  
  if (!PRESTASHOP_API_KEY) {
    console.warn("⚠️ MODO DEMO: PRESTASHOP_API_KEY no configurada en Railway");
    // Modo demo con productos de ejemplo
    return [
      { id: 1, nombre: "Juguete Divertido", precio: "29.99€", url: `${PRESTASHOP_URL}/juguete-divertido-1.html`, categoria: "Juguetes", descripcion: "Perfecto para niños de 3 a 8 años." },
      { id: 2, nombre: "Juego de Mesa Familiar", precio: "24.99€", url: `${PRESTASHOP_URL}/juego-mesa-familiar-2.html`, categoria: "Juegos", descripcion: "Ideal para tardes en familia. 2-6 jugadores." },
      { id: 3, nombre: "Peluche Suave", precio: "19.99€", url: `${PRESTASHOP_URL}/peluche-suave-3.html`, categoria: "Peluches", descripcion: "Suave y abrazable. Perfecto para regalar." }
    ];
  }
  
  try {
    console.log("🔄 Conectando con PrestaShop API...");
    
    // Petición a API de PrestaShop con campos disponibles
    const response = await fetch(
      `${PRESTASHOP_URL}/api/products?display=[id,name,price,link_rewrite,description_short,active,id_category_default]&output_format=JSON&filter[active]=1`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(PRESTASHOP_API_KEY + ':').toString('base64')}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`PrestaShop API error: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.products || data.products.length === 0) {
      console.warn("⚠️ No hay productos activos en PrestaShop");
      return [];
    }
    
    // Obtener categorías para mapear nombres
    let categorias = {};
    try {
      const catResponse = await fetch(
        `${PRESTASHOP_URL}/api/categories?display=[id,name]&output_format=JSON`,
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(PRESTASHOP_API_KEY + ':').toString('base64')}`
          }
        }
      );
      if (catResponse.ok) {
        const catData = await catResponse.json();
        categorias = {};
        (catData.categories || []).forEach(cat => {
          categorias[cat.id] = cat.name;
        });
      }
    } catch (err) {
      console.log("⚠️ No se pudieron cargar categorías, usando IDs");
    }
    
    // Procesar productos
    productosCache = data.products.map(p => {
      // Construir URL correcta (formato PrestaShop estándar)
      const url = `${PRESTASHOP_URL}/es/${p.link_rewrite}-${p.id}.html`;
      
      return {
        id: p.id,
        nombre: p.name,
        precio: `${parseFloat(p.price).toFixed(2)}€`,
        url: url,
        categoria: categorias[p.id_category_default] || `Categoría ${p.id_category_default}`,
        descripcion: p.description_short ? p.description_short.replace(/<[^>]*>/g, '').substring(0, 120) : '',
        activo: p.active
      };
    }).slice(0, 50); // Máximo 50 productos
    
    ultimaActualizacion = ahora;
    console.log(`✅ ${productosCache.length} productos cargados desde PrestaShop`);
    
    return productosCache;
  } catch (error) {
    console.error("❌ Error al obtener productos:", error.message);
    return productosCache; // Devolver cache anterior si falla
  }
}

// === INFORMACIÓN DE LA TIENDA ===
const infoTienda = {
  envios: "Envíos gratis a partir de 50€. Entrega en 24-48h a Península.",
  devoluciones: "30 días de garantía. Devolución gratuita si no estás satisfecho.",
  pago: "Aceptamos tarjeta, PayPal y contrareembolso.",
  contacto: "WhatsApp: 600 000 000 | Email: info@tiendadivertina.com"
};

// === GENERAR RESPUESTA CON IA ===
async function generarRespuesta(mensajeUsuario) {
  const productos = await obtenerProductos();
  const msg = mensajeUsuario.toLowerCase().trim();
  let respuesta = "";

  // === SALUDOS ===
  if (/^(hola|buenos|buenas|hey|hello)/i.test(msg)) {
    respuesta = "¡Hola! 👋 Bienvenido a TiendaDivertina. Soy tu asistente virtual. ¿Buscas algún producto en especial?";
  }
  
  // === MOSTRAR CATÁLOGO ===
  else if (/producto|catálogo|catalogo|tienda|qué tenéis|que teneis/i.test(msg)) {
    if (productos.length === 0) {
      respuesta = "Lo siento, en este momento no tenemos productos disponibles. ¿Puedo ayudarte con otra cosa?";
    } else {
      const primeros = productos.slice(0, 5);
      respuesta = "Tenemos estos productos destacados:\n\n";
      
      primeros.forEach((p, i) => {
        respuesta += `${i+1}. *${p.nombre}* - ${p.precio}\n`;
        if (p.descripcion) {
          respuesta += `${p.descripcion}\n`;
        }
        respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#FF6B9D;color:white;text-decoration:none;border-radius:20px;font-size:13px;font-weight:bold;">🛍️ Ver producto</a>\n\n`;
      });
      
      respuesta += `¿Te interesa alguno? Tenemos ${productos.length} productos disponibles.`;
    }
  }
  
  // === BÚSQUEDA POR PALABRAS CLAVE ===
  else if (msg.length > 3) {
    // Buscar en nombre del producto
    const filtrados = productos.filter(p => 
      p.nombre.toLowerCase().includes(msg) ||
      p.descripcion.toLowerCase().includes(msg) ||
      p.categoria.toLowerCase().includes(msg)
    );
    
    if (filtrados.length > 0) {
      respuesta = `Encontré ${filtrados.length} producto${filtrados.length > 1 ? 's' : ''}:\n\n`;
      
      filtrados.slice(0, 3).forEach(p => {
        respuesta += `🔍 *${p.nombre}* - ${p.precio}\n`;
        if (p.descripcion) {
          respuesta += `${p.descripcion}\n`;
        }
        respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#4ECDC4;color:white;text-decoration:none;border-radius:20px;font-size:13px;font-weight:bold;">🛍️ Ver producto</a>\n\n`;
      });
      
      respuesta += "¿Te interesa alguno?";
    } 
    // Búsquedas específicas por tipo
    else if (/juguete|niño|niña|infantil/i.test(msg)) {
      const juguetes = productos.filter(p => 
        p.nombre.toLowerCase().includes('juguete') || 
        p.categoria.toLowerCase().includes('juguete') ||
        p.categoria.toLowerCase().includes('niño')
      );
      
      if (juguetes.length > 0) {
        respuesta = `Te recomiendo estos juguetes:\n\n`;
        juguetes.slice(0, 3).forEach(p => {
          respuesta += `🎁 *${p.nombre}* - ${p.precio}\n`;
          if (p.descripcion) respuesta += `${p.descripcion}\n`;
          respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#FF8E53;color:white;text-decoration:none;border-radius:20px;font-size:13px;font-weight:bold;">🛍️ Ver producto</a>\n\n`;
        });
        respuesta += "¿Cuál te gusta más?";
      } else {
        respuesta = "Tenemos juguetes divertidos. ¿Qué edad tiene el niño/a? Así te recomiendo algo perfecto.";
      }
    }
    else if (/peluche|suave|regalo/i.test(msg)) {
      const peluches = productos.filter(p => 
        p.nombre.toLowerCase().includes('peluche') || 
        p.nombre.toLowerCase().includes('suave')
      );
      
      if (peluches.length > 0) {
        respuesta = `Estos peluches son adorables:\n\n`;
        peluches.slice(0, 3).forEach(p => {
          respuesta += `🧸 *${p.nombre}* - ${p.precio}\n`;
          if (p.descripcion) respuesta += `${p.descripcion}\n`;
          respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#FF6B9D;color:white;text-decoration:none;border-radius:20px;font-size:13px;font-weight:bold;">🛍️ Ver producto</a>\n`;
          respuesta += `<small style="color:#FFD93D;">¿Es para regalar? 🎁</small>\n\n`;
        });
      } else {
        respuesta = "Tenemos peluches muy suaves. ¿Qué animal o personaje te gusta?";
      }
    }
    else if (/juego|mesa|familia/i.test(msg)) {
      const juegos = productos.filter(p => 
        p.nombre.toLowerCase().includes('juego') || 
        p.nombre.toLowerCase().includes('mesa')
      );
      
      if (juegos.length > 0) {
        respuesta = `Estos juegos de mesa son ideales:\n\n`;
        juegos.slice(0, 3).forEach(p => {
          respuesta += `🎮 *${p.nombre}* - ${p.precio}\n`;
          if (p.descripcion) respuesta += `${p.descripcion}\n`;
          respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#4ECDC4;color:white;text-decoration:none;border-radius:20px;font-size:13px;font-weight:bold;">🛍️ Ver producto</a>\n\n`;
        });
        respuesta += "¿Para cuántas personas buscas?";
      } else {
        respuesta = "¡Tenemos juegos para toda la familia! ¿Buscas para niños o adultos?";
      }
    }
    else {
      respuesta = "¡Interesante pregunta! 🤔 Puedo ayudarte con:\n\n🛍️ Productos y recomendaciones\n📦 Envíos y entregas\n💳 Métodos de pago\n🔄 Devoluciones\n\n¿En qué te ayudo?";
    }
  }
  
  // === PRECIOS ===
  else if (/precio|cuánto|cuanto|caro|barato|económico|economico/i.test(msg)) {
    if (productos.length === 0) {
      respuesta = "No tengo información de precios en este momento. ¿Puedo ayudarte con otra cosa?";
    } else {
      const precios = productos.map(p => parseFloat(p.precio)).filter(p => !isNaN(p));
      const min = Math.min(...precios).toFixed(2);
      const max = Math.max(...precios).toFixed(2);
      
      respuesta = `Nuestros productos van desde ${min}€ hasta ${max}€.\n\n`;
      
      const baratos = productos.filter(p => parseFloat(p.precio) <= 25).slice(0, 3);
      if (baratos.length > 0) {
        respuesta += "Estos son económicos:\n";
        baratos.forEach(p => {
          respuesta += `💰 *${p.nombre}* - ${p.precio}\n`;
          respuesta += `<a href="${p.url}" target="_blank" style="display:inline-block;margin:8px 0;padding:10px 20px;background:#4ECDC4;color:white;text-decoration:none;border-radius:20px;font-size:13px;font-weight:bold;">🛍️ Ver producto</a>\n\n`;
        });
      }
    }
  }
  
  // === ENVÍOS ===
  else if (/envío|envio|entrega|llega|cuándo llega|cuando llega/i.test(msg)) {
    respuesta = `📦 ${infoTienda.envios}\n\n¿Desde qué ciudad nos escribes?`;
  }
  
  // === DEVOLUCIONES ===
  else if (/devolución|devolucion|cambiar|garantía|garantia|reembolso/i.test(msg)) {
    respuesta = `✅ ${infoTienda.devoluciones}\n\n¿Tienes algún problema con un pedido?`;
  }
  
  // === PAGO ===
  else if (/pago|pagar|tarjeta|paypal|contrareembolso|efectivo/i.test(msg)) {
    respuesta = `💳 ${infoTienda.pago}\n\n¿Con qué método prefieres pagar?`;
  }
  
  // === DESCUENTO / OFERTA ===
  else if (/descuento|oferta|promo|código|codigo|cupón|cupon/i.test(msg)) {
    respuesta = `🎁 ¡10% de descuento en tu primera compra! Usa el código: *BIENVENIDO10*\n\n¿Quieres que te ayude a encontrar el producto perfecto?`;
  }
  
  // === CARRITO / COMPRAR ===
  else if (/carrito|comprar|pedido|cesta|añadir|agregar/i.test(msg)) {
    respuesta = `🛒 Para comprar:\n\n1. Haz clic en 'Ver producto'\n2. Añádelo al carrito\n3. Ve al carrito (arriba derecha)\n4. Completa tus datos\n\n¿Necesitas ayuda?`;
  }
  
  // === STOCK ===
  else if (/stock|disponible|hay|queda|agotado/i.test(msg)) {
    respuesta = `✅ Todos nuestros productos están en stock y listos para enviar. 📦\n\n¿Cuál te interesa?`;
  }
  
  // === CONTACTO ===
  else if (/contacto|teléfono|telefono|whatsapp|email|correo|ayuda humana/i.test(msg)) {
    respuesta = `📞 ${infoTienda.contacto}\n\n¿Prefieres que te llamemos o te escribimos por WhatsApp?`;
  }
  
  // === DESPEDIDA ===
  else if (/adiós|adios|gracias|hasta|bye|chao/i.test(msg)) {
    respuesta = `¡Gracias por visitar TiendaDivertina! 🎉 Si necesitas algo más, aquí estaré. ¡Que tengas un día divertido! 😊`;
  }
  
  // === RESPUESTA POR DEFECTO ===
  else {
    respuesta = `¡Hola! 👋 Soy el asistente de TiendaDivertina. Puedo ayudarte con:\n\n🛍️ Productos y recomendaciones\n📦 Envíos y entregas\n💳 Métodos de pago\n🔄 Devoluciones\n\n¿En qué te ayudo?`;
  }

  return respuesta;
}

// === RUTAS ===
app.get("/", (req, res) => {
  res.send("🛍️ Chatbot Vendedor - TiendaDivertina.com 🚀<br><br>Servidor funcionando correctamente. Usa POST /chat para enviar mensajes.");
});

app.post("/chat", async (req, res) => {
  try {
    const mensaje = req.body.message;
    
    if (!mensaje || mensaje.trim() === "") {
      return res.status(400).json({ reply: "Por favor, escribe un mensaje." });
    }
    
    console.log("📩 Mensaje recibido:", mensaje);
    const respuesta = await generarRespuesta(mensaje);
    console.log("💬 Respuesta enviada (primeros 100 chars):", respuesta.substring(0, 100) + "...");
    
    res.json({ reply: respuesta });
    
  } catch (error) {
    console.error("❌ Error en /chat:", error);
    res.status(500).json({ reply: "⚠️ Lo siento, tuve un problema técnico. Intenta de nuevo." });
  }
});

// === CARGAR PRODUCTOS AL INICIAR ===
if (PRESTASHOP_API_KEY) {
  console.log("🔄 Cargando productos de PrestaShop al iniciar...");
  obtenerProductos().then(() => {
    console.log("✅ Productos inicializados");
  }).catch(err => {
    console.error("❌ Error al inicializar productos:", err.message);
  });
} else {
  console.log("⚠️ Iniciando en MODO DEMO (sin conexión a PrestaShop)");
}

// === INICIAR SERVIDOR ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🛍️ Chatbot corriendo en puerto ${PORT}`);
  console.log(`🌐 URL: ${process.env.RAILWAY_STATIC_URL || 'http://localhost:' + PORT}`);
  console.log(`🏪 Tienda: ${PRESTASHOP_URL}`);
  console.log(`🔑 API: ${PRESTASHOP_API_KEY ? 'Configurada' : 'NO configurada'}`);
});
