# ACIR exports

Search-result exports from APHIS ACIR (`acir.aphis.usda.gov`), kept as a
worklist for curating `country_commodity_rules`.

**These are not rules and cannot be loaded as rules.** The export columns are
Document Name, Port Group, Plant Parts, Process Type, Article Type and Document
URL. Nothing in them states admissibility, and there is no permit, phyto or
treatment flag. Those live only on the detail page each `Document URL` points
at. See `docs/reference-layer-curation.md` section 2.1.

Naming: `YYYY-MM-DD_<search-category>_<query>.csv`.

| File | Search | Query | Rows |
|---|---|---|---|
| `2026-08-25_not-for-planting_cocoa.csv` | Plants and Plant Products Not for Propagation | commodity common name `cocoa`, no country filter | 42 |
