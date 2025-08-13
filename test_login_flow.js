// Test script to verify complete login and dashboard flow
const puppeteer = require('puppeteer');

async function testLoginFlow() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    try {
        console.log('1. Navigating to login page...');
        await page.goto('http://localhost:3007/login.html');
        
        console.log('2. Filling login form...');
        await page.type('#username', 'admin');
        await page.type('#password', 'admin123');
        
        console.log('3. Clicking login button...');
        await page.click('#loginForm button[type="submit"]');
        
        console.log('4. Waiting for redirect to dashboard...');
        await page.waitForNavigation();
        
        console.log('5. Waiting for modules to appear...');
        await page.waitForTimeout(3000);
        
        console.log('6. Checking for module visibility...');
        const modules = await page.evaluate(() => {
            return {
                quotes: document.querySelector('.gradient-card.quotes') !== null,
                logs: document.querySelector('.gradient-card.logs') !== null,
                catalog: document.querySelector('.gradient-card.catalog') !== null,
                sales: document.querySelector('.gradient-card.sales') !== null,
                monitoring: document.querySelector('.gradient-card.monitoring') !== null,
                userRole: window.dashboardApp && window.dashboardApp().userRole,
                canAccessQuotes: window.dashboardApp && window.dashboardApp().canAccessModule('quotes')
            };
        });
        
        console.log('Module visibility test results:', modules);
        
        if (modules.quotes && modules.logs && modules.catalog && modules.sales) {
            console.log('✅ SUCCESS: All modules are visible!');
        } else {
            console.log('❌ FAILURE: Some modules are not visible');
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
    
    await browser.close();
}

testLoginFlow();