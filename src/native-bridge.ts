type NativeChannel = { postMessage(message: string): void; onmessage?: (event: { data: string }) => void };
declare global { interface Window { ShichenNative?: NativeChannel } }

const pending = new Map<string, { resolve: (data: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let bound: NativeChannel | undefined;
export const isNative = () => typeof window !== 'undefined' && !!window.ShichenNative;
export const isNativeApp = isNative;

/** Only the Android shell at the trusted Pages origin injects this channel. */
export function nativeRequest(method: string, timeoutMs = 60000, payload?: Record<string, unknown>): Promise<any> {
  const channel = window.ShichenNative;
  if (!channel) return Promise.reject(new Error('请在安卓安装版中使用此功能。'));
  if (bound !== channel) {
    channel.onmessage = event => {
      try {
        const reply = JSON.parse(event.data);
        const request = pending.get(reply.id);
        if (!request) return;
        clearTimeout(request.timer);
        pending.delete(reply.id);
        reply.ok ? request.resolve(reply.data) : request.reject(new Error(reply.error || '设备功能暂不可用。'));
      } catch { /* Ignore malformed messages; each request has a timeout. */ }
    };
    bound = channel;
  }
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method === 'startSpeechRecognition' ? '语音等待已结束，请重新点击麦克风或使用输入法语音。' : ['saveImage', 'shareImage', 'showNotification', 'syncReminders', 'cancelReminders'].includes(method) ? '尚未收到设备完成确认，请检查系统提示后重试；未确认前不会记为成功。' : '请完成手机授权后再刷新设备状态。')); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try { channel.postMessage(JSON.stringify({ id, method, ...(payload ? { payload } : {}) })); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error('设备连接暂不可用，请重新打开应用。')); }
  });
}
