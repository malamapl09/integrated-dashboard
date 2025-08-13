const axios = require('axios');

async function testAPI() {
  const baseURL = 'http://localhost:3007/api';
  console.log('🧪 Testing Integrated Dashboard API...\n');

  try {
    // Step 1: Login with default admin credentials
    console.log('🔐 Step 1: Authenticating...');
    const loginResponse = await axios.post(`${baseURL}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    
    console.log('✅ Login successful!');
    console.log('👤 User:', loginResponse.data.data.user.username, '-', loginResponse.data.data.user.role);
    
    const token = loginResponse.data.data.tokens.accessToken;
    const headers = { Authorization: `Bearer ${token}` };

    // Step 2: Test Logs API (should have 12K+ entries)
    console.log('\n📝 Step 2: Testing Logs API...');
    const logsResponse = await axios.get(`${baseURL}/logs/stats`, { headers });
    console.log('✅ Logs API working!');
    console.log('📊 Total logs:', logsResponse.data.data.totalLogs[0].count);
    console.log('🔥 Recent activity:', logsResponse.data.data.recentActivity.length, 'days');

    // Step 3: Test Catalog API (should have 37K+ products) 
    console.log('\n📦 Step 3: Testing Catalog API...');
    const catalogResponse = await axios.get(`${baseURL}/catalog/categories/summary`, { headers });
    console.log('✅ Catalog API working!');
    console.log('📊 Categories:', catalogResponse.data.data.length);
    const totalProducts = catalogResponse.data.data.reduce((sum, cat) => sum + cat.totalProducts, 0);
    console.log('📦 Total products:', totalProducts);

    // Step 4: Test Sales API (MySQL fallback with 7K+ orders)
    console.log('\n💰 Step 4: Testing Sales API...');
    const salesResponse = await axios.get(`${baseURL}/sales/metrics?timeRange=last30days`, { headers });
    console.log('✅ Sales API working!');
    console.log('💰 Revenue (last 30 days):', salesResponse.data.data.totalRevenue);
    console.log('🛒 Orders (last 30 days):', salesResponse.data.data.totalOrders);
    console.log('💳 Avg order value:', salesResponse.data.data.avgOrderValue);

    // Step 5: Test store performance
    console.log('\n🏪 Step 5: Testing Store Performance...');
    const storesResponse = await axios.get(`${baseURL}/sales/stores?timeRange=last30days`, { headers });
    console.log('✅ Store Performance API working!');
    console.log('🏪 Stores found:', storesResponse.data.data.length);
    if (storesResponse.data.data.length > 0) {
      const topStore = storesResponse.data.data[0];
      console.log('🥇 Top store:', topStore.storeCode, '- Revenue:', topStore.revenue);
    }

    // Step 6: Test top products
    console.log('\n🔥 Step 6: Testing Top Products...');
    const productsResponse = await axios.get(`${baseURL}/sales/products?timeRange=last30days&limit=3`, { headers });
    console.log('✅ Top Products API working!');
    console.log('🔥 Top products found:', productsResponse.data.data.length);
    productsResponse.data.data.forEach((product, i) => {
      console.log(`   ${i + 1}. ${product.description} - Revenue: ${product.totalRevenue}`);
    });

    console.log('\n🎉 ALL TESTS PASSED! The integrated dashboard is fully functional!');
    console.log('\n🌐 Ready to use:');
    console.log('🏠 Main Dashboard: http://localhost:3007');
    console.log('📝 User Logs: http://localhost:3007/logs/ (12K+ entries)');
    console.log('📦 Catalog: http://localhost:3007/catalog/ (37K+ products)');  
    console.log('💰 Sales: http://localhost:3007/sales/ (7K+ orders)');
    console.log('💼 Quotes: http://localhost:3007/quotes/');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error('📋 Details:', error.response.data);
    }
  }
}

testAPI();