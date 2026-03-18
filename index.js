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
      console.warn("⚠️ No hay productos");
      return [];
    }
    
    // Obtener categorías para construir URLs correctas
    let categorias = {};
    try {
      const catResponse = await fetch(
        `${PRESTASHOP_URL}/api/categories?display=[id,name,link_rewrite]&output_format=JSON`,
        {
          headers: {
            'Authorization': `Basic ${Buffer.from(PRESTASHOP_API_KEY + ':').toString('base64')}`
          }
        }
      );
      
      if (catResponse.ok) {
        const catData = await catResponse.json();
        (catData.categories || []).forEach(cat => {
          categorias[cat.id] = cat.link_rewrite || cat.name.toLowerCase().replace(/\s+/g, '-');
        });
      }
    } catch (err) {
      console.log("⚠️ No se pudieron cargar categorías");
    }
    
    // Procesar productos con URLs correctas
    productosCache = data.products.map(p => {
      const categoryLink = categorias[p.id_category_default] || 'animales'; // Fallback
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
    console.log(`✅ ${productosCache.length} productos cargados`);
    
    return productosCache;
  } catch (error) {
    console.error("❌ Error:", error.message);
    return productosCache;
  }
}
