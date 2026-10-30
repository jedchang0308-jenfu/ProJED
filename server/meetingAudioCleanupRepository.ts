import {randomUUID} from 'node:crypto';
import type {RuntimeConfig} from './config.js';
import type {RuntimeDatabase} from './db.js';
import {KernelError} from './errors.js';
import {runMeetingMaintenanceTransaction} from './meetingAsrRepository.js';
import type {MeetingAudioCleanupClaim,MeetingAudioCleanupRepository} from './meetingAudioCleanupWorker.js';
import {requireUuid} from './meetingCaptureInput.js';

function invalid():never{throw new KernelError('DB_BOUNDARY_INVALID','Meeting audio cleanup metadata is invalid',503);}
function uuid(value:unknown):string{
  try{return requireUuid(value,'Cleanup metadata');}catch{return invalid();}
}
function claimValue(value:unknown,id:string,token:string):MeetingAudioCleanupClaim|null{
  if(value===null)return null;
  if(!value||typeof value!=='object'||Array.isArray(value))invalid();
  const row=value as Record<string,unknown>;
  if(Object.keys(row).sort().join('|')!=='bytes|generation|key|leaseExpiresAtMs|leaseToken|obligationId|sha256|uploadOperationToken|uploadOutcome'
    ||row.obligationId!==id||row.leaseToken!==token||!Number.isSafeInteger(row.leaseExpiresAtMs)||Number(row.leaseExpiresAtMs)<1
    ||typeof row.key!=='string'||row.key.length<1||row.key.length>256
    ||!(row.generation===null||typeof row.generation==='string')
    ||!(row.uploadOperationToken===null||typeof row.uploadOperationToken==='string')
    ||!(row.sha256===null||typeof row.sha256==='string')
    ||!(row.bytes===null||(Number.isSafeInteger(row.bytes)&&Number(row.bytes)>=0&&Number(row.bytes)<=10*1024*1024))
    ||!(row.uploadOutcome===null||['pending','uploaded','unknown','rejected'].includes(String(row.uploadOutcome))))invalid();
  if(row.uploadOperationToken!==null)uuid(row.uploadOperationToken);
  return row as unknown as MeetingAudioCleanupClaim;
}

/** No actor or private source reads. Unknown COMMIT never starts another claim;
 * later executions recover the same obligation via its persisted lease/proof. */
export function createPostgresMeetingAudioCleanupRepository(options:{database:RuntimeDatabase;config:RuntimeConfig}):MeetingAudioCleanupRepository{
  const {database,config}=options;
  return {
    scan:async maxItems=>{
      if(!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>20)invalid();
      return runMeetingMaintenanceTransaction(database,config,async query=>{
        const result=await query<{items:unknown}>('SELECT projed_core.scan_meeting_audio_cleanup_v1($1::integer) AS items',[maxItems]);
        if(result.rows.length!==1||!Array.isArray(result.rows[0]?.items)||result.rows[0].items.length>maxItems)invalid();
        const items=result.rows[0].items.map(uuid);
        if(new Set(items).size!==items.length)invalid();return items;
      });
    },
    claim:async obligationId=>{
      const id=uuid(obligationId),token=randomUUID();
      return runMeetingMaintenanceTransaction(database,config,async query=>{
        const result=await query<{claim:unknown}>('SELECT projed_core.claim_meeting_audio_cleanup_v1($1::uuid,$2::uuid) AS claim',[id,token]);
        if(result.rows.length!==1)invalid();return claimValue(result.rows[0]?.claim,id,token);
      });
    },
    finish:async(claim,result)=>{
      const id=uuid(claim.obligationId),token=uuid(claim.leaseToken);
      return runMeetingMaintenanceTransaction(database,config,async query=>{
        const finished=await query<{finished:unknown}>('SELECT projed_core.finish_meeting_audio_cleanup_v1($1::uuid,$2::uuid,$3::jsonb) AS finished',
          [id,token,JSON.stringify(result)]);
        if(finished.rows.length!==1||typeof finished.rows[0]?.finished!=='boolean')invalid();return finished.rows[0].finished;
      });
    },
  };
}
