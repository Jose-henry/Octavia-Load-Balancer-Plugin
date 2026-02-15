const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('Launching browser (VISIBLE)...');
    const browser = await chromium.launch({ headless: false, slowMo: 1000 });
    const page = await browser.newPage();

    console.log('Navigating to harness...');
    await page.goto('http://localhost:8080/dev-harness.html');

    console.log('Page title:', await page.title());

    // Check for Create Button
    const createBtn = await page.getByText('Create Load Balancer');
    if (await createBtn.isVisible()) {
        console.log('SUCCESS: Create Button found.');
    } else {
        console.error('FAILURE: Create Button not found!');
        process.exit(1);
    }

    // Capture initial screenshot
    await page.screenshot({ path: 'ui_initial.png' });
    console.log('Saved ui_initial.png');

    // Click Create
    console.log('Clicking Create...');
    await createBtn.click();

    // Wait for Wizard Panel
    try {
        await page.waitForSelector('.panel-title:has-text("Create Load Balancer")', { timeout: 5000 });
        console.log('SUCCESS: Wizard Panel appeared.');

        // Check for Sidebar Steps
        const steps = await page.locator('.step-item').allTextContents();
        console.log('Wizard Steps found:', steps);
        if (steps.length === 5 && steps[0].includes('Load Balancer Details')) {
            console.log('SUCCESS: Sidebar Steps verified.');
        } else {
            console.error('FAILURE: Sidebar Steps mismatch:', steps);
        }

        // Check for Step 1 Fields
        const nameInput = await page.locator('input').first(); // Just check if inputs exist
        if (await nameInput.isVisible()) console.log('SUCCESS: Step 1 inputs visible.');

    } catch (e) {
        console.error('FAILURE: Wizard did not appear or timed out.', e);
        await page.screenshot({ path: 'ui_error.png' });
        process.exit(1);
    }

    // Capture Wizard screenshot
    await page.screenshot({ path: 'ui_wizard_refined.png' });
    console.log('Saved ui_wizard_refined.png');

    await browser.close();
})();
