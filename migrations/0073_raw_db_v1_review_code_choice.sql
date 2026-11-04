-- db-v1 review labels with 10 themes (owner F439 to F442; R-RV04, R-RV05, R-RV07; KHUON-CSDL.md db-v1): `choice` holds the
-- option that set the polarity of an APP_JEV row (CHUA_DANHGIA for the wait row of the waitTheme). NULL for older rows,
-- NO_THEME rows, MCP_IMPORT rows and rows below the direction threshold. Every row and the insert-only triggers stay.
ALTER TABLE review_code ADD COLUMN choice TEXT;
