-- =====================================================================
-- Remove the auto-generated project code (e.g. MSH-2026-001).
-- It was not a BRD requirement; projects are identified by their title and id.
-- Downloaded file names now use the project title instead.
-- =====================================================================
ALTER TABLE projects DROP COLUMN IF EXISTS code;
