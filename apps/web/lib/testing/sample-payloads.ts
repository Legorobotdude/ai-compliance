export const SAMPLE_SUPPLIER_IDS = {
  zentech: 'df0a9c2c-1cfa-4d5f-8ef4-4abff724aa23',
  jinlong: '70d74bf8-87b7-42aa-bccf-ae4b30755b9d',
  everbright: '2ab35d24-e9db-45c2-9cb8-09c579190896'
} as const;

export const SAMPLE_DOCUMENT_IDS = {
  bom: 'e5062ac9-3498-40a3-a9dc-ad0f1792deee',
  rohs: 'f2941dc9-3126-4768-aede-91a5e406d11c',
  reach: '5ca845ca-d551-4ffa-be33-ccbe6c9554c8'
} as const;

const assemblies = [
  {
    assemblyId: 'SUB-001',
    name: 'Control Unit',
    parentAssemblyId: null,
    components: [
      { partNumber: 'CU-78901', material: 'Copper', weightG: 8.5 },
      { partNumber: 'CU-78902', material: 'Polycarbonate', weightG: 5.1 },
      { partNumber: 'CU-78903', material: 'Solder', weightMg: 1800 }
    ]
  },
  {
    assemblyId: 'SUB-002',
    name: 'Wireless Module',
    parentAssemblyId: null,
    components: [
      { partNumber: 'WM-88210', material: 'Tin-Plated Steel', weightG: 3.3 },
      { partNumber: 'WM-88211', material: 'Beryllium Copper', weightG: 1.2 },
      { partNumber: 'WM-88212', material: 'ABS', weightG: 6.0 }
    ]
  },
  {
    assemblyId: 'SUB-003',
    name: 'Battery Pack',
    parentAssemblyId: null,
    components: [
      { partNumber: 'BP-44001', material: 'Lithium Cobalt Oxide', weightG: 120.7 },
      { partNumber: 'BP-44002', material: 'Graphite', weightG: 23.5 },
      { partNumber: 'BP-44003', material: 'Nickel', weightG: 15.0 }
    ]
  }
];

const certificates = [
  {
    supplierId: SAMPLE_SUPPLIER_IDS.zentech,
    partNumber: 'CU-78901',
    type: 'ROHS',
    declarationDate: '2025-01-05',
    validUntil: '2026-01-05',
    thresholdPpm: 1000,
    sourceDocumentId: SAMPLE_DOCUMENT_IDS.rohs,
    findings: [
      {
        substanceName: 'Lead',
        concentrationValue: 0.04,
        concentrationUnit: '%',
        concentrationRaw: '0.04%'
      },
      {
        substanceName: 'Mercury',
        concentrationValue: 120,
        concentrationUnit: 'ppm',
        concentrationRaw: '120 ppm'
      }
    ]
  },
  {
    supplierId: SAMPLE_SUPPLIER_IDS.jinlong,
    partNumber: 'WM-88210',
    type: 'REACH',
    declarationDate: '2024-12-12',
    validUntil: '2025-12-12',
    thresholdPpm: 500,
    sourceDocumentId: SAMPLE_DOCUMENT_IDS.reach,
    findings: [
      {
        substanceName: 'Nickel Sulfate',
        concentrationValue: 0.05,
        concentrationUnit: '%',
        concentrationRaw: '0.05%'
      }
    ]
  }
];

export const SAMPLE_ASSEMBLIES = assemblies;
export const SAMPLE_CERTIFICATES = certificates;

export const SAMPLE_ASSEMBLIES_JSON = JSON.stringify(SAMPLE_ASSEMBLIES, null, 2);
export const SAMPLE_CERTIFICATES_JSON = JSON.stringify(SAMPLE_CERTIFICATES, null, 2);
