import {randomBytes,randomUUID} from 'node:crypto';
import type {ActorQueryPort} from './actorTransaction.js';
import {KernelError} from './errors.js';
import type {RagProvider} from './geminiRagProvider.js';

export type RagTransactionRunner = <T>(operation:(port:ActorQueryPort)=>Promise<T>)=>Promise<T>;
export interface RagIndexScope {readonly tenantId:string; readonly projectId:string|null;}
interface Claim {
  jobId:string;documentId:string;versionId:string;contentHash:string;token:string;
  chunks:Array<{id:string;content:string}>;
}
const MODEL='gemini-embedding-001';
const DIMENSIONS=3072;

export function validatedRagVector(input:readonly number[]):number[] {
  if (!Array.isArray(input)||input.length!==DIMENSIONS||input.some(v=>typeof v!=='number'||!Number.isFinite(Math.fround(v)))) {
    throw new KernelError('RAG_PROVIDER_INVALID_RESPONSE','Embedding is invalid',502);
  }
  const vector=input.map(Math.fround);
  if (!vector.some(v=>v!==0)) throw new KernelError('RAG_PROVIDER_INVALID_RESPONSE','Embedding has no direction',502);
  return vector;
}
function abort(signal:AbortSignal):void {if(signal.aborted)throw new KernelError('RAG_TIMEOUT','Index request was cancelled',504);}
function stale():never {throw new KernelError('RAG_INDEX_STALE','Index source or claim changed',409);}

async function readClaimChunks(port:ActorQueryPort,scope:RagIndexScope,claim:Claim,limit:number):Promise<Claim['chunks']> {
  await port.authorizeRagJobMutation(scope.tenantId,claim.documentId,claim.jobId,claim.token);
  const valid=await port.query(`
    SELECT job.id FROM projed_core.rag_sync_jobs job
    JOIN projed_core.documents document ON document.id=job.source_document_id AND document.tenant_id=job.tenant_id
    JOIN projed_core.document_versions version ON version.document_id=document.id AND version.tenant_id=document.tenant_id
      AND version.id=job.document_version_id
    WHERE job.tenant_id=$1::uuid AND job.id=$2::uuid AND job.status='running' AND job.lease_token=$3
      AND job.lease_expires_at>clock_timestamp() AND document.rag_enabled
      AND job.document_version_id=$4::uuid AND job.content_hash=$5 AND document.content_hash=$5
      AND version.content_hash=$5 AND version.version=(SELECT max(v.version) FROM projed_core.document_versions v
        WHERE v.tenant_id=document.tenant_id AND v.document_id=document.id)
  `,[scope.tenantId,claim.jobId,claim.token,claim.versionId,claim.contentHash]);
  if(valid.rows.length!==1)stale();
  const chunks=await port.query<{id:string;content:string}>(`
    SELECT chunk.id::text,chunk.content FROM projed_core.document_chunks chunk
    WHERE chunk.tenant_id=$1::uuid AND chunk.document_id=$2::uuid AND chunk.document_version_id=$3::uuid
      AND NOT EXISTS(SELECT 1 FROM projed_core.document_embeddings embedding
        WHERE embedding.tenant_id=chunk.tenant_id AND embedding.chunk_id=chunk.id AND embedding.provider='google'
          AND embedding.model=$4 AND embedding.dimensions=3072 AND embedding.content_hash=$5)
    ORDER BY chunk.chunk_index,chunk.id LIMIT $6
  `,[scope.tenantId,claim.documentId,claim.versionId,MODEL,claim.contentHash,limit]);
  return chunks.rows;
}

async function claimNext(run:RagTransactionRunner,scope:RagIndexScope,limit:number):Promise<Claim|null> {
  const proposed:{claim?:Claim}={};
  try {
    return await run(async port=>{
      const document=await port.query<{id:string;version_id:string;content_hash:string}>(`
        SELECT document.id::text,version.id::text AS version_id,document.content_hash
        FROM projed_core.documents document
        JOIN LATERAL(SELECT v.id,v.content_hash FROM projed_core.document_versions v
          WHERE v.tenant_id=document.tenant_id AND v.document_id=document.id ORDER BY v.version DESC LIMIT 1) version
          ON version.content_hash=document.content_hash
        WHERE document.tenant_id=$1::uuid AND ($2::uuid IS NULL OR document.project_id=$2::uuid)
          AND document.rag_enabled AND document.content_hash IS NOT NULL
          AND EXISTS(SELECT 1 FROM projed_core.document_chunks c WHERE c.tenant_id=document.tenant_id
            AND c.document_id=document.id AND c.document_version_id=version.id)
          AND NOT EXISTS(SELECT 1 FROM projed_core.rag_sync_jobs busy WHERE busy.tenant_id=document.tenant_id
            AND busy.source_document_id=document.id AND busy.status='running' AND busy.lease_expires_at>clock_timestamp()
            AND busy.provider='google' AND busy.target_store_id IS NULL
            AND (busy.document_version_id=version.id OR busy.document_version_id IS NULL))
          AND NOT EXISTS(SELECT 1 FROM projed_core.rag_sync_jobs terminal WHERE terminal.tenant_id=document.tenant_id
            AND terminal.source_document_id=document.id AND terminal.status='failed' AND terminal.attempt_count>=3
            AND terminal.provider='google' AND terminal.target_store_id IS NULL
            AND terminal.document_version_id=version.id AND terminal.content_hash=document.content_hash)
          AND (EXISTS(SELECT 1 FROM projed_core.document_chunks c WHERE c.tenant_id=document.tenant_id
            AND c.document_id=document.id AND c.document_version_id=version.id AND NOT EXISTS(
              SELECT 1 FROM projed_core.document_embeddings e WHERE e.tenant_id=c.tenant_id AND e.chunk_id=c.id
                AND e.provider='google' AND e.model=$3 AND e.dimensions=3072 AND e.content_hash=document.content_hash))
            OR EXISTS(SELECT 1 FROM projed_core.rag_sync_jobs j WHERE j.tenant_id=document.tenant_id
              AND j.source_document_id=document.id AND j.status IN('pending','running','failed')
              AND j.provider='google' AND j.target_store_id IS NULL
              AND (j.document_version_id=version.id OR j.document_version_id IS NULL)
              AND (j.content_hash=document.content_hash OR j.content_hash IS NULL)
              AND (j.metadata->>'contentHash' IS NULL OR j.metadata->>'contentHash'=document.content_hash)))
        ORDER BY document.updated_at,document.id LIMIT 1
      `,[scope.tenantId,scope.projectId,MODEL]);
      const row=document.rows[0];if(!row)return null;
      const gate=await port.query<{acquired:boolean}>(`SELECT pg_try_advisory_xact_lock(
        hashtextextended('projed:rag-document:'||$1,0)) AS acquired`,[row.id]);
      if(gate.rows[0]?.acquired!==true)return null;
      const jobs=await port.query<{id:string}>(`
        SELECT id::text FROM projed_core.rag_sync_jobs WHERE tenant_id=$1::uuid AND source_document_id=$2::uuid
          AND provider='google' AND target_store_id IS NULL AND status IN('pending','running','failed')
          AND attempt_count<3 AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())
          AND (document_version_id=$3::uuid OR document_version_id IS NULL)
          AND (content_hash=$4 OR content_hash IS NULL)
          AND (metadata->>'contentHash' IS NULL OR metadata->>'contentHash'=$4)
        ORDER BY created_at,id LIMIT 1
      `,[scope.tenantId,row.id,row.version_id,row.content_hash]);
      const jobId=jobs.rows[0]?.id??randomUUID();
      const token=randomBytes(32).toString('hex');
      const claim:Claim={jobId,documentId:row.id,versionId:row.version_id,contentHash:row.content_hash,token,chunks:[]};
      await port.authorizeRagJobMutation(scope.tenantId,row.id,jobId,token);
      // SELECT FOR SHARE also needs an UPDATE USING policy. The exact scope
      // allows only this lock; its WITH CHECK false never permits a document edit.
      const current=await port.query(`SELECT id FROM projed_core.documents
        WHERE tenant_id=$1::uuid AND id=$2::uuid AND rag_enabled AND content_hash=$3 FOR SHARE`,
      [scope.tenantId,row.id,row.content_hash]);
      if(current.rows.length!==1)return null;
      const busy=await port.query(`SELECT id FROM projed_core.rag_sync_jobs
        WHERE tenant_id=$1::uuid AND source_document_id=$2::uuid AND status='running'
          AND provider='google' AND target_store_id IS NULL
          AND lease_expires_at>clock_timestamp() AND (document_version_id=$3::uuid OR document_version_id IS NULL)`,
      [scope.tenantId,row.id,row.version_id]);
      if(busy.rows.length)return null;
      if(!jobs.rows[0]) await port.query(`
        INSERT INTO projed_core.rag_sync_jobs(id,tenant_id,provider,target_store_id,source_document_id,
          document_version_id,content_hash,status,metadata)
        VALUES($1::uuid,$2::uuid,'google',NULL,$3::uuid,$4::uuid,$5,'pending','{}'::jsonb)
      `,[jobId,scope.tenantId,row.id,row.version_id,row.content_hash]);
      const acquired=await port.query(`
        UPDATE projed_core.rag_sync_jobs SET status='running',document_version_id=$4::uuid,content_hash=$5,
          lease_token=$3,lease_expires_at=clock_timestamp()+interval '30 seconds',attempt_count=attempt_count+1,
          error=NULL,updated_at=now()
        WHERE tenant_id=$1::uuid AND id=$2::uuid AND status IN('pending','running','failed','synced')
          AND attempt_count<3 AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())
          AND (document_version_id=$4::uuid OR document_version_id IS NULL) AND (content_hash=$5 OR content_hash IS NULL)
        RETURNING id
      `,[scope.tenantId,jobId,token,row.version_id,row.content_hash]);
      if(acquired.rowCount!==1)return null;
      proposed.claim=claim;
      claim.chunks=await readClaimChunks(port,scope,claim,limit);
      return claim;
    });
  }catch(error){
    if(!(error instanceof KernelError)||error.code!=='DB_COMMIT_UNKNOWN'||!proposed.claim)throw error;
    // A lost claim acknowledgement is read back, never claimed again.
    const claim=proposed.claim;
    claim.chunks=await run(port=>readClaimChunks(port,scope,claim,limit));
    return claim;
  }
}

async function settle(
  run:RagTransactionRunner,scope:RagIndexScope,claim:Claim,
  vectors:Array<{chunkId:string;values:number[]}>,failure:unknown,signal:AbortSignal,
):Promise<void> {
  abort(signal);
  try {
    await run(async port=>{
      // Follow mirror's document -> job lock order; never hold a DB lease while embedding.
      await readClaimChunks(port,scope,claim,1);
      const document=await port.query(`SELECT id FROM projed_core.documents
        WHERE tenant_id=$1::uuid AND id=$2::uuid AND content_hash=$3 AND rag_enabled FOR SHARE`,
      [scope.tenantId,claim.documentId,claim.contentHash]);
      if(document.rows.length!==1)stale();
      const locked=await port.query(`SELECT id FROM projed_core.rag_sync_jobs
        WHERE tenant_id=$1::uuid AND id=$2::uuid AND status='running' AND lease_token=$3
          AND lease_expires_at>clock_timestamp() FOR UPDATE`,[scope.tenantId,claim.jobId,claim.token]);
      if(locked.rows.length!==1)stale();
      for(const vector of vectors){
        abort(signal);
        await port.query(`INSERT INTO projed_core.document_embeddings
          (id,tenant_id,chunk_id,provider,model,dimensions,embedding,content_hash)
          VALUES($1::uuid,$2::uuid,$3::uuid,'google',$4,3072,$5::real[],$6)
          ON CONFLICT(chunk_id,provider,model,dimensions) DO UPDATE SET embedding=EXCLUDED.embedding,content_hash=EXCLUDED.content_hash`,
        [randomUUID(),scope.tenantId,vector.chunkId,MODEL,vector.values,claim.contentHash]);
      }
      const counts=await port.query<{total:number;missing:number}>(`
        SELECT count(*)::integer AS total,count(*) FILTER(WHERE NOT EXISTS(
          SELECT 1 FROM projed_core.document_embeddings e WHERE e.tenant_id=c.tenant_id AND e.chunk_id=c.id
            AND e.provider='google' AND e.model=$3 AND e.dimensions=3072 AND e.content_hash=$4))::integer AS missing
        FROM projed_core.document_chunks c WHERE c.tenant_id=$1::uuid AND c.document_id=$2::uuid
          AND c.document_version_id=$5::uuid
      `,[scope.tenantId,claim.documentId,MODEL,claim.contentHash,claim.versionId]);
      const count=counts.rows[0];if(!count||count.total===0)stale();
      const status=count.missing===0?'synced':failure?'failed':'pending';
      const updated=await port.query(`UPDATE projed_core.rag_sync_jobs
        SET status=$4,lease_token=NULL,lease_expires_at=NULL,
          attempt_count=CASE WHEN $5::boolean THEN 0 ELSE attempt_count END,
          last_synced_at=CASE WHEN $4='synced' THEN now() ELSE last_synced_at END,error=$6,updated_at=now()
        WHERE tenant_id=$1::uuid AND id=$2::uuid AND status='running' AND lease_token=$3
          AND lease_expires_at>clock_timestamp()`,
      [scope.tenantId,claim.jobId,claim.token,status,vectors.length>0&&count.missing>0,
        failure instanceof KernelError?failure.code:failure?'RAG_PROVIDER_UNAVAILABLE':null]);
      if(updated.rowCount!==1)stale();
      abort(signal);
    });
  }catch(error){
    if(!(error instanceof KernelError)||error.code!=='DB_COMMIT_UNKNOWN')throw error;
    // Embedding/settlement commit uncertainty never causes a second provider call.
    const confirmed=await run(async port=>{
      const jobs=await port.query<{status:string;lease_token:string|null}>(`SELECT status,lease_token
        FROM projed_core.rag_sync_jobs WHERE tenant_id=$1::uuid AND id=$2::uuid
          AND document_version_id=$3::uuid AND content_hash=$4`,
      [scope.tenantId,claim.jobId,claim.versionId,claim.contentHash]);
      if(jobs.rows.length!==1||jobs.rows[0]!.lease_token!==null||!['pending','failed','synced'].includes(jobs.rows[0]!.status))return false;
      const written=await port.query<{id:string}>(`SELECT chunk_id::text AS id FROM projed_core.document_embeddings
        WHERE tenant_id=$1::uuid AND chunk_id=ANY($2::uuid[]) AND provider='google' AND model=$3
          AND dimensions=3072 AND content_hash=$4`,[scope.tenantId,vectors.map(v=>v.chunkId),MODEL,claim.contentHash]);
      return new Set(written.rows.map(v=>v.id)).size===vectors.length;
    });
    if(!confirmed)throw error;
  }
}

/** Resumable consumer of visible work, also used by ordinary RAG requests. */
export async function indexVisibleRagDocuments(
  run:RagTransactionRunner,scope:RagIndexScope,provider:RagProvider,signal:AbortSignal,maximumChunks=16,
):Promise<{embedded:number}> {
  if(!Number.isInteger(maximumChunks)||maximumChunks<1||maximumChunks>64)throw new KernelError('DOMAIN_DATA_INVALID','Index budget is invalid',400);
  let embedded=0;
  for(let jobs=0;jobs<32&&embedded<maximumChunks;jobs++){
    abort(signal);
    const claim=await claimNext(run,scope,Math.min(4,maximumChunks-embedded));
    if(!claim)break;
    // A second short transaction revalidates current permissions/source before disclosure.
    claim.chunks=await run(port=>readClaimChunks(port,scope,claim,claim.chunks.length||1));
    const results=await Promise.allSettled(claim.chunks.map(async chunk=>({
      chunkId:chunk.id,values:validatedRagVector(await provider.embed(chunk.content,signal)),
    })));
    abort(signal);
    const vectors:Array<{chunkId:string;values:number[]}>=[];
    let failure:unknown;
    for(const result of results){if(result.status==='fulfilled')vectors.push(result.value);else failure??=result.reason;}
    await settle(run,scope,claim,vectors,failure,signal);
    embedded+=vectors.length;
    if(failure)break;
  }
  return{embedded};
}
