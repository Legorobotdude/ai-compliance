import { extname } from 'node:path';
import { Buffer } from 'node:buffer';
import JSZip from 'jszip';
import { parse as parseCsv } from 'csv-parse/sync';
import type { BomAssemblyInput, BomUploadDocument } from '../dtos/bom-dtos.js';
import type { BomUploadResponse } from '../dtos/bom-dtos.js';
import { BomIngestionError } from '../errors.js';

export interface ParsedBomAssemblies {
  assemblies: BomAssemblyInput[];
  issues: BomUploadResponse['issues'];
}

interface AssemblyQueueItem {
  node: unknown;
  parentId?: string;
}

const ISSUE_UPLOAD_ERROR = 'UPLOAD_ERROR';

export async function extractAssembliesFromRequest(
  assemblies?: BomAssemblyInput[],
  document?: BomUploadDocument
): Promise<ParsedBomAssemblies> {
  if (assemblies && assemblies.length > 0) {
    return { assemblies, issues: [] };
  }
  if (!document) {
    throw new BomIngestionError('BOM upload requires either assemblies or a document payload');
  }
  const buffer = decodeDocument(document);
  if (isZip(document, buffer)) {
    return parseZipArchive(buffer);
  }
  if (isJson(document, buffer)) {
    return parseJsonDocument(buffer.toString('utf8'), document.filename);
  }
  if (isCsv(document)) {
    return parseCsvDocument(buffer.toString('utf8'), document.filename);
  }
  throw new BomIngestionError(`Unsupported BOM document type: ${document.mimeType ?? document.filename}`);
}

function decodeDocument(document: BomUploadDocument): Buffer {
  const encoding = document.encoding ?? 'base64';
  try {
    return Buffer.from(document.content, encoding);
  } catch (error) {
    throw new BomIngestionError(`Unable to decode document ${document.filename}`, [
      { reason: (error as Error).message, file: document.filename }
    ]);
  }
}

function isZip(document: BomUploadDocument, buffer: Buffer) {
  if (document.mimeType.toLowerCase().includes('zip')) {
    return true;
  }
  return document.filename.toLowerCase().endsWith('.zip') || buffer.subarray(0, 2).toString() === 'PK';
}

function isJson(document: BomUploadDocument, buffer: Buffer) {
  if (document.mimeType.toLowerCase().includes('json')) {
    return true;
  }
  if (document.filename.toLowerCase().endsWith('.json')) {
    return true;
  }
  const trimmed = buffer.toString('utf8').trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function isCsv(document: BomUploadDocument) {
  if (document.mimeType.toLowerCase().includes('csv')) {
    return true;
  }
  return document.filename.toLowerCase().endsWith('.csv');
}

async function parseZipArchive(buffer: Buffer): Promise<ParsedBomAssemblies> {
  const zip = await JSZip.loadAsync(buffer);
  const assemblyMap = new Map<string, BomAssemblyInput>();
  const issues: BomUploadResponse['issues'] = [];
  let parsedFiles = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) {
      continue;
    }
    const ext = extname(entry.name).toLowerCase();
    const fileBuffer = await entry.async('nodebuffer');
    if (ext === '.json') {
      const parsed = parseJsonDocument(fileBuffer.toString('utf8'), entry.name);
      mergeAssemblies(assemblyMap, parsed.assemblies);
      issues.push(...parsed.issues);
      parsedFiles++;
    } else if (ext === '.csv') {
      const parsed = parseCsvDocument(fileBuffer.toString('utf8'), entry.name);
      mergeAssemblies(assemblyMap, parsed.assemblies);
      issues.push(...parsed.issues);
      parsedFiles++;
    }
  }
  if (parsedFiles === 0) {
    throw new BomIngestionError('ZIP archive does not include JSON or CSV BOM files', [
      { reason: 'unsupported_zip_contents' }
    ]);
  }
  return {
    assemblies: Array.from(assemblyMap.values()),
    issues
  };
}

function parseJsonDocument(text: string, filename: string): ParsedBomAssemblies {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new BomIngestionError(`Unable to parse JSON file ${filename}`, [
      { file: filename, reason: (error as Error).message }
    ]);
  }
  const issues: BomUploadResponse['issues'] = [];
  const assemblyMap = new Map<string, BomAssemblyInput>();
  const queue = extractAssemblyNodes(payload);
  if (queue.length === 0) {
    throw new BomIngestionError(`JSON file ${filename} does not contain assemblies`);
  }
  while (queue.length > 0) {
    const { node, parentId } = queue.shift()!;
    if (!isRecord(node)) {
      issues.push({
        code: ISSUE_UPLOAD_ERROR,
        message: `Invalid assembly definition in ${filename}`
      });
      continue;
    }
    const recordNode = node as Record<string, unknown>;
    const assemblyId = readString(recordNode.assemblyId ?? recordNode.assembly_id ?? recordNode.id ?? recordNode.code);
    if (!assemblyId) {
      issues.push({
        code: ISSUE_UPLOAD_ERROR,
        message: `Missing assembly id in ${filename}`
      });
      continue;
    }
    const target = upsertAssembly(assemblyMap, assemblyId, recordNode, parentId);
    const components = extractComponents(recordNode);
    const rawComponentsValue = (recordNode as { components?: unknown }).components;
    if (components.length === 0 && rawComponentsValue && !Array.isArray(rawComponentsValue)) {
      issues.push({
        code: ISSUE_UPLOAD_ERROR,
        message: `Assembly ${assemblyId} components malformed in ${filename}`
      });
    }
    for (const component of components) {
      const parsedComponent = toComponent(component, filename, issues);
      if (parsedComponent) {
        target.components.push(parsedComponent);
      }
    }
    const children = extractChildren(recordNode);
    for (const child of children) {
      queue.push({ node: child, parentId: assemblyId });
    }
  }
  return { assemblies: Array.from(assemblyMap.values()), issues };
}

function parseCsvDocument(text: string, filename: string): ParsedBomAssemblies {
  const issues: BomUploadResponse['issues'] = [];
  let rows: Array<Record<string, string>>;
  try {
    rows = parseCsv(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    }) as Array<Record<string, string>>;
  } catch (error) {
    throw new BomIngestionError(`Unable to parse CSV file ${filename}`, [
      { file: filename, reason: (error as Error).message }
    ]);
  }
  if (rows.length === 0) {
    throw new BomIngestionError(`CSV file ${filename} is empty`);
  }
  const assemblyMap = new Map<string, BomAssemblyInput>();
  for (const row of rows) {
    const normalized = normalizeKeys(row);
    const assemblyId = readString(
      normalized.assembly_id ??
        normalized.assemblyid ??
        normalized.assembly ??
        normalized.subassembly_id ??
        normalized.subassemblyid ??
        normalized.subassembly ??
        normalized.assembly_code
    );
    if (!assemblyId) {
      issues.push({
        code: ISSUE_UPLOAD_ERROR,
        message: `Missing assembly_id in CSV row for ${filename}`
      });
      continue;
    }
    const parentAssemblyId = readString(
      normalized.parent_assembly_id ?? normalized.parentassemblyid ?? normalized.parent
    );
    const target = upsertAssembly(assemblyMap, assemblyId, {
      name: normalized.assembly_name ?? normalized.name,
      parentAssemblyId
    });
    const component = toComponent(
      {
        partNumber: normalized.part_number ?? normalized.partnumber ?? normalized.part,
        material: normalized.material ?? normalized.description ?? normalized.material_name,
        weightG:
          normalized.weight_g ?? normalized.weightg ?? deriveWeightByUnit(normalized.weight, normalized.weight_unit, 'g'),
        weightMg:
          normalized.weight_mg ??
          normalized.weightmg ??
          deriveWeightByUnit(normalized.weight, normalized.weight_unit, 'mg')
      },
      filename,
      issues
    );
    if (component) {
      if (normalized.parent_assembly_id || normalized.parentassemblyid || parentAssemblyId) {
        target.parentAssemblyId = parentAssemblyId ?? null;
      }
      target.components.push(component);
    }
  }
  return { assemblies: Array.from(assemblyMap.values()), issues };
}

function mergeAssemblies(map: Map<string, BomAssemblyInput>, assemblies: BomAssemblyInput[]) {
  for (const assembly of assemblies) {
    const existing = map.get(assembly.assemblyId);
    if (!existing) {
      map.set(assembly.assemblyId, {
        assemblyId: assembly.assemblyId,
        name: assembly.name,
        parentAssemblyId: assembly.parentAssemblyId ?? null,
        components: [...assembly.components]
      });
    } else {
      if (!existing.name && assembly.name) {
        existing.name = assembly.name;
      }
      if (!existing.parentAssemblyId && assembly.parentAssemblyId) {
        existing.parentAssemblyId = assembly.parentAssemblyId;
      }
      existing.components.push(...assembly.components);
    }
  }
}

function upsertAssembly(
  map: Map<string, BomAssemblyInput>,
  assemblyId: string,
  node: { name?: string; parentAssemblyId?: string | null } | Record<string, unknown>,
  parentFallback?: string
): BomAssemblyInput {
  const existing = map.get(assemblyId);
  if (existing) {
    if (!existing.name && typeof node === 'object' && node && 'name' in node && typeof node.name === 'string') {
      existing.name = node.name;
    }
    if (!existing.parentAssemblyId) {
      const parent =
        (typeof node === 'object' && node && 'parentAssemblyId' in node ? (node as { parentAssemblyId?: string }).parentAssemblyId : undefined) ??
        parentFallback ??
        null;
      existing.parentAssemblyId = parent;
    }
    return existing;
  }
  const parent =
    (typeof node === 'object' && node && 'parentAssemblyId' in node ? (node as { parentAssemblyId?: string | null }).parentAssemblyId : undefined) ??
    parentFallback ??
    null;
  const assembly: BomAssemblyInput = {
    assemblyId,
    name:
      (typeof node === 'object' && node && 'name' in node && typeof node.name === 'string' ? node.name : undefined) ??
      assemblyId,
    parentAssemblyId: parent,
    components: []
  };
  map.set(assemblyId, assembly);
  return assembly;
}

function extractAssemblyNodes(payload: unknown): AssemblyQueueItem[] {
  if (Array.isArray(payload)) {
    return payload.map((node) => ({ node, parentId: undefined }));
  }
  if (isRecord(payload)) {
    if (Array.isArray(payload.subassemblies)) {
      return payload.subassemblies.map((node: unknown) => ({ node, parentId: undefined }));
    }
    if (Array.isArray(payload.assemblies)) {
      return payload.assemblies.map((node: unknown) => ({ node, parentId: undefined }));
    }
  }
  return [];
}

function extractComponents(node: unknown): Array<Record<string, unknown>> {
  if (!isRecord(node)) {
    return [];
  }
  if (Array.isArray(node.components)) {
    return node.components as Array<Record<string, unknown>>;
  }
  if (Array.isArray(node.parts)) {
    return node.parts as Array<Record<string, unknown>>;
  }
  return [];
}

function extractChildren(node: unknown): Array<Record<string, unknown>> {
  if (!isRecord(node)) {
    return [];
  }
  const children = [];
  if (Array.isArray(node.subassemblies)) {
    children.push(...node.subassemblies);
  }
  if (Array.isArray(node.children)) {
    children.push(...node.children);
  }
  return children;
}

function toComponent(
  raw: Record<string, unknown>,
  filename: string,
  issues: BomUploadResponse['issues']
): BomAssemblyInput['components'][number] | null {
  const partNumber = readString(
    raw.partNumber ?? raw.part_number ?? raw.part ?? raw.id ?? raw.code ?? raw.partNum ?? raw.partnum
  );
  if (!partNumber) {
    issues.push({
      code: ISSUE_UPLOAD_ERROR,
      message: `Component missing part number in ${filename}`
    });
    return null;
  }
  const material = readString(raw.material ?? raw.material_name ?? raw.description ?? raw.materialName);
  const weightG = toNumber(raw.weightG ?? raw.weight_g ?? raw.weight ?? raw.weightValue, raw.weightUnit ?? raw.unit, 'g');
  const weightMg = toNumber(
    raw.weightMg ?? raw.weight_mg ?? raw.weight ?? raw.weightValue,
    raw.weightUnit ?? raw.unit,
    'mg'
  );
  return {
    partNumber,
    material: material ?? null,
    weightG: weightG ?? undefined,
    weightMg: weightMg ?? undefined
  };
}

function normalizeKeys(row: Record<string, string>) {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.trim().toLowerCase()] = value;
  }
  return normalized;
}

function deriveWeightByUnit(value: unknown, unit: unknown, target: 'g' | 'mg') {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return undefined;
  }
  if (typeof unit !== 'string') {
    return undefined;
  }
  const normalizedUnit = unit.trim().toLowerCase();
  if (normalizedUnit === target) {
    return parsedValue;
  }
  if (normalizedUnit === 'g' && target === 'mg') {
    return parsedValue * 1000;
  }
  if (normalizedUnit === 'mg' && target === 'g') {
    return parsedValue / 1000;
  }
  return undefined;
}

function toNumber(value: unknown, unit: unknown, target: 'g' | 'mg') {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return deriveWeightByUnit(value, unit, target);
}

function readString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
