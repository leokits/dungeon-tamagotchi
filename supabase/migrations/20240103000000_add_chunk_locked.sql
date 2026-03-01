-- Add 'locked' column to chunks table for area-purchase system
-- Locked chunks are visible but dim; players buy them with dust to unlock
ALTER TABLE chunks ADD COLUMN locked BOOLEAN NOT NULL DEFAULT true;
