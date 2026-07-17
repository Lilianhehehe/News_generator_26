import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";

// CRON_SECRET is read at module load time, so set it before importing server.js.
process.env.CRON_SECRET = "test-cron-secret";

const newsServer = await import("../server.js");
const {
  assertSafeRemoteUrl,
  isPrivateIpAddress,
  isValidCronSecret,
  checkRateLimit,
  readRequestBody,
  PayloadTooLargeError,
  toHttpUrl,
  getCanonicalArticleUrl
} = newsServer;

// --- M-2: SSRF guard ---------------------------------------------------------

test("isPrivateIpAddress flags internal IPv4 ranges and cloud metadata", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.9.9", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1"]) {
    assert.equal(isPrivateIpAddress(ip), true, `${ip} should be private`);
  }
  for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
    assert.equal(isPrivateIpAddress(ip), false, `${ip} should be public`);
  }
});

test("isPrivateIpAddress flags internal IPv6 including mapped IPv4", () => {
  for (const ip of ["::1", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateIpAddress(ip), true, `${ip} should be private`);
  }
  assert.equal(isPrivateIpAddress("2606:4700:4700::1111"), false);
});

test("assertSafeRemoteUrl rejects non-http protocols", async () => {
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "ftp://example.com/x", "data:text/html,x"]) {
    await assert.rejects(() => assertSafeRemoteUrl(url), /http or https|invalid/i, `${url} must be rejected`);
  }
});

test("assertSafeRemoteUrl rejects literal internal IP hosts", async () => {
  await assert.rejects(() => assertSafeRemoteUrl("http://127.0.0.1/admin"), /internal address/);
  await assert.rejects(() => assertSafeRemoteUrl("http://169.254.169.254/latest/meta-data/"), /internal address/);
  await assert.rejects(() => assertSafeRemoteUrl("http://[::1]:8080/"), /internal address/);
});

test("assertSafeRemoteUrl allows a normal public https URL", async () => {
  const parsed = await assertSafeRemoteUrl("https://example.com/news/article");
  assert.equal(parsed.hostname, "example.com");
});

// --- M-3: only http(s) links become clickable article links ------------------

test("toHttpUrl strips dangerous protocols and keeps http(s)", () => {
  assert.equal(toHttpUrl("javascript:alert(1)"), "");
  assert.equal(toHttpUrl("data:text/html,<script>1</script>"), "");
  assert.equal(toHttpUrl("file:///etc/passwd"), "");
  assert.equal(toHttpUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(toHttpUrl("/relative", "https://example.com"), "https://example.com/relative");
});

test("getCanonicalArticleUrl ignores a javascript: canonical and falls back", () => {
  const html = `<link rel="canonical" href="javascript:alert(document.cookie)">`;
  assert.equal(
    getCanonicalArticleUrl(html, "https://news.example.com/story"),
    "https://news.example.com/story"
  );
});

test("getCanonicalArticleUrl accepts a normal http(s) canonical", () => {
  const html = `<link rel="canonical" href="https://publisher.example.com/real-story">`;
  assert.equal(
    getCanonicalArticleUrl(html, "https://news.example.com/story"),
    "https://publisher.example.com/real-story"
  );
});

// --- H-2: cron secret is fail-closed ----------------------------------------

test("isValidCronSecret rejects wrong and empty secrets, accepts the exact match", () => {
  assert.equal(isValidCronSecret("test-cron-secret"), true);
  assert.equal(isValidCronSecret("wrong"), false);
  assert.equal(isValidCronSecret(""), false);
  assert.equal(isValidCronSecret(undefined), false);
  assert.equal(isValidCronSecret("test-cron-secre"), false); // length mismatch
});

// --- H-1: rate limiting ------------------------------------------------------

test("checkRateLimit allows up to the limit then blocks within the window", async () => {
  const key = `unit-test:${Date.now()}:${Math.random()}`;
  const limit = 3;
  const results = [];
  for (let i = 0; i < 4; i += 1) {
    results.push((await checkRateLimit(key, limit, 60)).allowed);
  }
  assert.deepEqual(results, [true, true, true, false]);
});

test("checkRateLimit keys are independent", async () => {
  const a = `unit-test-a:${Date.now()}:${Math.random()}`;
  const b = `unit-test-b:${Date.now()}:${Math.random()}`;
  assert.equal((await checkRateLimit(a, 1, 60)).allowed, true);
  assert.equal((await checkRateLimit(a, 1, 60)).allowed, false);
  assert.equal((await checkRateLimit(b, 1, 60)).allowed, true);
});

// --- M-1: request body size limit -------------------------------------------

function mockRequest(payload) {
  const stream = Readable.from([Buffer.from(payload)]);
  stream.headers = {};
  return stream;
}

test("readRequestBody parses a small JSON body", async () => {
  const parsed = await readRequestBody(mockRequest(JSON.stringify({ hello: "world" })));
  assert.deepEqual(parsed, { hello: "world" });
});

test("readRequestBody rejects an oversized body with PayloadTooLargeError", async () => {
  const huge = "a".repeat(1_000_001);
  const req = mockRequest(JSON.stringify({ text: huge }));
  await assert.rejects(() => readRequestBody(req), (error) => {
    assert.ok(error instanceof PayloadTooLargeError);
    assert.equal(error.statusCode, 413);
    return true;
  });
});
