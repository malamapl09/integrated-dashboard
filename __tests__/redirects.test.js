const fs = require('fs');
const path = require('path');

describe('Legacy redirects and static references', () => {
  test('app has legacy redirects wired to new routes', () => {
    const app = require('../src/app');
    const stack = app && app._router && app._router.stack ? app._router.stack : [];

    const findLayerByPattern = (pattern) =>
      stack.find(l => l && l.regexp && l.regexp.toString().includes(pattern));

    const quotesLayer = findLayerByPattern('quotes\\-content');
    const logsLayer = findLayerByPattern('logs\\-content');

    expect(quotesLayer).toBeTruthy();
    expect(logsLayer).toBeTruthy();

    // Test quotes-content redirect
    const mockReqQ = { url: '/?a=1' };
    const redirectSpyQ = jest.fn();
    const mockResQ = { redirect: redirectSpyQ };
    quotesLayer.handle(mockReqQ, mockResQ);
    expect(redirectSpyQ).toHaveBeenCalledWith(301, '/quotes/?a=1');

    // Test logs-content redirect
    const mockReqL = { url: '/view=analytics' };
    const redirectSpyL = jest.fn();
    const mockResL = { redirect: redirectSpyL };
    logsLayer.handle(mockReqL, mockResL);
    expect(redirectSpyL).toHaveBeenCalledWith(301, '/logs/view=analytics');
  });

  test('module pages reference unified theme and not legacy paths', () => {
    const quotesHtml = fs.readFileSync(path.join(__dirname, '../public/quotes/index.html'), 'utf8');
    const logsHtml = fs.readFileSync(path.join(__dirname, '../public/logs/index.html'), 'utf8');

    // Uses shared theme
    expect(quotesHtml).toMatch(/shared\/theme\.css/);
    expect(logsHtml).toMatch(/shared\/theme\.css/);

    // No legacy references
    expect(quotesHtml).not.toMatch(/quotes-content/);
    expect(logsHtml).not.toMatch(/logs-content/);
  });
});

