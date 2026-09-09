const url = process.argv[2];
let ready = false;
for (let attempt = 0; attempt < 90; attempt++) {
  try {
    const response = await fetch(url, {signal: AbortSignal.timeout(2000)});
    if (response.ok) { ready = true; break; }
  } catch { /* The child is still starting. */ }
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!ready) throw new Error(`Service did not become ready: ${url}`);
