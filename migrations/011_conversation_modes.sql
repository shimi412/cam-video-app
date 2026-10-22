ALTER TABLE conversations ADD COLUMN execution_mode text CHECK(execution_mode IN ('mock','dryrun','fal'));
-- Keep all records. Classify historical discussions from their actual jobs.
UPDATE conversations c SET execution_mode=CASE
 WHEN EXISTS(SELECT 1 FROM jobs j WHERE j.conversation_id=c.id AND j.params->>'executionMode'='fal') THEN 'fal'
 WHEN EXISTS(SELECT 1 FROM jobs j WHERE j.conversation_id=c.id AND j.params->>'executionMode'='dryrun') THEN 'dryrun'
 ELSE 'mock' END
WHERE EXISTS(SELECT 1 FROM jobs j WHERE j.conversation_id=c.id AND j.params->>'executionMode' IN ('fal','dryrun','mock'));
