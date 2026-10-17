-- Origin of each run PDF (S25b): an owner upload or an automatic capture of the run.
-- Question planning asks owner uploads first, so automatic report PDFs never take the
-- per-run question cap from them. Rows written before this column existed were owner
-- uploads or provider captures; they default to UPLOAD, which only keeps them first.
-- An owner upload of bytes already captured turns the row into UPLOAD, never the reverse.
-- Never apply this migration to runtime data as part of implementation tests.
ALTER TABLE analysis_pageindex_run_pdfs
  ADD COLUMN origin TEXT NOT NULL DEFAULT 'UPLOAD' CHECK (origin IN ('UPLOAD','CAPTURE'));
