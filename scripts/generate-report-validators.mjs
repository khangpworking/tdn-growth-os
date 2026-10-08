// Precompiles the research report API validators used by the frontend.
// Ajv compiles schemas with `new Function`, which the operator app's CSP (`script-src 'self'`) forbids,
// so the browser must receive validators that were generated ahead of time.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(repoRoot, 'frontend/src/generated/report-validators.generated.js');

async function readSchema(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), 'utf8'));
}

const reportApiSchema = await readSchema('contracts/api/report-api.schema.json');
const researchGenerationApiSchema = await readSchema('contracts/api/research-generation-api.schema.json');
const researchAutomationApiSchema = await readSchema('contracts/api/research-automation-api.schema.json');
const researchAutomationSourceStatusSchema = await readSchema('contracts/api/research-automation-source-status-api.schema.json');
const marketPresentationRevisionSchema = await readSchema('contracts/analysis/automation-market-presentation-revision.schema.json');
const automationReportRevisionSchema = await readSchema('contracts/analysis/automation-report-revision.schema.json');
const researchAutomationRevisionApiSchema = await readSchema('contracts/api/research-automation-revision-api.schema.json');
const metricIntakeSchema = await readSchema('contracts/api/research-automation-metric-intake-api.schema.json');
const supplementalIntakeSchema = await readSchema('contracts/api/research-automation-supplemental-intake-api.schema.json');
const sourcePackageIntakeSchema = await readSchema('contracts/foundation/source-package-intake-request.schema.json');
const metricRuleSchema = await readSchema('contracts/analysis/automation-metric-rule-adoption.schema.json');
const metricMembershipSchema = await readSchema('contracts/analysis/automation-metric-membership.schema.json');
const metricMembershipApiSchema = await readSchema('contracts/api/research-automation-metric-membership-api.schema.json');
const classifiedRevisionSchema = await readSchema('contracts/analysis/automation-classified-report-revision.schema.json');
const boundedRevisionSchema = await readSchema('contracts/analysis/automation-bounded-report-revision.schema.json');
const quoteRevisionSchema = await readSchema('contracts/analysis/automation-quote-report-revision.schema.json');
const locatedInsightSchema = await readSchema('contracts/analysis/located-insight-methods.schema.json');
const insightSelectionSchema = await readSchema('contracts/analysis/automation-insight-selection.schema.json');
const insightCodingSchema = await readSchema('contracts/analysis/automation-insight-coding.schema.json');
const insightCodingApiSchema = await readSchema('contracts/api/research-automation-insight-coding-api.schema.json');
const insightModelSchema = await readSchema('contracts/analysis/automation-insight-model.schema.json');
const insightModelApiSchema = await readSchema('contracts/api/research-automation-insight-model-api.schema.json');
const insightCrosscheckSchema = await readSchema('contracts/analysis/automation-insight-crosscheck.schema.json');
const insightCrosscheckApiSchema = await readSchema('contracts/api/research-automation-insight-crosscheck-api.schema.json');
const insightRevisionSchema = await readSchema('contracts/analysis/automation-insight-report-revision.schema.json');
const defaultPeerSchema = await readSchema('contracts/analysis/default-market-peers.schema.json');
const readerInputSchema = await readSchema('contracts/analysis/reader-report-input.schema.json');
const readerApiSchema = await readSchema('contracts/api/research-automation-reader-report-api.schema.json');
const reportReviewTargetSchema = await readSchema('contracts/analysis/report-review-target.schema.json');
const reportReviewTargetCreateRequestSchema = await readSchema('contracts/analysis/report-review-target-create-request.schema.json');
const ownerReportReviewTargetApiSchema = await readSchema('contracts/api/owner-report-review-target-api.schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: true, code: { source: true, esm: true } });
addFormats(ajv);
ajv.addSchema(defaultPeerSchema);
ajv.addSchema(reportReviewTargetSchema);
ajv.addSchema(reportReviewTargetCreateRequestSchema);
ajv.addSchema(reportApiSchema);
ajv.addSchema(researchGenerationApiSchema);
ajv.addSchema(researchAutomationApiSchema);
ajv.addSchema(researchAutomationSourceStatusSchema);
ajv.addSchema(automationReportRevisionSchema);
ajv.addSchema(marketPresentationRevisionSchema);
ajv.addSchema(researchAutomationRevisionApiSchema);
ajv.addSchema(metricIntakeSchema);
ajv.addSchema(sourcePackageIntakeSchema);
ajv.addSchema(supplementalIntakeSchema);
ajv.addSchema(metricRuleSchema);
ajv.addSchema(metricMembershipSchema);
ajv.addSchema(metricMembershipApiSchema);
ajv.addSchema(classifiedRevisionSchema);
ajv.addSchema(boundedRevisionSchema);
ajv.addSchema(quoteRevisionSchema);
ajv.addSchema(locatedInsightSchema);
ajv.addSchema(insightSelectionSchema);
ajv.addSchema(insightCodingSchema);
ajv.addSchema(insightCodingApiSchema);
ajv.addSchema(insightModelSchema);
ajv.addSchema(insightModelApiSchema);
ajv.addSchema(insightCrosscheckSchema);
ajv.addSchema(insightCrosscheckApiSchema);
ajv.addSchema(insightRevisionSchema);
ajv.addSchema(readerInputSchema);
ajv.addSchema(readerApiSchema);
ajv.addSchema(ownerReportReviewTargetApiSchema);

const validatorRefs = {
  supplementalSourcePrepare: `${supplementalIntakeSchema.$id}#/$defs/request`,
  supplementalSourcePrepared: `${supplementalIntakeSchema.$id}#/$defs/receipt`,
  supplementalSourcePreparedList: `${supplementalIntakeSchema.$id}#/$defs/preparedList`,
  metricRuleAdopt: `${metricRuleSchema.$id}#/$defs/request`,
  metricRuleReceipt: `${metricRuleSchema.$id}#/$defs/receipt`,
  metricRuleList: `${metricRuleSchema.$id}#/$defs/list`,
  metricMembershipPropose: `${metricMembershipSchema.$id}#/$defs/propose`,
  metricMembershipAccept: `${metricMembershipSchema.$id}#/$defs/accept`,
  metricMembershipMutation: `${metricMembershipApiSchema.$id}#/$defs/mutation`,
  metricMembershipProposal: `${metricMembershipApiSchema.$id}#/$defs/proposal`,
  metricMembershipReceipt: `${metricMembershipApiSchema.$id}#/$defs/receipt`,
  metricMembershipReview: `${metricMembershipApiSchema.$id}#/$defs/review`,
  classifiedReportRevision: classifiedRevisionSchema.$id,
  boundedReportRevision: boundedRevisionSchema.$id,
  quoteReportRevision: quoteRevisionSchema.$id,
  insightCodingAdopt: `${insightCodingApiSchema.$id}#/$defs/adoptRequest`,
  insightCodingPropose: `${insightCodingApiSchema.$id}#/$defs/proposeRequest`,
  insightCodingAccept: `${insightCodingApiSchema.$id}#/$defs/acceptRequest`,
  insightCodingMutation: `${insightCodingApiSchema.$id}#/$defs/mutation`,
  insightCodingView: `${insightCodingApiSchema.$id}#/$defs/view`,
  insightDefaultModelRequest: `${insightModelApiSchema.$id}#/$defs/defaultRequest`,
  insightCodingDefaultRule: `${insightCodingApiSchema.$id}#/$defs/defaultRuleRequest`,
  insightCodingDefaultPropose: `${insightCodingApiSchema.$id}#/$defs/defaultProposeRequest`,
  insightCodingAnyView: `${insightCodingApiSchema.$id}#/$defs/anyView`,
  insightModelRequest: `${insightModelApiSchema.$id}#/$defs/request`,
  insightModelResponse: `${insightModelApiSchema.$id}#/$defs/response`,
  insightCrosscheckRequest: `${insightCrosscheckApiSchema.$id}#/$defs/request`,
  insightCrosscheckAvailability: `${insightCrosscheckApiSchema.$id}#/$defs/available`,
  insightCrosscheckResponse: `${insightCrosscheckApiSchema.$id}#/$defs/response`,
  insightReportRevision: insightRevisionSchema.$id,
  readerReportBuild: `${readerApiSchema.$id}#/$defs/buildRequest`,
  readerReportBuildSubmission: `${readerApiSchema.$id}#/$defs/buildSubmission`,
  readerReportBuildReceipt: `${readerApiSchema.$id}#/$defs/buildReceipt`,
  readerUnitSpecIntakeReceipt: `${readerApiSchema.$id}#/$defs/unitSpecIntakeReceipt`,
  readerReportList: `${readerApiSchema.$id}#/$defs/list`,
  readerReportDecision: `${readerApiSchema.$id}#/$defs/decisionRequest`,
  readerReportDecisionReceipt: `${readerApiSchema.$id}#/$defs/decisionReceipt`,
  researchAutomationRun: `${researchAutomationApiSchema.$id}#/$defs/run`,
  researchAutomationRunList: `${researchAutomationApiSchema.$id}#/$defs/runList`,
  researchAutomationReceipt: `${researchAutomationApiSchema.$id}#/$defs/receipt`,
  researchAutomationSourceStatus: `${researchAutomationSourceStatusSchema.$id}#/$defs/status`,
  researchAutomationRunPdfs: `${researchAutomationSourceStatusSchema.$id}#/$defs/runPdfStates`,
  researchAutomationAttachPdf: `${researchAutomationSourceStatusSchema.$id}#/$defs/attachPdfRequest`,
  researchAutomationMetricPrepared: `${metricIntakeSchema.$id}#/$defs/receipt`,
  researchAutomationMetricPreparedList: `${metricIntakeSchema.$id}#/$defs/preparedList`,
  researchAutomationRevision: automationReportRevisionSchema.$id,
  researchAutomationRevisionCancel: `${researchAutomationRevisionApiSchema.$id}#/$defs/cancelRequest`,
  researchAutomationRevisionVersionList: `${researchAutomationRevisionApiSchema.$id}#/$defs/versionList`,
  researchAutomationRevisionAttemptList: `${researchAutomationRevisionApiSchema.$id}#/$defs/attemptList`,
  researchAutomationRevisionReceipt: `${researchAutomationRevisionApiSchema.$id}#/$defs/receipt`,
  researchGenerationInputs: `${researchGenerationApiSchema.$id}#/$defs/inputs`,
  researchGenerationReceipt: `${researchGenerationApiSchema.$id}#/$defs/receipt`,
  researchGenerationMethodInputError: `${researchGenerationApiSchema.$id}#/$defs/methodInputError`,
  interpretationIndex: `${reportApiSchema.$id}#/$defs/interpretationIndex`,
  interpretationDetail: `${reportApiSchema.$id}#/$defs/interpretationDetail`,
  sectionReadiness: `${reportApiSchema.$id}#/$defs/sectionReadiness`,
  reviewTarget: reportReviewTargetSchema.$id,
  ownerReviewTargetReceipt: `${ownerReportReviewTargetApiSchema.$id}#/$defs/receipt`,
};
for (const ref of Object.values(validatorRefs)) {
  const validator = ajv.getSchema(ref);
  if (!validator || '$async' in validator) {
    throw new Error(`Research report API validator is unavailable or asynchronous: ${ref}`);
  }
}

// Ajv's ESM output still reaches its runtime helpers through `require("<module>").<member>`.
// Replace each one with an ESM namespace import resolved the same way under Node and Vite:
// Node exposes module.exports as the namespace default, Vite exposes the __esModule exports directly.
const runtimeImports = new Map();
const body = standaloneCode(ajv, validatorRefs).replace(/require\("([^"]+)"\)\.(\w+)/g, (_match, moduleId, member) => {
  const key = `${moduleId}#${member}`;
  if (!runtimeImports.has(key)) {
    runtimeImports.set(key, { moduleId, member, name: `ajvRuntime${runtimeImports.size}` });
  }
  return runtimeImports.get(key).name;
});
if (/\brequire\(|new Function|\beval\(/.test(body)) {
  throw new Error('Generated report validators must not use require, new Function or eval');
}

const namespaceImports = [...new Set([...runtimeImports.values()].map(({ moduleId }) => moduleId))]
  .map((moduleId, index) => ({ moduleId, namespace: `ajvModule${index}` }));
const namespaceFor = new Map(namespaceImports.map(({ moduleId, namespace }) => [moduleId, namespace]));

const header = [
  '// Generated by scripts/generate-report-validators.mjs. Do not edit.',
  '/* eslint-disable */',
  ...namespaceImports.map(({ moduleId, namespace }) => `import * as ${namespace} from ${JSON.stringify(`${moduleId}.js`)};`),
  'function ajvRuntime(namespace, member) {',
  "  if (member !== 'default') return namespace[member] ?? namespace.default?.[member];",
  '  const exported = namespace.default;',
  '  return exported && exported.__esModule ? exported.default : exported;',
  '}',
  ...[...runtimeImports.values()].map(({ moduleId, member, name }) =>
    `const ${name} = ajvRuntime(${namespaceFor.get(moduleId)}, ${JSON.stringify(member)});`),
].join('\n');

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${header}\n${body.replace(/^"use strict";\s*/, '')}\n`, 'utf8');

// Persona is a new namespace. Compile it after the historical body and isolate
// its generated names so every existing validator byte remains unchanged.
for (const [relative, uri] of [
  ['contracts/foundation/shopee-collection.schema.json', 'foundation/shopee-collection'],
  ['contracts/foundation/shopee-private-collection.schema.json', 'foundation/shopee-private-collection'],
  ['contracts/foundation/shopee-private-rows.schema.json', 'foundation/shopee-private-rows'],
  ['contracts/foundation/shopee-private-projection.schema.json', 'foundation/shopee-private-projection'],
]) ajv.addSchema(await readSchema(relative), `https://tdn.local/contracts/${uri}.schema.json`);
const personaSchema = await readSchema('contracts/analysis/automation-insight-persona.schema.json');
const personaApiSchema = await readSchema('contracts/api/research-automation-insight-persona-api.schema.json');
ajv.addSchema(personaSchema);
// Compile only the original four aliases here. New report aliases have their
// own canonical compilation below; old persona validator bytes stay frozen.
const personaReportAliases = new Set(['personaReportRequest', 'personaSelectedReport']);
ajv.addSchema({ ...personaApiSchema,
  $defs: Object.fromEntries(Object.entries(personaApiSchema.$defs).filter(([key]) => !personaReportAliases.has(key))),
  oneOf: personaApiSchema.oneOf.filter(item => !personaReportAliases.has(item.$ref.split('/').at(-1))),
});
const personaRefs = {
  insightPersonaRequest: `${personaApiSchema.$id}#/$defs/request`,
  insightPersonaResponse: `${personaApiSchema.$id}#/$defs/response`,
  insightPersonaView: `${personaApiSchema.$id}#/$defs/view`,
  insightPersonaEntry: `${personaApiSchema.$id}#/$defs/entry`,
};
for (const ref of Object.values(personaRefs)) {
  const validator = ajv.getSchema(ref);
  if (!validator || '$async' in validator) throw new Error(`Persona validator unavailable: ${ref}`);
}
const personaRuntimeImports = new Map();
const personaBody = standaloneCode(ajv, personaRefs)
  .replace(/require\("([^"]+)"\)\.(\w+)/g, (_match, moduleId, member) => {
    const key = `${moduleId}#${member}`;
    if (!personaRuntimeImports.has(key)) personaRuntimeImports.set(key, {
      moduleId, member, name: `personaRuntime${personaRuntimeImports.size}`,
    });
    return personaRuntimeImports.get(key).name;
  }).replace(/export const /g, 'const ').replace(/^"use strict";\s*/, '');
if (/\brequire\(|new Function|\beval\(/.test(personaBody)) throw new Error('Persona validators must be CSP-safe');
const personaModules = [...new Set([...personaRuntimeImports.values()].map(item => item.moduleId))]
  .map((moduleId, index) => ({ moduleId, namespace: `personaModule${index}` }));
const personaModuleFor = new Map(personaModules.map(item => [item.moduleId, item.namespace]));
const personaHeader = [
  ...personaModules.map(item => `import * as ${item.namespace} from ${JSON.stringify(`${item.moduleId}.js`)};`),
  ...[...personaRuntimeImports.values()].map(item =>
    `const ${item.name} = ajvRuntime(${personaModuleFor.get(item.moduleId)}, ${JSON.stringify(item.member)});`),
].join('\n');
const personaExports = Object.keys(personaRefs);
await fs.appendFile(outputPath, `${personaHeader}\nconst personaValidators = (() => {\n${personaBody}\nreturn { ${personaExports.join(', ')} };\n})();\n${personaExports.map(name => `export const ${name} = personaValidators.${name};`).join('\n')}\n`, 'utf8');

// Selected persona reports are additive after the frozen four persona guards.
// Their isolated scope also preserves all historical validator output bytes.
const personaReportSchema = await readSchema('contracts/analysis/automation-insight-persona-report.schema.json');
ajv.addSchema(personaReportSchema);
const personaReportRefs = {
  insightPersonaReportRevision: `${personaReportSchema.$id}#/$defs/request`,
  insightPersonaSelectedReport: `${personaReportSchema.$id}#/$defs/selectedSnapshot`,
};
for (const ref of Object.values(personaReportRefs)) {
  const validator = ajv.getSchema(ref);
  if (!validator || '$async' in validator) throw new Error(`Persona report validator unavailable: ${ref}`);
}
const personaReportRuntimeImports = new Map();
const personaReportBody = standaloneCode(ajv, personaReportRefs)
  .replace(/require\("([^"]+)"\)\.(\w+)/g, (_match, moduleId, member) => {
    const key = `${moduleId}#${member}`;
    if (!personaReportRuntimeImports.has(key)) personaReportRuntimeImports.set(key, {
      moduleId, member, name: `personaReportRuntime${personaReportRuntimeImports.size}`,
    });
    return personaReportRuntimeImports.get(key).name;
  }).replace(/export const /g, 'const ').replace(/^"use strict";\s*/, '');
if (/\brequire\(|new Function|\beval\(/.test(personaReportBody)) throw new Error('Persona report validators must be CSP-safe');
const personaReportModules = [...new Set([...personaReportRuntimeImports.values()].map(item => item.moduleId))]
  .map((moduleId, index) => ({ moduleId, namespace: `personaReportModule${index}` }));
const personaReportModuleFor = new Map(personaReportModules.map(item => [item.moduleId, item.namespace]));
const personaReportHeader = [
  ...personaReportModules.map(item => `import * as ${item.namespace} from ${JSON.stringify(`${item.moduleId}.js`)};`),
  ...[...personaReportRuntimeImports.values()].map(item =>
    `const ${item.name} = ajvRuntime(${personaReportModuleFor.get(item.moduleId)}, ${JSON.stringify(item.member)});`),
].join('\n');
const personaReportExports = Object.keys(personaReportRefs);
await fs.appendFile(outputPath, `${personaReportHeader}\nconst personaReportValidators = (() => {\n${personaReportBody}\nreturn { ${personaReportExports.join(', ')} };\n})();\n${personaReportExports.map(name => `export const ${name} = personaReportValidators.${name};`).join('\n')}\n`, 'utf8');
