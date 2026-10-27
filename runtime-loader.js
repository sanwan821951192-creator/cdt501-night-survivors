'use strict';
// Own only the two large runtime downloads. The Python / pygame ABI is unchanged.
(() => {
  const IDLE_MS = 30000;
  const MAX_RETRIES = 3;
  const CONCURRENCY = 3;
  let preparation = null;

  const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
  const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function cacheOperation(operation) {
    let timer;
    try {
      return await Promise.race([operation,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Cache unavailable')), 2000); })]);
    } finally { clearTimeout(timer); }
  }

  async function prepare(vm, config) {
    const state = window.nightSurvivorsRuntimeDownload = {
      status: 'downloading', loadedBytes: 0, totalBytes: 0, filesDone: 0,
      fileCount: 2, chunksDone: 0, chunkCount: 0, cacheAvailable: false,
      activeFile: 'manifest.json', retryCount: 0, lastError: null,
    };
    const runtimeRoot = new URL('../', config.cdn);
    let fatal = null;
    let verifiedBytes = 0;
    let cache = null;
    const inflight = new Map();
    const controllers = new Set();

    function update(status, activeFile) {
      if (fatal) return;
      state.status = status;
      if (activeFile) state.activeFile = activeFile;
      state.loadedBytes = Math.min(state.totalBytes,
        verifiedBytes + [...inflight.values()].reduce((sum, value) => sum + value, 0));
    }

    function assetURL(path) {
      if (typeof path !== 'string' || !path) throw new Error('Invalid runtime asset path');
      const url = new URL(path, runtimeRoot);
      if (url.origin !== runtimeRoot.origin || !url.pathname.startsWith(runtimeRoot.pathname))
        throw new Error('Runtime manifest contains an invalid asset path');
      return url;
    }

    async function readBody(url, expectedBytes, label, retry, tracked = true) {
      const controller = new AbortController();
      controllers.add(controller);
      let timer;
      let stalled = false;
      const resetTimer = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { stalled = true; controller.abort(); }, IDLE_MS);
      };
      const pieces = [];
      let count = 0;
      try {
        resetTimer();
        const response = await fetch(url.href, {
          signal: controller.signal, credentials: 'same-origin',
          cache: retry ? 'reload' : (tracked ? 'default' : 'no-cache'),
        });
        if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
        if (response.status === 206) throw new Error(`${label}: unexpected partial response`);
        if (response.body?.getReader) {
          const reader = response.body.getReader();
          while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            if (!value?.byteLength) continue;
            resetTimer();
            count += value.byteLength;
            if (expectedBytes && count > expectedBytes)
              throw new Error(`${label}: response is larger than its manifest size`);
            pieces.push(value);
            if (tracked) { inflight.set(url.href, count); update('downloading', label); }
          }
        } else {
          const bytes = new Uint8Array(await response.arrayBuffer());
          pieces.push(bytes); count = bytes.byteLength;
          if (tracked) { inflight.set(url.href, count); update('downloading', label); }
        }
        if (expectedBytes && count !== expectedBytes)
          throw new Error(`${label}: incomplete response (${count}/${expectedBytes} bytes)`);
        const result = new Uint8Array(count);
        let offset = 0;
        for (const piece of pieces) { result.set(piece, offset); offset += piece.byteLength; }
        return result;
      } catch (error) {
        controller.abort();
        if (fatal) throw fatal;
        if (stalled) throw new Error(`${label}: no download progress for 30 seconds`);
        throw error;
      } finally {
        clearTimeout(timer); controllers.delete(controller);
      }
    }

    async function retryRead(url, expectedBytes, expectedHash, label, tracked = true) {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (fatal) throw fatal;
        try {
          const bytes = await readBody(url, expectedBytes, label, attempt, tracked);
          if (expectedHash && await digest(bytes) !== expectedHash)
            throw new Error(`${label}: SHA-256 mismatch`);
          return bytes;
        } catch (error) {
          inflight.delete(url.href);
          if (fatal) throw fatal;
          state.lastError = String(error?.message || error);
          if (attempt === MAX_RETRIES) throw error;
          state.retryCount++;
          update('retrying', label);
          await sleep(500 * 2 ** attempt);
        }
      }
    }

    async function cachedAsset(row, label, isChunk = false) {
      const url = assetURL(row.path);
      url.searchParams.set('sha256', row.sha256);
      let bytes;
      if (cache) {
        try {
          const response = await cacheOperation(cache.match(url.href));
          if (response) {
            const candidate = new Uint8Array(await cacheOperation(response.arrayBuffer()));
            if (candidate.byteLength === row.bytes && await digest(candidate) === row.sha256)
              bytes = candidate;
            else await cacheOperation(cache.delete(url.href));
          }
        } catch { cache = null; state.cacheAvailable = false; }
      }
      if (!bytes) {
        bytes = await retryRead(url, row.bytes, row.sha256, label);
        if (cache) {
          try { await cacheOperation(cache.put(url.href, new Response(bytes, {headers: {'Content-Type': 'application/octet-stream'}}))); }
          catch { cache = null; state.cacheAvailable = false; }
        }
      }
      inflight.delete(url.href);
      verifiedBytes += bytes.byteLength;
      if (isChunk) state.chunksDone++;
      update('downloading', label);
      return bytes;
    }

    async function parallel(tasks) {
      let next = 0;
      const workers = Array.from({length: Math.min(CONCURRENCY, tasks.length)}, async () => {
        while (!fatal && next < tasks.length) {
          const task = tasks[next++];
          try { await task(); }
          catch (error) {
            fatal = error;
            for (const controller of controllers) controller.abort();
            throw error;
          }
        }
      });
      await Promise.allSettled(workers);
      if (fatal) throw fatal;
    }

    try {
      if (!crypto?.subtle) throw new Error('This browser cannot verify runtime files; use an HTTPS browser.');
      const manifestBytes = await retryRead(assetURL('downloads/manifest.json'), 0, null, 'manifest.json', false);
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      if (manifest.schema !== 1 || !/^[a-f0-9]{24}$/.test(manifest.version) ||
          !Array.isArray(manifest.files) || manifest.files.length !== 2)
        throw new Error('Invalid runtime download manifest');
      const expectedNames = new Set(['main.data', 'main.wasm']);
      for (const file of manifest.files) {
        if (!expectedNames.delete(file.name) || !Number.isSafeInteger(file.bytes) || file.bytes <= 0 ||
            !Number.isSafeInteger(file.gzipBytes) || file.gzipBytes <= 0 ||
            !/^[a-f0-9]{64}$/.test(file.sha256) || !/^[a-f0-9]{64}$/.test(file.gzipSha256) ||
            !Array.isArray(file.chunks) || !file.chunks.length)
          throw new Error('Invalid runtime file entry');
        assetURL(file.path);
        for (const chunk of file.chunks) {
          if (!Number.isSafeInteger(chunk.bytes) || chunk.bytes <= 0 ||
              !/^[a-f0-9]{64}$/.test(chunk.sha256)) throw new Error('Invalid runtime chunk entry');
          assetURL(chunk.path);
        }
        if (file.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0) !== file.gzipBytes)
          throw new Error('Runtime chunk sizes do not match their file');
      }
      try { cache = await cacheOperation(window.caches?.open(`night-survivors-runtime-v1-${manifest.version}`)) || null; }
      catch { cache = null; }
      state.cacheAvailable = !!cache;
      const useChunks = typeof DecompressionStream === 'function';
      state.chunkCount = useChunks ? manifest.files.reduce((sum, file) => sum + file.chunks.length, 0) : 0;
      state.totalBytes = manifest.files.reduce((sum, file) => sum + (useChunks ? file.gzipBytes : file.bytes), 0);
      const completed = new Map();
      if (useChunks) {
        const parts = manifest.files.map(file => new Array(file.chunks.length));
        const tasks = [];
        const maximum = Math.max(...manifest.files.map(file => file.chunks.length));
        // Interleave both files while keeping at most three requests active.
        for (let index = 0; index < maximum; index++) {
          manifest.files.forEach((file, fileIndex) => {
            if (index >= file.chunks.length) return;
            tasks.push(async () => {
              parts[fileIndex][index] = await cachedAsset(file.chunks[index], `${file.name} ${index + 1}/${file.chunks.length}`, true);
            });
          });
        }
        await parallel(tasks);
        for (let index = 0; index < manifest.files.length; index++) {
          const file = manifest.files[index];
          state.activeFile = file.name;
          const compressed = new Blob(parts[index]);
          if (compressed.size !== file.gzipBytes || await digest(await compressed.arrayBuffer()) !== file.gzipSha256)
            throw new Error(`${file.name}: assembled gzip SHA-256 mismatch`);
          const stream = compressed.stream().pipeThrough(new DecompressionStream('gzip'));
          const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
          if (bytes.byteLength !== file.bytes || await digest(bytes) !== file.sha256)
            throw new Error(`${file.name}: decompressed SHA-256 mismatch`);
          completed.set(file.name, bytes);
          parts[index] = null;
          state.filesDone++;
        }
      } else {
        await parallel(manifest.files.map(file => async () => {
          completed.set(file.name, await cachedAsset(file, file.name));
          state.filesDone++;
        }));
      }
      const data = completed.get('main.data');
      vm.getPreloadedPackage = (name, size) => {
        const packageName = String(name).split(/[?#]/, 1)[0];
        if ((packageName !== 'main.data' && !packageName.endsWith('/main.data')) || size !== data.byteLength)
          throw new Error('Unexpected Emscripten data package');
        return data.buffer;
      };
      vm.wasmBinary = completed.get('main.wasm');
      state.status = 'complete'; state.loadedBytes = state.totalBytes;
      state.filesDone = state.fileCount; state.activeFile = ''; state.lastError = null;
    } catch (error) {
      fatal = error;
      for (const controller of controllers) controller.abort();
      state.status = 'failed';
      state.lastError = String(error?.message || error);
      if (typeof window.nightSurvivorsReportLoadError === 'function')
        window.nightSurvivorsReportLoadError('runtime', state.lastError);
      else (window.nightSurvivorsLoadErrors ||= []).push({stage: 'runtime', detail: state.lastError});
      throw error;
    }
  }

  window.nightSurvivorsPrepareRuntime = (vm, config) => {
    if (!preparation) preparation = prepare(vm, config).catch(error => { preparation = null; throw error; });
    return preparation;
  };
})();
