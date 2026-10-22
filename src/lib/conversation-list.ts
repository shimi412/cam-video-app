import { pool } from "@/db";
import type { ProviderMode } from "./providers/mode";
/** Filter before pagination: old offline tests cannot displace real projects. */
export async function listConversations(mode:ProviderMode){
 const result=await pool.query(`SELECT c.id,c.mode,c.created_at AS "createdAt",
 coalesce((SELECT nullif(j.title,'') FROM jobs j WHERE j.conversation_id=c.id AND j.deleted_at IS NULL AND j.params->>'executionMode'=$1 AND j.title IS NOT NULL ORDER BY j.created_at DESC,j.id DESC LIMIT 1),
 left(c.title,80),'Untitled video') AS title
 FROM conversations c
 WHERE (c.execution_mode=$1 OR c.execution_mode IS NULL)
 AND NOT (EXISTS(SELECT 1 FROM jobs j WHERE j.conversation_id=c.id)
 AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.conversation_id=c.id AND j.deleted_at IS NULL AND j.params->>'executionMode'=$1))
 ORDER BY c.created_at DESC,c.id DESC LIMIT 100`,[mode]);
 return result.rows;
}
