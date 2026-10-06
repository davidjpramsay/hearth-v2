/** Bound decoded bytes before any external JSON/XML parser sees them. */
export async function boundResponse(
  response: Response,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<Response> {
  if (response.body === null) return response;
  const reader = response.body.getReader();
  const bytes = Buffer.allocUnsafe(maximumBytes);
  let size = 0;
  let rejectAbort: (reason: unknown) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort(signal.reason ?? new Error('Provider response timed out.'));
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal.aborted) onAbort();
    for (;;) {
      const chunk = await Promise.race([reader.read(), aborted]);
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximumBytes) throw new Error('Provider response exceeds its safe size limit.');
      bytes.set(chunk.value, size - chunk.value.byteLength);
    }
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.set('content-length', String(size));
    return new Response(bytes.subarray(0, size), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}
