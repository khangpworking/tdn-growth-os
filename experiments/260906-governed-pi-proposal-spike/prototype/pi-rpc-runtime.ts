import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { buildPiRpcLaunch, type PiLaunchConfiguration } from './pi-launch.js';
import { validateProposalOutput } from './proposal-validation.js';
import { PiProtocolError, StrictLfJsonlParser } from './strict-jsonl.js';
import type { BoundedPiProposalRequest, PiProposalRuntime, PiRuntimeResult } from './types.js';

export interface PiRpcRuntimeConfiguration extends PiLaunchConfiguration {
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
}

export class PiRpcProposalRuntime implements PiProposalRuntime {
  readonly #config: PiRpcRuntimeConfiguration;

  constructor(config: PiRpcRuntimeConfiguration) {
    this.#config = config;
  }

  async generate(request: BoundedPiProposalRequest): Promise<PiRuntimeResult> {
    const serializedRequest = JSON.stringify(request);
    const inputBytes = Buffer.byteLength(serializedRequest);
    if (inputBytes > request.limits.maxInputBytes) throw new PiProtocolError('Bounded Pi request exceeds input byte limit');
    const launch = buildPiRpcLaunch(this.#config);
    const started = performance.now();
    const child = spawn(launch.command, [...launch.args], launch.options) as ChildProcessWithoutNullStreams;
    return new Promise<PiRuntimeResult>((resolve, reject) => {
      let settled = false;
      let ending = false;
      let pendingError: Error | undefined;
      let pendingResult: PiRuntimeResult | undefined;
      let forceKillTimer: NodeJS.Timeout | undefined;
      let stderrBytes = 0;
      let repairs: 0 | 1 = 0;
      let currentId = '';
      let responseSeen = false;
      let agentEndSeen = false;
      let settledSeen = false;
      let assistantText: string | undefined;
      let outputBytes = 0;
      let completionPending = false;

      const beginTermination = (): void => {
        clearTimeout(timer);
        child.stdin.end();
        child.kill('SIGTERM');
        forceKillTimer = setTimeout(() => child.kill('SIGKILL'), 100);
        forceKillTimer.unref();
      };
      const finishFailure = (error: Error, sendAbort = false): void => {
        if (settled || ending) return;
        ending = true;
        pendingError = error;
        if (sendAbort && child.stdin.writable) child.stdin.write(`${JSON.stringify({ id: randomUUID(), type: 'abort' })}\n`);
        beginTermination();
      };
      const finishSuccess = (output: unknown): void => {
        if (settled || ending) return;
        ending = true;
        pendingResult = {
          output,
          repairTurns: repairs,
          inputBytes,
          outputBytes,
          stdoutBytes: parser.byteCount,
          stderrBytes,
          elapsedMs: Math.max(0, performance.now() - started),
          processExit: 'terminated_after_settled',
        };
        beginTermination();
      };
      const sendPrompt = (message: string): void => {
        currentId = randomUUID();
        responseSeen = false;
        agentEndSeen = false;
        settledSeen = false;
        assistantText = undefined;
        const command = JSON.stringify({ id: currentId, type: 'prompt', message });
        if (!child.stdin.write(`${command}\n`)) child.stdin.once('drain', () => undefined);
      };
      const processSettledTurn = (): void => {
        if (!responseSeen || !agentEndSeen || assistantText === undefined) {
          throw new PiProtocolError('agent_settled arrived before matching prompt response and agent_end');
        }
        outputBytes = Buffer.byteLength(assistantText);
        if (outputBytes > request.limits.maxOutputBytes) throw new PiProtocolError('Assistant output byte limit exceeded');
        let output: unknown;
        try { output = JSON.parse(assistantText) as unknown; }
        catch { throw new PiProtocolError('Final assistant output is not JSON'); }
        const diagnostics = validateProposalOutput(request, output);
        if (diagnostics.length === 0) {
          completionPending = true;
          queueMicrotask(() => {
            if (!settled && completionPending) finishSuccess(output);
          });
          return;
        }
        if (repairs === 1) throw new PiProtocolError('Proposal remains invalid after one repair turn');
        repairs = 1;
        const repair = JSON.stringify({
          instruction: 'Repair only the JSON proposal content. Return JSON only.',
          boundedDiagnostics: diagnostics,
          unchangedOutputContract: request.outputContract,
          unchangedTrustedInput: request.trusted,
          unchangedSourceClaimCodes: request.sourceAudit.claims.map(({ code, assessment }) => ({ code, assessment })),
        });
        if (Buffer.byteLength(repair) > request.limits.maxInputBytes) throw new PiProtocolError('Repair prompt exceeds input byte limit');
        sendPrompt(repair);
      };
      const onRecord = (record: unknown): void => {
        if (settled) return;
        if (completionPending) throw new PiProtocolError('Extra RPC event after terminal result');
        if (!isRecord(record) || typeof record.type !== 'string') throw new PiProtocolError('RPC record must be an object with a type');
        if (record.type === 'response') {
          if (responseSeen) throw new PiProtocolError('Duplicate prompt response');
          if ('result' in record || 'output' in record || 'data' in record ||
              record.id !== currentId || record.command !== 'prompt' || record.success !== true) {
            throw new PiProtocolError('RPC response does not match the current prompt');
          }
          responseSeen = true;
          return;
        }
        if (record.type === 'tool_execution_start' || record.type === 'tool_execution_update' ||
            record.type === 'tool_execution_end' || record.type === 'bash_execution_update') {
          throw new PiProtocolError('Forbidden tool or bash RPC event');
        }
        if (record.type === 'agent_end') {
          if (!responseSeen) throw new PiProtocolError('agent_end arrived before matching prompt response');
          if (agentEndSeen) throw new PiProtocolError('Duplicate agent_end event');
          if ('result' in record || 'output' in record ||
              record.willRetry !== false || !Array.isArray(record.messages)) throw new PiProtocolError('Invalid or retrying agent_end event');
          assistantText = extractSingleAssistantText(record.messages);
          agentEndSeen = true;
          return;
        }
        if (record.type === 'agent_settled') {
          if (settledSeen) throw new PiProtocolError('Duplicate agent_settled event');
          settledSeen = true;
          processSettledTurn();
        }
      };
      const parser = new StrictLfJsonlParser(this.#config.maxStdoutBytes, (record) => {
        try { onRecord(record); } catch (error) { finishFailure(error as Error); }
      });
      const timer = setTimeout(
        () => finishFailure(new PiProtocolError('Pi RPC wall-clock timeout'), true),
        request.limits.timeoutMs,
      );
      timer.unref();

      child.stdout.on('data', (chunk: Buffer) => {
        try { parser.push(chunk); } catch (error) { finishFailure(error as Error); }
      });
      child.stdout.on('end', () => {
        try { parser.end(); } catch (error) { finishFailure(error as Error); }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderrBytes += chunk.byteLength;
        if (stderrBytes > this.#config.maxStderrBytes) finishFailure(new PiProtocolError('Pi RPC stderr byte limit exceeded'));
      });
      child.on('error', (error) => finishFailure(error));
      child.on('exit', () => {
        if (!ending) finishFailure(new PiProtocolError('Pi RPC process exited before a valid settled result'));
      });
      child.on('close', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        if (pendingResult) resolve(pendingResult);
        else reject(pendingError ?? new PiProtocolError('Pi RPC process closed before a valid settled result'));
      });
      child.on('spawn', () => sendPrompt(`${request.prompt.text}\n\nBOUNDED_INPUT_JSON:\n${serializedRequest}`));
    });
  }
}

function extractSingleAssistantText(messages: unknown[]): string {
  const assistantMessages = messages.filter((message): message is Record<string, unknown> => isRecord(message) && message.role === 'assistant');
  if (assistantMessages.length !== 1) throw new PiProtocolError('agent_end must contain exactly one assistant message');
  const content = assistantMessages[0]!.content;
  if (!Array.isArray(content) || content.length !== 1 || !isRecord(content[0]) ||
      content[0].type !== 'text' || typeof content[0].text !== 'string') {
    throw new PiProtocolError('Final assistant message must contain exactly one text payload');
  }
  return content[0].text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
