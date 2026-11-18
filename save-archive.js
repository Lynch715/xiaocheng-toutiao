// 长合订本和自选大图超过本页的小存储时，把整份档案交给浏览器书库。
// 索引在事务成功后才替换。意外关闭时，上一份已完成的档案仍可续办。
let archiveDatabase;
function openArchiveDatabase() {
  if (!archiveDatabase) archiveDatabase = new Promise((resolve,reject) => {
    const request = indexedDB.open('lintown-weekly-bound-volumes',1);
    request.onupgradeneeded = () => request.result.createObjectStore('volumes');
    request.onerror = () => { archiveDatabase = null; reject(request.error); };
    request.onsuccess = () => resolve(request.result);
  });
  return archiveDatabase;
}

async function archiveRecord(mode, operation) {
  const db = await openArchiveDatabase();
  return new Promise((resolve,reject) => {
    const tx = db.transaction('volumes',mode);
    const request = operation(tx.objectStore('volumes'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () => reject(tx.error || request.error);
  });
}

function archivePointer(raw) {
  if (!raw?.startsWith('{"volume":')) return null;
  try { return JSON.parse(raw).volume || null; } catch { return null; }
}
