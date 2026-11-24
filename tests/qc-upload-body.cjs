const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { createContext, runInContext, SourceTextModule, SyntheticModule } = require('node:vm');

const context = createContext({
  Blob, Headers, URL, URLSearchParams, WebSocket, fetch, setTimeout, clearTimeout,
  importScripts() {},
  location: 'https://admin.example/vendor/supabase.js',
});
context.self = context;
runInContext(readFileSync(require.resolve('../vendor/supabase.js'), 'utf8'), context);

test('QC replacement sends the original file bytes through the bundled Supabase client', async () => {
  const payload = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  let requestBody;
  const client = context.supabase.createClient('https://fixture.supabase.co', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, request) => {
      const headers = new Headers(request.headers);
      assert.equal(new URL(url).pathname, '/functions/v1/admin-qc-upload');
      assert.equal(headers.get('x-qc-item'), 'fixture-item');
      assert.equal(headers.get('x-qc-revision'), '1');
      requestBody = request.body;
      return Response.json({ revision: 2 });
    } },
  });
  const source = readFileSync(require.resolve('../src/views/portrait-repair.js'), 'utf8');
  const uiExports = ['html', 'useEffect', 'useLoad', 'usePoll', 'useState'];
  const modules = {
    '../ui.js': new SyntheticModule(uiExports, function () {}),
    '../api.js': new SyntheticModule(['rpc', 'sb'], function () {
      this.setExport('sb', () => client);
    }),
  };
  const view = new SourceTextModule(source);
  await view.link(specifier => modules[specifier]);
  await view.evaluate();

  const file = new File([payload], 'replacement.jpg', { type: 'image/jpeg' });
  assert.deepEqual(await view.namespace.uploadQcPrint({ id: 'fixture-item', revision: 1 }, file), { revision: 2 });
  assert.ok(requestBody instanceof Blob, 'request must contain the selected file');
  assert.deepEqual(Buffer.from(await requestBody.arrayBuffer()), payload);
});
