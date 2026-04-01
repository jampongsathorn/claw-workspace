---
name: n-infinite-bigquery
description: Query N_Infinite BigQuery dataset (project: airy-torus-404308). Use when asking about Store, COGs, commissions, restaurant data, or anything in the N_Infinite dataset. Triggers on: "N_Infinite", "Store table", "COGs", "restaurant", "foodpanda", "grab", "lineman", "commission", "n-infinite"
---

# N_Infinite BigQuery

Access BigQuery dataset for N_Infinite project (project ID: `airy-torus-404308`).

## Connection

| Setting | Value |
|---------|-------|
| **MCP Server** | `@ergut/mcp-bigquery-server` |
| **Project ID** | `airy-torus-404308` |
| **Key file** | `/Users/pongsathorn/Documents/Key/airy-torus-404308-d949b49c7f05-portal-backend.json` |
| **Service Account** | `portal-backend@airy-torus-404308.iam.gserviceaccount.com` |
| **Location** | US |

## Datasets in airy-torus-404308

```
Final_Transactions, Invoice, Landing_Transactions, N_Infinite,
N_Infinite, Sheets, Transactions_Foodpanda, Transactions_Grab,
Transactions_LINEMan, database_web_app, grab_sales,
power_bi_dataset, temp_ds, web_portal_dataset
```

## N_Infinite Dataset Schema

### Tables
- `Store` ✅ (verified)
- `COGs_Comm`
- `effective_cogs`

### Store Table Columns

| Column | Type | Description |
|--------|------|-------------|
| `Advertiser_Name` | STRING | |
| `Branch` | STRING | |
| `COGs` | FLOAT64 | Cost of goods |
| `Category` | STRING | |
| `City` | STRING | |
| `Date` | DATE | |
| `FP_Commission` | FLOAT64 | Foodpanda commission |
| `FP_N_Infinite_Fee` | FLOAT64 | Foodpanda N_Infinite fee |
| `FP_VAT` | STRING | Foodpanda VAT |
| `Grab_ID` | STRING | |
| `Grab_VAT` | STRING | Grab VAT |
| `LM_Commission` | FLOAT64 | Lineman commission |
| `LM_ID` | INT64 | Lineman ID |
| `LM_N_Infinite_Fee` | FLOAT64 | Lineman N_Infinite fee |
| `LM_VAT` | STRING | Lineman VAT |
| `Legal_Entity_Name` | STRING | |
| `Merchant_ENG` | STRING | |
| `Merchant_ID` | STRING | |
| `N_Infinite_Fee` | FLOAT64 | |
| `Restaurant` | STRING | |
| `Short_Name` | STRING | |
| `Store_ID` | STRING | |
| `Store_Name` | STRING | |
| `Store_Name_ENG` | STRING | |
| `Tax_ID` | INT64 | |
| `Team` | STRING | |
| `VAT` | STRING | |
| `effective_cost` | FLOAT64 | |
| `platform` | STRING | foodpanda/grab/lineman |
| `vendor_code` | STRING | |

## Query Examples

```sql
-- List all tables in N_Infinite
SELECT table_name FROM `N_Infinite.INFORMATION_SCHEMA.TABLES`

-- Get 100 rows from Store
SELECT * FROM `airy-torus-404308.N_Infinite.Store` LIMIT 100

-- Store schema
SELECT column_name, data_type
FROM `N_Infinite.INFORMATION_SCHEMA.COLUMNS`
ORDER BY column_name
```

## Notes
- Dataset name is **case-sensitive**: `N_Infinite` (not `n_infinite`)
- Table name is **case-sensitive**: `Store` (not `store`)
- MCP server: `@ergut/mcp-bigquery-server`
- Use backtick syntax for table references in MCP queries
