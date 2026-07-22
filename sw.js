/* ============================================================================
 * sw.js  —  Service Worker cho PWA "HCDC E-Forms" (vỏ ứng dụng trên GitHub Pages)
 * ----------------------------------------------------------------------------
 * Chiến lược:
 *   - Tài nguyên TĨNH (index.html, logo, thư viện CDN): cache-first + cập nhật nền
 *     -> mở nhanh, dùng được khi mạng yếu.
 *   - Tài nguyên ĐỘNG (Google Apps Script, API ?action=api): luôn lấy từ mạng
 *     -> dữ liệu biểu mẫu/dashboard luôn mới.
 *   - Khi đổi phiên bản: tăng CACHE_VERSION, cache cũ sẽ tự bị xoá.
 *
 * LƯU Ý: Service Worker này chỉ quản lý phần "vỏ" chạy trên GitHub Pages
 * (index.html). Các tab E-Forms/Dashboard/Map nằm trong iframe của Apps Script
 * (khác origin) nên KHÔNG thể cache offline — đó là giới hạn của nền tảng GAS.
 * ==========================================================================*/

const CACHE_VERSION = 'hcdc-eforms-v1.0.0';

// Danh sách tài nguyên nạp sẵn khi cài đặt (vỏ ứng dụng)
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  'https://raw.githubusercontent.com/hcdc-ap/images-host/refs/heads/main/images/favicon.ico',
  'https://github.com/hcdc-ap/images-host/blob/main/images/hcdc-logo.png?raw=true'
];

// --- CÀI ĐẶT: nạp trước tài nguyên tĩnh ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // dùng addAll trong try/catch để 1 URL lỗi không làm hỏng toàn bộ
      .then((cache) => Promise.allSettled(
        PRECACHE_URLS.map((url) => cache.add(url))
      ))
      .then(() => self.skipWaiting())
  );
});

// --- KÍCH HOẠT: dọn dẹp cache của phiên bản cũ ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// --- CHẶN REQUEST ---
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Chỉ xử lý GET; các method khác (POST...) để đi thẳng
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nhận diện tài nguyên ĐỘNG cần dữ liệu mới nhất
  const isDynamic =
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.search.includes('action=api');

  if (isDynamic) {
    // Network-first, fallback về trang chủ đã cache nếu mất mạng
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Tài nguyên TĨNH: trả cache ngay, đồng thời cập nhật nền (stale-while-revalidate)
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached); // mất mạng -> dùng bản cache nếu có

      return cached || networkFetch;
    })
  );
});
