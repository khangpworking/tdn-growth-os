#!/usr/bin/env node

const args = process.argv.slice(2);
const providerIndex = args.indexOf('--provider');
const scenario = providerIndex >= 0 ? args[providerIndex + 1] : 'fake-valid';
let request;
let turn = 0;

process.on('SIGTERM', () => process.exit(0));

let stdinBuffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdinBuffer += chunk;
  while (true) {
    const lf = stdinBuffer.indexOf('\n');
    if (lf < 0) return;
    const line = stdinBuffer.slice(0, lf);
    stdinBuffer = stdinBuffer.slice(lf + 1);
    onLine(line);
  }
});
process.stdin.on('end', () => {
  if (stdinBuffer.length !== 0) process.exit(2);
});

function onLine(line) {
  const command = JSON.parse(line);
  if (command.type === 'abort') return;
  if (command.type !== 'prompt') process.exit(2);
  turn += 1;
  if (turn === 1) {
    const marker = 'BOUNDED_INPUT_JSON:\n';
    const markerIndex = command.message.indexOf(marker);
    if (markerIndex >= 0) request = JSON.parse(command.message.slice(markerIndex + marker.length));
  }

  if (scenario === 'fake-timeout') return;
  if (scenario === 'fake-stderr') {
    process.stderr.write('x'.repeat(1024));
    return;
  }
  if (scenario === 'fake-malformed') {
    process.stdout.write('not-json\n');
    return;
  }
  if (scenario === 'fake-partial') {
    process.stdout.write('{"type":"response"');
    process.stdout.end();
    return;
  }
  if (scenario === 'fake-premature') {
    process.exit(0);
  }

  const response = { type: 'response', id: command.id, command: 'prompt', success: true };
  if (scenario === 'fake-crlf') {
    process.stdout.write(`${JSON.stringify(response)}\r\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(response)}\n`);
  if (scenario === 'fake-duplicate') process.stdout.write(`${JSON.stringify(response)}\n`);

  let output;
  if (scenario === 'fake-invalid' || (scenario === 'fake-repair' && turn === 1)) {
    output = {};
  } else {
    output = proposalFor(request);
    if (scenario === 'fake-oversized') output.title = 'x'.repeat(70 * 1024);
  }
  const assistant = { role: 'assistant', content: [{ type: 'text', text: JSON.stringify(output) }] };
  process.stdout.write(`${JSON.stringify({ type: 'agent_end', willRetry: false, messages: [assistant] })}\n`);
  process.stdout.write(`${JSON.stringify({ type: 'agent_settled' })}\n`);
}

function proposalFor(value) {
  return {
    title: 'Đề xuất rà soát bằng chứng nghiên cứu',
    summary: 'Trình các nhận định đã kiểm toán cho con người xem xét.',
    rationale: 'Tách bằng chứng hỗ trợ, rủi ro và bất định trước quyết định tiếp theo.',
    evidenceLinks: value.sourceAudit.claims.map((claim) => ({
      claimCode: claim.code,
      use: claim.assessment === 'supported' ? 'support'
        : claim.assessment === 'contradicted' ? 'risk'
          : 'uncertainty',
      note: `Sử dụng theo đánh giá ${claim.assessment} của kiểm toán đã xác minh.`,
    })),
    openQuestions: ['Cần thêm nguồn độc lập nào trước khi con người xem xét?'],
  };
}
