// AI翻译对比挑战赛 - Service Worker
const CACHE_NAME = 'ai-translator-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/font-awesome@4.7.0/css/font-awesome.min.css',
  'https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js',
  'https://p26-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/ff9b58cc9dd041ecbbb172d179cec8fa~tplv-a9rns2rl98-image.image?lk3s=8e244e95&rcl=20260503105828F3AFFC0667FD95B8873C&rrcfp=f06b921b&x-expires=1780369159&x-signature=CTb5RNM7Ogpt%2FgUEjuHlf%2FtEznk%3D'
];

// 安装Service Worker
self.addEventListener('install', (event) => {
  console.log('Service Worker: 正在安装...');
  
  // 等待直到缓存完成
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: 缓存文件');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// 激活Service Worker
self.addEventListener('activate', (event) => {
  console.log('Service Worker: 正在激活...');
  
  // 清理旧缓存
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: 清理旧缓存');
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
  console.log('Service Worker: 拦截请求', event.request.url);
  
  // 对于API请求，优先使用网络
  if (event.request.url.includes('/api/') || event.request.method === 'POST') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          // 如果网络请求失败，返回离线页面
          return caches.match('/offline.html');
        })
    );
  } else {
    // 对于静态资源，优先使用缓存
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          // 如果缓存中有响应，则返回缓存的响应
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // 否则，发起网络请求
          return fetch(event.request)
            .then((response) => {
              // 确保响应有效
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              
              // 克隆响应，因为响应是流，只能使用一次
              const responseToCache = response.clone();
              
              // 将响应添加到缓存
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
              
              return response;
            })
            .catch(() => {
              // 如果网络请求失败，返回离线页面
              return caches.match('/offline.html');
            });
        })
    );
  }
});

// 后台同步
self.addEventListener('sync', (event) => {
  if (event.tag === 'translate-sync') {
    event.waitUntil(syncTranslations());
  }
});

// 推送通知
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || '有新的翻译结果可用',
      icon: 'https://p26-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/ff9b58cc9dd041ecbbb172d179cec8fa~tplv-a9rns2rl98-image.image?lk3s=8e244e95&rcl=20260503105828F3AFFC0667FD95B8873C&rrcfp=f06b921b&x-expires=1780369159&x-signature=CTb5RNM7Ogpt%2FgUEjuHlf%2FtEznk%3D',
      badge: 'https://p26-flow-imagex-sign.byteimg.com/tos-cn-i-a9rns2rl98/rc/pc/super_tool/ff9b58cc9dd041ecbbb172d179cec8fa~tplv-a9rns2rl98-image.image?lk3s=8e244e95&rcl=20260503105828F3AFFC0667FD95B8873C&rrcfp=f06b921b&x-expires=1780369159&x-signature=CTb5RNM7Ogpt%2FgUEjuHlf%2FtEznk%3D',
      data: {
        url: data.url || '/'
      },
      actions: [
        {
          action: 'view',
          title: '查看结果'
        },
        {
          action: 'close',
          title: '关闭'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'AI翻译对比', options)
    );
  }
});

// 通知点击
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((windowClients) => {
        // 如果已经有打开的窗口，则聚焦到该窗口
        for (const client of windowClients) {
          if (client.url === event.notification.data.url && 'focus' in client) {
            return client.focus();
          }
        }
        
        // 否则，打开新窗口
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
    );
  }
});

// 同步翻译数据
async function syncTranslations() {
  try {
    const pendingTranslations = await getPendingTranslations();
    
    for (const translation of pendingTranslations) {
      await sendTranslationToServer(translation);
      await removePendingTranslation(translation.id);
    }
    
    return true;
  } catch (error) {
    console.error('同步翻译失败:', error);
    return false;
  }
}

// 从IndexedDB获取待同步的翻译
async function getPendingTranslations() {
  // 这里应该从IndexedDB获取待同步的翻译
  // 由于Service Worker中不能直接访问IndexedDB，这里只是示例
  return [];
}

// 发送翻译到服务器
async function sendTranslationToServer(translation) {
  // 这里应该发送翻译到服务器
  // 由于这是示例，我们只是模拟这个过程
  return new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });
}

// 从IndexedDB删除待同步的翻译
async function removePendingTranslation(id) {
  // 这里应该从IndexedDB删除待同步的翻译
  // 由于Service Worker中不能直接访问IndexedDB，这里只是示例
  return true;
}