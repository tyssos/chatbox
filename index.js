const express = require("express");
const cors = require("cors");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json());

// === CONFIGURACIÓN ===
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
    return productosCache;
  }
  
  if (!PRESTASHOP_API_KEY) {
    // Modo demo con productos de ejemplo
    return [
      { id: 1, nombre: "Juguete Divertido", precio: "29.99€", url: `${PRESTASHOP_URL}/juguete-divertido`, categoria: "juguetes" },
      { id: 2, nombre: "Juego de Mesa Familiar", precio: "24.99€", url: `${PRESTASHOP_URL}/juego-mesa`, categoria: "juegos" },
      { id: 3, nombre: "Peluche Suave", precio: "19.99€", url: `${PRESTASHOP_URL}/peluche`, categoria: "peluches" }
    ];
  }
  
  try {
    const response = await fetch(
      `${PRESTASHOP_URL}/api/products?display=[id,name,price,link_rewrite,category_default]&output_format=JSON`,
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(PRESTASHOP_API_KEY + ':').toString('base64')}`
        }
      }
    );
    
    if (!response.ok) throw new Error(`PrestaShop API: ${response.status}`);
    
    const data = await response.json();
    
    productosCache = (data.products || []).map(p => ({
      id: p.id,
      nombre: p.name,
      precio: `${parseFloat(p.price).toFixed(2)}€`,
      url: `${PRESTASHOP_URL}/${p.link_rewrite}`,
      categoria: p.category_default?.name || 'General'
    })).slice(0, 50); // Máximo 50 productos para rendimiento
    
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

// === GENERAR RESPUESTA CON IA BÁSICA ===
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
    const primeros = productos.slice(0, 5);
    respuesta = "Tenemos estos productos destacados:\n\n" + 
      primeros.map((p, i) => `${i+1}. *${p.nombre}* - ${p.precio}\n👉 ${p.url}`).join('\n\n') +
      "\n\n¿Te interesa alguno o buscas algo específico?";
  }
  
  // === BÚSQUEDA POR PALABRAS CLAVE ===
  else if (msg.length > 3) {
    // Buscar en nombre y categoría
    const filtrados = productos.filter(p => 
      p.nombre.toLowerCase().includes(msg) || 
      p.categoria.toLowerCase().includes(msg)
    );
    
    if (filtrados.length > 0) {
      respuesta = `Encontré ${filtrados.length} producto${filtrados.length > 1 ? 's' : ''}:\n\n` + 
        filtrados.slice(0, 5).map(p => `🔍 *${p.nombre}* - ${p.precio}\n👉 ${p.url}`).join('\n\n') +
        `\n\n¿Te interesa alguno?`;
    } 
    // Búsquedas específicas por categoría
    else if (/juguete|niño|niña|infantil/i.test(msg)) {
      const juguetes = productos.filter(p => p.categoria.toLowerCase().includes('juguete') || p.nombre.toLowerCase().includes('juguete'));
      if (juguetes.length > 0) {
        respuesta = `Te recomiendo estos juguetes:\n\n${juguetes.slice(0, 3).map(p => `🎁 *${p.nombre}* - ${p.precio}\n👉 ${p.url}`).join('\n\n')}\n\n¿Cuál te gusta más?`;
      } else {
        respuesta = "Tenemos juguetes divertidos. ¿Qué edad tiene el niño/a? Así te recomiendo algo perfecto.";
      }
    }
    else if (/juego|mesa|familia/i.test(msg)) {
      const juegos = productos.filter(p => p.nombre.toLowerCase().includes('juego') || p.categoria.toLowerCase().includes('juego'));
      if (juegos.length > 0) {
        respuesta = `Estos juegos de mesa son ideales:\n\n${juegos.slice(0, 3).map(p => `🎮 *${p.nombre}* - ${p.precio}\n👉 ${p.url}`).join('\n\n')}\n\n¿Para cuántas personas buscas?`;
      } else {
        respuesta = "¡Tenemos juegos para toda la familia! ¿Buscas para niños o adultos?";
      }
    }
    else if (/peluche|suave|regalo/i.test(msg)) {
      const peluches = productos.filter(p => p.nombre.toLowerCase().includes('peluche') || p.nombre.toLowerCase().includes('suave'));
      if (peluches.length > 0) {
        respuesta = `Estos peluches son adorables:\n\n${peluches.slice(0, 3).map(p => `🧸 *${p.nombre}* - ${p.precio}\n👉 ${p.url}`).join('\n\n')}\n\n¿Es para regalar?`;
      } else {
        respuesta = "Tenemos peluches muy suaves. ¿Qué animal o personaje te gusta?";
      }
    }
    else {
      respuesta = `¡Interesante pregunta! 🤔 Puedo ayudarte con:\n\n🛍️ Productos y recomendaciones\n📦 Envíos y entregas\n💳 Métodos de pago\n🔄 Devoluciones\n\n¿En qué te ayudo?`;
    }
  }
  
  // === PRECIOS ===
  else if (/precio|cuánto|cuanto|caro|barato|económico|economico/i.test(msg)) {
    const precios = productos.map(p => parseFloat(p.precio)).filter(p => !isNaN(p));
    if (precios.length > 0) {
      const min = Math.min(...precios).toFixed(2);
      const max = Math.max(...precios).toFixed(2);
      respuesta = `Nuestros productos van desde ${min}€ hasta ${max}€.\n\n`;
      
      const baratos = productos.filter(p => parseFloat(p.precio) <= 25).slice(0, 3);
      if (baratos.length > 0) {
        respuesta += "Estos son económicos:\n" + baratos.map(p => `💰 *${p.nombre}* - ${p.precio}\n👉 ${p.url}`).join('\n');
      }
    } else {
      respuesta = "Tenemos productos para todos los presupuestos. ¿Qué tipo de producto buscas?";
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
    respuesta = `🛒 Para comprar:\n\n1. Haz clic en el producto que te guste\n2. Añádelo al carrito\n3. Ve al carrito (arriba derecha)\n4. Completa tus datos\n\n¿Necesitas ayuda?`;
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
  res.send("🛍️ Chatbot Vendedor - TiendaDivertina.com 🚀");
});

app.post("/chat", async (req, res) => {
  try {
    const mensaje = req.body.message;
    
    if (!mensaje || mensaje.trim() === "") {
      return res.status(400).json({ reply: "Por favor, escribe un mensaje." });
    }
    
    const respuesta = await generarRespuesta(mensaje);
    res.json({ reply: respuesta });
    
  } catch (error) {
    console.error("Error en /chat:", error);
    res.status(500).json({ reply: "⚠️ Lo siento, tuve un problema técnico. Intenta de nuevo." });
  }
});

// === CARGAR PRODUCTOS AL INICIAR ===
if (PRESTASHOP_API_KEY) {
  obtenerProductos();
}

// === INICIAR SERVIDOR ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🛍️ Chatbot corriendo en puerto ${PORT}`);
});
