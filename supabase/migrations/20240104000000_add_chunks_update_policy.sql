-- Add UPDATE policy for chunks (was missing, causing buy-area to silently fail)
CREATE POLICY "chunks_update_own" ON chunks
  FOR UPDATE USING (
    dungeon_id IN (
      SELECT d.id FROM dungeons d
      JOIN players p ON d.player_id = p.id
      WHERE p.auth_id = auth.uid()
    )
  );
