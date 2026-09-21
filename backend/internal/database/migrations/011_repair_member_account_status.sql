-- Active library membership must imply that the user account can authenticate.
-- Do not change suspended accounts: only repair invitation-era pending accounts
-- that were already activated at the membership level.
UPDATE users u
SET status = 'active',
    updated_at = NOW()
WHERE u.status = 'pending'
  AND EXISTS (
    SELECT 1
    FROM group_members gm
    WHERE gm.user_id = u.id
      AND gm.status = 'active'
  );
