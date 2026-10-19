# Sector 113 source-data investigation

## Scope

Read-only review of the 14 records with `Locality = Sector 113` and `Area = 1700` sqft. No model or dataset values were changed.

## Findings

All 14 records describe the same apparent listing configuration:

- Property Type: `3 BHK Apartment in M3M Capital`
- Locality: `Sector 113`
- Society: `M3M Capital`
- Flat Type: `Apartment`
- BHK: `3`
- Status: `Under Construction`
- RERA: `Approved by RERA`
- Area: `1700` sqft

The rows split into two internally consistent groups:

| Records | Price | Rate per sqft | Arithmetic check |
|---:|---:|---:|---|
| 7 | ₹3.40 crore | ₹20,000 | 1,700 × 20,000 = ₹3.40 crore |
| 7 | ₹37.40 crore | ₹2,20,000 | 1,700 × 2,20,000 = ₹37.40 crore |

## Source fields

The dataset has a `Company Name` column, but it is blank for all 14 rows. The available Builder Name values differ between rows, including `Alpine Real estate`, `Upscale Landholdings`, `Neeraj Co`, `properties for sale in Gurgaon`, and others. No original listing URL, source document, or external evidence is present in the CSV, so the correct price cannot be established from this dataset alone.

## Decision

Both groups are preserved. The ₹37.40 crore group is suspicious because its ₹2,20,000 per sqft rate is an extreme outlier, but arithmetic consistency does not prove it is wrong. The active Random Forest and original dataset remain frozen for final testing. Predictions using these data should be documented as model estimates, not guaranteed market valuations.
