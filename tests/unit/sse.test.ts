import { describe, expect, it } from 'vitest';
import { SseParser } from '@/llm/sse';

describe('SseParser', () => {
  it('parses events split across chunks', () => {
    const p = new SseParser();
    expect(p.push('event: content_block_delta\nda')).toEqual([]);
    expect(p.push('ta: {"a":1}\n')).toEqual([]);
    expect(p.push('\nevent: ping\ndata: {}\n\n')).toEqual([
      { event: 'content_block_delta', data: '{"a":1}' },
      { event: 'ping', data: '{}' },
    ]);
  });

  it('handles CRLF, comments, and multi-line data', () => {
    const p = new SseParser();
    expect(p.push(': keepalive\r\ndata: line one\r\ndata: line two\r\n\r\n')).toEqual([
      { event: undefined, data: 'line one\nline two' },
    ]);
  });

  it('surfaces error events', () => {
    const p = new SseParser();
    const [ev] = p.push(
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error"}}\n\n',
    );
    expect(ev!.event).toBe('error');
    expect(JSON.parse(ev!.data).error.type).toBe('overloaded_error');
  });

  it('flushes a stream that ends mid-event', () => {
    const p = new SseParser();
    p.push('event: message_stop\ndata: {"type":"message_stop"}');
    expect(p.end()).toEqual([{ event: 'message_stop', data: '{"type":"message_stop"}' }]);
    expect(p.end()).toEqual([]);
  });
});
