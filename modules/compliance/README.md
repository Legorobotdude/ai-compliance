# Compliance Module

Owns BOM + certificate ingestion, normalization, merge/status projections, and impact-ready datasets.

- Parsers for CSV/JSON/XML (plus adapters to CORA for PDFs).
- Data mappers for `bom_subassemblies`, `bom_components`, `certificates`, `certificate_findings`.
- Status/impact calculators and cached views powering `/merged` and `/impact/predict`.
- Emits ingestion issues when supplier mappings or concentration values are missing.
