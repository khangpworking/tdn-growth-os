import { StringDecoder } from 'node:string_decoder';

export class PiProtocolError extends Error {}

export class StrictLfJsonlParser {
  readonly #decoder = new StringDecoder('utf8');
  readonly #utf8Validator = new TextDecoder('utf-8', { fatal: true });
  readonly #maxBytes: number;
  readonly #onRecord: (record: unknown) => void;
  #buffer = '';
  #bytes = 0;
  #ended = false;

  constructor(maxBytes: number, onRecord: (record: unknown) => void) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError('maxBytes must be a positive safe integer');
    this.#maxBytes = maxBytes;
    this.#onRecord = onRecord;
  }

  get byteCount(): number { return this.#bytes; }

  push(chunk: Uint8Array): void {
    if (this.#ended) throw new PiProtocolError('JSONL data received after stream end');
    this.#bytes += chunk.byteLength;
    if (this.#bytes > this.#maxBytes) throw new PiProtocolError('JSONL byte limit exceeded');
    try {
      this.#utf8Validator.decode(chunk, { stream: true });
    } catch {
      throw new PiProtocolError('RPC stdout is not valid UTF-8');
    }
    this.#buffer += this.#decoder.write(Buffer.from(chunk));
    this.#drain();
  }

  end(): void {
    if (this.#ended) return;
    this.#ended = true;
    try {
      this.#utf8Validator.decode();
    } catch {
      throw new PiProtocolError('RPC stdout ends with invalid UTF-8');
    }
    this.#buffer += this.#decoder.end();
    if (this.#buffer.length !== 0) throw new PiProtocolError('RPC stdout ends with a partial JSONL record');
  }

  #drain(): void {
    while (true) {
      const lf = this.#buffer.indexOf('\n');
      if (lf < 0) return;
      const framedLine = this.#buffer.slice(0, lf);
      this.#buffer = this.#buffer.slice(lf + 1);
      const line = framedLine.endsWith('\r') ? framedLine.slice(0, -1) : framedLine;
      if (line.length === 0) throw new PiProtocolError('Empty RPC JSONL record');
      let record: unknown;
      try {
        record = JSON.parse(line) as unknown;
      } catch {
        throw new PiProtocolError('Malformed RPC JSONL record');
      }
      this.#onRecord(record);
    }
  }
}
