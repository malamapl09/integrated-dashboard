const express = require('express');
const { pimPool } = require('../config/database');
const cache = require('../utils/cache');
const { authenticate } = require('../../../shared/middleware/authMiddleware');
const router = express.Router();

// Sample fallback data when PIM is not available
const sampleProducts = [
  {
    id: '2101424000000',
    ean: '2101424000000',
    name: 'Batata Fresca Por Libras',
    description: 'Batata fresca de primera calidad',
    price: 39.00,
    category: 'Vegetales',
    stock_quantity: 100,
    active: 1
  },
  {
    id: '2299902078400',
    ean: '2299902078400',
    name: 'Huevos Marron Gil & Asociados 30 Unidades',
    description: 'Huevos frescos color marrón',
    price: 293.00,
    category: 'Lácteos',
    stock_quantity: 50,
    active: 1
  },
  {
    id: '2299902117345',
    ean: '2299902117345',
    name: 'Pan de Agua Bakery Premium 10 Unidades',
    description: 'Pan de agua fresco premium',
    price: 49.00,
    category: 'Panadería',
    stock_quantity: 75,
    active: 1
  },
  {
    id: '2110945000000',
    ean: '2110945000000',
    name: 'Papas Premium Por Libras',
    description: 'Papas frescas premium',
    price: 54.00,
    category: 'Vegetales',
    stock_quantity: 80,
    active: 1
  },
  {
    id: '7702027040252',
    ean: '7702027040252',
    name: 'Toallas Intimas Nosotras Buenas Noches 10 uds',
    description: 'Toallas íntimas nocturnas',
    price: 104.00,
    category: 'Higiene',
    stock_quantity: 30,
    active: 1
  },
  {
    id: '2101275000000',
    ean: '2101275000000',
    name: 'Zanahoria Fresca Por Libras',
    description: 'Zanahoria fresca de primera',
    price: 41.00,
    category: 'Vegetales',
    stock_quantity: 90,
    active: 1
  }
];

async function searchProductsInPIM(search, category) {
  // Create cache key
  const cacheKey = `products:${search || 'all'}:${category || 'all'}`;
  
  // Check cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    console.log('Returning cached product results');
    return cached;
  }

  if (!pimPool) {
    // Return sample data filtered if no PIM connection
    let filtered = sampleProducts.filter(p => p.active);
    
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        p.ean.includes(search) ||
        (p.description && p.description.toLowerCase().includes(searchLower))
      );
    }
    
    if (category) {
      filtered = filtered.filter(p => p.category === category);
    }
    
    // Cache sample results for 10 minutes
    cache.set(cacheKey, filtered, 600);
    return filtered;
  }

  try {
    // Optimized query with reduced JOINs and better indexing
    let baseQuery = `
      SELECT 
        wp.sku as id,
        wp.sku as ean,
        wp.title as name,
        wp.description,
        wp.price as base_price,
        wp.type_tax,
        wp.depto as category
      FROM web_products wp
      WHERE wp.status_new = 1 AND wp.borrado = 0
    `;
    let params = [];

    // Add search conditions early to filter dataset
    if (search) {
      baseQuery += ' AND (wp.title LIKE ? OR wp.sku LIKE ? OR wp.description LIKE ? OR wp.matnr LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (category) {
      baseQuery += ' AND wp.depto = ?';
      params.push(category);
    }

    baseQuery += ' ORDER BY wp.title LIMIT 50';

    console.log('Executing optimized PIM base query:', baseQuery);
    const [baseRows] = await pimPool.execute(baseQuery, params);
    
    if (baseRows.length === 0) {
      cache.set(cacheKey, [], 300);
      return [];
    }

    // Get SKUs for additional queries
    const skus = baseRows.map(row => row.id);
    const skuPlaceholders = skus.map(() => '?').join(',');

    // Separate queries for pricing and stock (better performance)
    const [promoRows] = await pimPool.execute(
      `SELECT sku, price FROM web_products_promo WHERE sku IN (${skuPlaceholders})`,
      skus
    );
    
    const [stockRows] = await pimPool.execute(
      `SELECT sku, SUM(stock) as stock FROM web_inventory WHERE sku IN (${skuPlaceholders}) GROUP BY sku`,
      skus
    );

    // Create lookup maps for O(1) access
    const promoMap = new Map(promoRows.map(row => [row.sku, row.price]));
    const stockMap = new Map(stockRows.map(row => [row.sku, row.stock]));

    console.log(`PIM query returned ${baseRows.length} base products`);
    
    // Process results with optimized lookups
    const formattedRows = baseRows.map(row => {
      const basePrice = parseFloat(row.base_price) || 0;
      const promoPrice = promoMap.get(row.id);
      const priceWithTax = promoPrice ? parseFloat(promoPrice) : basePrice;
      const typeTax = parseInt(row.type_tax) || 0;
      const stockQuantity = stockMap.get(row.id) || 0;
      
      let finalBasePrice = priceWithTax;
      let itbis = 0;
      
      // Reverse calculation based on tax type
      if (typeTax === 1) { // 18% tax
        finalBasePrice = priceWithTax / 1.18;
        itbis = priceWithTax - finalBasePrice;
      } else if (typeTax === 2) { // 16% tax
        finalBasePrice = priceWithTax / 1.16;
        itbis = priceWithTax - finalBasePrice;
      }
      // typeTax === 0 means 0% tax, so finalBasePrice = priceWithTax and itbis = 0
      
      return {
        id: row.id,
        ean: row.ean,
        name: row.name,
        description: row.description,
        category: row.category,
        price: finalBasePrice,
        price_with_tax: priceWithTax,
        itbis: itbis,
        tax_rate: typeTax === 1 ? 18 : (typeTax === 2 ? 16 : 0),
        stock_quantity: parseInt(stockQuantity) || 0
      };
    });
    
    // Cache results for 5 minutes
    cache.set(cacheKey, formattedRows, 300);
    
    return formattedRows;
  } catch (error) {
    console.error('Error querying PIM database:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlMessage: error.sqlMessage,
      sql: error.sql
    });
    console.log('Falling back to sample data');
    // Fallback to sample data - but call without PIM
    return sampleProducts.filter(p => {
      if (!search) return true;
      const searchLower = search.toLowerCase();
      return p.name.toLowerCase().includes(searchLower) ||
             p.ean.includes(search) ||
             (p.description && p.description.toLowerCase().includes(searchLower));
    });
  }
}

router.get('/', authenticate, async (req, res) => {
  try {
    const { search, category } = req.query;
    console.log('Product search request:', { search, category });
    console.log('PIM Pool available:', !!pimPool);
    
    const products = await searchProductsInPIM(search, category);
    console.log(`Returning ${products.length} products to client`);
    
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    if (!pimPool) {
      const product = sampleProducts.find(p => p.id === req.params.id && p.active);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      return res.json(product);
    }

    const [rows] = await pimPool.execute(`
      SELECT DISTINCT
        wp.sku as id,
        wp.sku as ean,
        wp.title as name,
        wp.description,
        COALESCE(wpp.price, wp.price) as price_with_tax,
        wp.type_tax,
        wp.depto as category,
        COALESCE(SUM(wi.stock), 0) as stock_quantity
      FROM web_products wp
      LEFT JOIN web_inventory wi ON wp.sku = wi.sku
      LEFT JOIN web_products_promo wpp ON wp.sku = wpp.sku
      WHERE wp.sku = ? AND wp.status_new = 1 AND wp.borrado = 0
      GROUP BY wp.sku, wp.title, wp.description, wp.price, wpp.price, wp.type_tax, wp.depto
    `, [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Calculate ITBIS and format the product data
    const row = rows[0];
    const priceWithTax = parseFloat(row.price_with_tax) || 0;
    const typeTax = parseInt(row.type_tax) || 0;
    
    let basePrice = priceWithTax;
    let itbis = 0;
    
    // Reverse calculation based on tax type
    if (typeTax === 1) { // 18% tax
      basePrice = priceWithTax / 1.18;
      itbis = priceWithTax - basePrice;
    } else if (typeTax === 2) { // 16% tax
      basePrice = priceWithTax / 1.16;
      itbis = priceWithTax - basePrice;
    }
    
    const product = {
      ...row,
      price: basePrice,
      price_with_tax: priceWithTax,
      itbis: itbis,
      tax_rate: typeTax === 1 ? 18 : (typeTax === 2 ? 16 : 0),
      stock_quantity: parseInt(row.stock_quantity) || 0
    };
    
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.get('/ean/:ean', authenticate, async (req, res) => {
  try {
    if (!pimPool) {
      const product = sampleProducts.find(p => p.ean === req.params.ean && p.active);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      return res.json(product);
    }

    const [rows] = await pimPool.execute(`
      SELECT DISTINCT
        wp.sku as id,
        wp.sku as ean,
        wp.title as name,
        wp.description,
        COALESCE(wpp.price, wp.price) as price_with_tax,
        wp.type_tax,
        wp.depto as category,
        COALESCE(SUM(wi.stock), 0) as stock_quantity
      FROM web_products wp
      LEFT JOIN web_inventory wi ON wp.sku = wi.sku
      LEFT JOIN web_products_promo wpp ON wp.sku = wpp.sku
      WHERE wp.sku = ? AND wp.status_new = 1 AND wp.borrado = 0
      GROUP BY wp.sku, wp.title, wp.description, wp.price, wpp.price, wp.type_tax, wp.depto
    `, [req.params.ean]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Calculate ITBIS and format the product data
    const row = rows[0];
    const priceWithTax = parseFloat(row.price_with_tax) || 0;
    const typeTax = parseInt(row.type_tax) || 0;
    
    let basePrice = priceWithTax;
    let itbis = 0;
    
    // Reverse calculation based on tax type
    if (typeTax === 1) { // 18% tax
      basePrice = priceWithTax / 1.18;
      itbis = priceWithTax - basePrice;
    } else if (typeTax === 2) { // 16% tax
      basePrice = priceWithTax / 1.16;
      itbis = priceWithTax - basePrice;
    }
    
    const product = {
      ...row,
      price: basePrice,
      price_with_tax: priceWithTax,
      itbis: itbis,
      tax_rate: typeTax === 1 ? 18 : (typeTax === 2 ? 16 : 0),
      stock_quantity: parseInt(row.stock_quantity) || 0
    };
    
    res.json(product);
  } catch (error) {
    console.error('Error fetching product by EAN:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

module.exports = router;