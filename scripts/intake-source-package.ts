import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourcePackageIntakeRequest } from '../contracts/foundation/source-package-intake-request.generated.js';
import type { SourcePackageFieldAuditRequest } from '../contracts/analysis/source-package-field-audit-request.generated.js';
import { SourcePackageService, FoundationSourcePackageReader, validateSourcePackageIntakeRequest } from '../src/modules/foundation/index.js';
import { SourcePackageFieldAuditService, validateSourcePackageFieldAuditRequest } from '../src/modules/analysis/index.js';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { openDatabase } from '../src/platform/db/index.js';

let reservedOutput: { readonly path: string; readonly handle: fs.FileHandle } | undefined;
let succeeded = false;

try {
  const args = process.argv.slice(2);
  if (args.length !== 6) throw new Error('Usage: npm run source-package:intake -- <database> <artifact-root> <package-directory> <intake.json> <audit.json> <output.md>');
  const [databaseArgument, artifactArgument, packageArgument, intakeArgument, auditArgument, outputArgument] = args;
  const databasePath = await outsideRepository(databaseArgument!, 'Database');
  const artifactRoot = await outsideRepository(artifactArgument!, 'Artifact root');
  const outputPath = await outsideRepository(outputArgument!, 'Report output');
  reservedOutput = await reserveOutput(outputPath);
  const packageDirectory = path.resolve(packageArgument!);
  const intakePath = path.resolve(intakeArgument!);
  const auditPath = path.resolve(auditArgument!);
  const packageRoot = await fs.realpath(packageDirectory);
  if (!(await fs.stat(packageRoot)).isDirectory()) throw new Error('Package directory is not a directory');

  const input = validateSourcePackageIntakeRequest(JSON.parse(await fs.readFile(intakePath, 'utf8'))) as SourcePackageIntakeRequest;
  const audit = validateSourcePackageFieldAuditRequest(JSON.parse(await fs.readFile(auditPath, 'utf8'))) as SourcePackageFieldAuditRequest;
  const declared = new Set(input.files.map((file) => file.path));
  const supplied = new Map<string, Buffer>();

  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const logical = path.relative(packageRoot, absolute).split(path.sep).join('/');
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Symlink rejected in package: ${safeDiagnostic(logical)}`);
      if (stat.isDirectory()) await walk(absolute);
      else if (stat.isFile()) {
        if (!declared.has(logical)) throw new Error(`Extra package file: ${safeDiagnostic(logical)}`);
        supplied.set(logical, await fs.readFile(absolute));
      } else throw new Error(`Non-regular package entry: ${safeDiagnostic(logical)}`);
    }
  }

  await walk(packageRoot);
  for (const file of input.files) {
    const resolved = path.resolve(packageRoot, ...file.path.split('/'));
    const relative = path.relative(packageRoot, resolved);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Path traversal rejected: ${safeDiagnostic(file.path)}`);
    if (!supplied.has(file.path)) throw new Error(`Missing package file: ${safeDiagnostic(file.path)}`);
  }

  const opened = openDatabase({ databasePath });
  try {
    const store = new ContentAddressedArtifactStore(artifactRoot);
    const packages = new SourcePackageService({ db: opened.db, artifactStore: store });
    const intake = await packages.intake(input, supplied);
    const finalizedPackage = await packages.readVerified(intake.packageId);
    const audits = new SourcePackageFieldAuditService({ db: opened.db, artifactStore: store, sourcePackages: new FoundationSourcePackageReader(packages) });
    const execution = await audits.audit(audit);
    const verified = await audits.readByDigest(execution.resultArtifactSha256);
    const report = render(
      finalizedPackage.manifest,
      verified.result,
      intake.manifestArtifactSha256,
      intake.packageContentSha256,
    );
    await reservedOutput.handle.writeFile(Buffer.from(report));
    await reservedOutput.handle.sync();
    console.log(JSON.stringify({ packageId: intake.packageId, packageContentSha256: intake.packageContentSha256, manifestSha256: intake.manifestArtifactSha256, resultId: execution.resultId, resultSha256: execution.resultArtifactSha256, providerCalls: 0, databaseMutations: intake.databaseMutations + execution.databaseMutations }, null, 2));
    succeeded = true;
  } finally {
    opened.db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Source package intake failed');
  process.exitCode = 1;
} finally {
  if (reservedOutput) {
    try {
      await reservedOutput.handle.close();
    } catch {
      if (succeeded) process.exitCode = 1;
    }
    if (!succeeded) await fs.rm(reservedOutput.path, { force: true }).catch(() => undefined);
  }
}

function render(input: any, result: any, manifest: string, packageContentSha256: string): string {
  const sourceTime = input.sourceAcquiredAt === null ? 'không có thông tin' : code(input.sourceAcquiredAt);
  const files = input.files.map((file: any) => {
    const period = file.period ? `, kỳ ${text(file.period.start)} — ${text(file.period.end)}` : '';
    return `- ${code(file.path)}: họ ${code(file.evidenceFamily)}, vai trò ${code(file.representationRole)}, tính độc lập ${code(file.independence)}, ${code(file.mediaType)}; nguồn ${code(file.providerProvenance)} (${text(file.provenanceBasis)})${period}`;
  }).join('\n');
  const observations = result.observations.map((observation: any) => `- **${text(observation.field)}** [${code(observation.observationKey)}]: trạng thái ${code(observation.state)}; giá trị ${observation.value === null ? 'null' : code(observation.value)}; đơn vị ${observation.unit === null ? 'null' : code(observation.unit)}; độ chính xác ${code(observation.precision)}; biểu diễn ${code(observation.representationPath)} (${code(observation.representationSha256)}); vị trí ${locator(observation.locator)}; ghi chú: ${observation.notes ? text(observation.notes) : 'không có'}`).join('\n');
  const conflicts = result.conflicts.length ? result.conflicts.map((conflict: any) => `- ${code(conflict.type)} giữa ${conflict.observationKeys.map(code).join(', ')}; ${code(conflict.resolution)}: ${text(conflict.notes)}`).join('\n') : '- Không có.';
  const comparisons = result.periodComparisons.length ? result.periodComparisons.map((comparison: any) => `- ${code(comparison.leftObservationKey)} ↔ ${code(comparison.rightObservationKey)}: ${code(comparison.compatibility)}; ${comparison.claim === null ? 'không có tuyên bố so sánh kỳ' : text(comparison.claim)}; ${text(comparison.notes)}`).join('\n') : '- Không có.';
  return `# Báo cáo kiểm toán gói nguồn

- Gói: ${code(input.packageKey)} phiên bản ${text(String(input.version))}
- Nhãn nguồn: ${text(input.sourceLabel)}
- Thời gian nguồn được thu thập: ${sourceTime}
- Thời gian ứng dụng xử lý/lưu trữ: ${code(input.finalizedAt)}
- Package content SHA-256: ${code(packageContentSha256)}
- Manifest SHA-256: ${code(manifest)}
- Field Audit Result ID: ${code(result.resultId)}

## Họ bằng chứng và vai trò
${files}

## Trường kiểm toán
${observations}

> \`missing\` khác với \`observed_zero\`: thiếu dữ liệu không được diễn giải là số 0.

## Xung đột chưa giải quyết
${conflicts}

## So sánh kỳ
${comparisons}

Không có tuyên bố chứng thực chéo giữa các họ bằng chứng. Không tự động giải quyết xung đột.
`;
}

function locator(value: any): string {
  if (value.type === 'html_text') return `HTML text ${code(value.text)}`;
  if (value.type === 'pdf_page') return `PDF trang ${text(String(value.page))}`;
  if (value.type === 'xlsx_cell') return `XLSX ${code(`${value.sheet}!${value.cell}`)}`;
  return `JSON pointer ${code(value.pointer)}`;
}

function text(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('\r', '&#13;')
    .replaceAll('\n', '&#10;')
    .replace(/[\\`*_{}\[\]()#+\-.!|>]/g, '\\$&');
}
function code(value: string): string { return `<code>${text(value)}</code>`; }
function safeDiagnostic(value: string): string { return JSON.stringify(value.replace(/[\u0000-\u001f\u007f]/g, '?')); }

async function outsideRepository(argument: string, label: string): Promise<string> {
  const root = await fs.realpath(path.resolve(fileURLToPath(new URL('..', import.meta.url))));
  const absolute = path.resolve(argument);
  let target: string;
  try { target = await fs.realpath(absolute); }
  catch { target = path.join(await fs.realpath(path.dirname(absolute)), path.basename(absolute)); }
  const relative = path.relative(root, target);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')) throw new Error(`${label} must be outside the Git repository`);
  return target;
}

async function reserveOutput(target: string): Promise<{ readonly path: string; readonly handle: fs.FileHandle }> {
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(target, 'wx', 0o600);
    if (process.platform !== 'win32') await handle.chmod(0o600);
    return { path: target, handle };
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (handle) await fs.rm(target, { force: true }).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Refusing to overwrite existing report');
    throw error;
  }
}
