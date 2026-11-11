import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';

import {runActorTransaction,type ServerActorV1} from '../../../server/actorTransaction.js';
import {RuntimeDatabase} from '../../../server/db.js';
import {KernelError} from '../../../server/errors.js';
import {createMeetingTaskCandidateSnapshot,type MeetingTaskCandidateSnapshot} from '../../../server/meetingTaskCandidates.js';
import {readCurrentMeetingTaskSnapshots,readMeetingTaskPointerSignals,readMeetingTaskRagCoverage,readMeetingTaskRagMatches,readMeetingTaskSources,
  scoreMeetingTaskLexical,type MeetingTaskRagSource} from '../../../server/meetingTaskRead.js';
import type {MeetingTaskCandidateScope} from '../../../server/meetingTaskCandidates.js';
import {CollaborationWriteRepository} from '../../../server/collaborationWrite.js';
import type {RuntimeConfig} from '../../../server/config.js';
import {normalizeRagChunkContent} from '../../../shared/ragChunkContent.js';

const FNV_PRIME=0x01000193;
const EMBEDDING_DIMENSIONS=3072;

interface CaptureScopeRow {
  tenant_id:string;
  project_id:string;
  workspace_ref:string;
}

interface FixtureTask {
  id:string;
  legacyId:string;
  title:string;
  status:'todo'|'in_progress'|'delayed'|'completed'|'unsure'|'onhold';
  nodeType:'task'|'milestone'|'group'|null;
  archived:boolean;
  parentId:string|null;
  sortOrder:number;
}

interface RagFixtureRows {
  documentId:string;
  versionId:string;
  chunkId:string;
  embeddingId:string;
  source:MeetingTaskRagSource;
}

function fnvStep(state:number,character:string):number{
  return Math.imul(state^character.charCodeAt(0),FNV_PRIME)>>>0;
}

function fnv1a32(value:string):string{
  let state=0x811c9dc5;
  for(let index=0;index<value.length;index++)state=fnvStep(state,value[index]!);
  return `fnv1a32:${state.toString(16).padStart(8,'0')}`;
}

async function inAdminTransaction<T>(admin:pg.Client,work:()=>Promise<T>):Promise<T>{
  await admin.query('BEGIN');
  try{
    const result=await work();
    await admin.query('COMMIT');
    return result;
  }catch(error){
    try{await admin.query('ROLLBACK');}
    catch(rollbackError){throw new AggregateError([error,rollbackError],'Task-read fixture and rollback both failed');}
    throw error;
  }
}

export async function insertTask(admin:pg.Client,tenantId:string,projectId:string,task:FixtureTask):Promise<void>{
  const inserted=await admin.query(`INSERT INTO projed_core.wbs_items
    (id,tenant_id,project_id,legacy_task_id,parent_id,title,description,detail_notes,status,sort_order,node_type,archived)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid,$6,$7,'[]'::jsonb,$8,$9::double precision,$10,$11)`
  ,[task.id,tenantId,projectId,task.legacyId,task.parentId,task.title,`Synthetic detail for ${task.title}`,
    task.status,task.sortOrder,task.nodeType,task.archived]);
  assert.equal(inserted.rowCount,1,`synthetic task ${task.legacyId} is inserted once`);
}

export async function seedCurrentDocument(admin:pg.Client,tenantId:string,projectId:string,
  task:{readonly id:string;readonly title:string},source:MeetingTaskRagSource,score:number):Promise<RagFixtureRows>{
  const rows={documentId:randomUUID(),versionId:randomUUID(),chunkId:randomUUID(),embeddingId:randomUUID(),source};
  const document=await admin.query(`INSERT INTO projed_core.documents
    (id,tenant_id,project_id,source_type,source_table,source_id,title,content_hash,visibility,rag_enabled,metadata)
    VALUES($1::uuid,$2::uuid,$3::uuid,'wbs_item','wbs_items',$4::uuid,$5,$6,'project',true,'{}'::jsonb)`
  ,[rows.documentId,tenantId,projectId,task.id,task.title,source.contentHash]);
  assert.equal(document.rowCount,1);
  const version=await admin.query(`INSERT INTO projed_core.document_versions
    (id,tenant_id,document_id,version,content,content_hash) VALUES($1::uuid,$2::uuid,$3::uuid,1,$4,$5)`
  ,[rows.versionId,tenantId,rows.documentId,source.content,source.contentHash]);
  assert.equal(version.rowCount,1);
  const chunk=await admin.query(`INSERT INTO projed_core.document_chunks
    (id,tenant_id,document_id,document_version_id,chunk_index,content,metadata)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,0,$5,$6::jsonb)`
  ,[rows.chunkId,tenantId,rows.documentId,rows.versionId,source.content,
    JSON.stringify({sourceContentHash:source.contentHash,startChar:0,endChar:source.indexedContentLength})]);
  assert.equal(chunk.rowCount,1);
  const embedding=await admin.query(`INSERT INTO projed_core.document_embeddings
    (id,tenant_id,chunk_id,provider,model,dimensions,embedding,content_hash)
    VALUES($1::uuid,$2::uuid,$3::uuid,'google','gemini-embedding-001',$4,
      ARRAY[$5::real,sqrt(1::double precision-$5::double precision*$5::double precision)::real]
        ||array_fill(0::real,ARRAY[3070]),$6)`
  ,[rows.embeddingId,tenantId,rows.chunkId,EMBEDDING_DIMENSIONS,score,source.contentHash]);
  assert.equal(embedding.rowCount,1);
  return rows;
}

function isForbidden(error:unknown):boolean{
  return error instanceof KernelError&&error.code==='ACCESS_DENIED'&&error.httpStatus===403;
}

/** Isolated, synthetic PostgreSQL task-read proof. All inserted objects are inside the existing fixture workspace cascade. */
export async function verifyMeetingTaskReadPostgres(database:RuntimeDatabase,config:RuntimeConfig,admin:pg.Client,
  actor:ServerActorV1,outsider:ServerActorV1,captureId:string):Promise<void>{
  const capture=await admin.query<CaptureScopeRow>(`SELECT capture.tenant_id::text,capture.project_id::text,
    tenant.legacy_workspace_id::text AS workspace_ref FROM projed_core.meeting_capture_sessions capture
    JOIN projed_core.tenants tenant ON tenant.id=capture.tenant_id WHERE capture.id=$1::uuid`,[captureId]);
  assert.equal(capture.rowCount,1,'the existing discussion capture owns one workspace scope');
  const captureScope=capture.rows[0]!;
  const board=await runActorTransaction(database,config,actor,port=>
    new CollaborationWriteRepository().createBoard(port,captureScope.workspace_ref,
      {title:`Task-read fixture ${captureId.slice(0,8)}`}));
  assert.notEqual(board.id,captureScope.project_id,'the fixture uses a separate board in the same workspace');
  const scope:MeetingTaskCandidateScope={tenantId:captureScope.tenant_id,projectId:board.id};

  const group:FixtureTask={id:randomUUID(),legacyId:`task-read-group-${randomUUID()}`,
    title:'Synthetic excluded group',status:'in_progress',nodeType:'group',archived:false,parentId:null,sortOrder:-1};
  const descendingTaskIds=Array.from({length:8},()=>randomUUID()).sort().reverse();
  const eligible=Array.from({length:8},(_,index):FixtureTask=>({id:descendingTaskIds[index]!,
    legacyId:`task-read-${index}-${randomUUID()}`,title:`Synthetic task read ${index}`,status:index<2?'completed'
      :(['in_progress','delayed','todo','unsure','onhold','todo'][index-2] as FixtureTask['status']),
    nodeType:index===0?null:index===4?'milestone':'task',archived:false,parentId:index===0?group.id:null,sortOrder:index}));
  const archived:FixtureTask={id:randomUUID(),legacyId:`task-read-archived-${randomUUID()}`,
    title:'Synthetic archived excluded task',status:'todo',nodeType:'task',archived:true,parentId:null,sortOrder:20};
  const otherBoard:FixtureTask={id:randomUUID(),legacyId:`task-read-other-board-${randomUUID()}`,
    title:'Synthetic other-board excluded task',status:'todo',nodeType:'task',archived:false,parentId:null,sortOrder:21};
  assert.notEqual(captureScope.project_id,board.id);
  await inAdminTransaction(admin,async()=>{
    await insertTask(admin,scope.tenantId,scope.projectId,group);
    for(const task of eligible)await insertTask(admin,scope.tenantId,scope.projectId,task);
    await insertTask(admin,scope.tenantId,scope.projectId,archived);
    await insertTask(admin,scope.tenantId,captureScope.project_id,otherBoard);
  });

  const live=await runActorTransaction(database,config,actor,port=>readMeetingTaskSources(port,scope));
  assert.equal(live.tasks.length,8,'only the eight live task/milestone/NULL candidates are returned');
  assert.equal(live.ragSources.length,8,'canonical RAG input is limited to the same eight current tasks');
  const liveById=new Map(live.tasks.map(task=>[task.taskId,task]));
  const eligibleIds=new Set(eligible.map(task=>task.id));
  assert.deepEqual(new Set(live.tasks.map(task=>task.taskId)),eligibleIds);
  assert.equal(liveById.get(eligible[0]!.id)?.nodeType,null,'NULL node_type remains an eligible task');
  assert.equal(liveById.get(eligible[0]!.id)?.status,'completed','completed remains a legal task status');
  assert.equal(live.tasks.some(task=>task.taskId===group.id||task.taskId===archived.id||task.taskId===otherBoard.id),false,
    'group, archived, and other-board rows never enter candidate sources');
  const lexical=scoreMeetingTaskLexical(liveById.get(eligible[0]!.id)!.title,live.tasks);
  assert.equal(lexical.find(signal=>signal.taskId===eligible[0]!.id)?.score,1,
    'lexical scoring can identify an exact live task title');

  const child=liveById.get(eligible[0]!.id)!;
  const beforeAncestorChange:MeetingTaskCandidateSnapshot=createMeetingTaskCandidateSnapshot(child);
  assert.ok(child.path.includes(group.title),'the candidate snapshot includes its group ancestor path');
  const initiallyCurrent=await runActorTransaction(database,config,actor,port=>
    readCurrentMeetingTaskSnapshots(port,scope,[beforeAncestorChange]));
  assert.deepEqual(initiallyCurrent,[beforeAncestorChange],'a live candidate snapshot is accepted before provider work');
  const renamedGroupTitle=`${group.title} renamed`;
  const renamedGroup=await admin.query(`UPDATE projed_core.wbs_items SET title=$4,updated_at=now()
    WHERE id=$1::uuid AND tenant_id=$2::uuid AND project_id=$3::uuid RETURNING id::text`,
  [group.id,scope.tenantId,scope.projectId,renamedGroupTitle]);
  assert.equal(renamedGroup.rowCount,1,'only the synthetic parent group title changes');
  const afterAncestorChange=await runActorTransaction(database,config,actor,port=>readMeetingTaskSources(port,scope));
  const childAfterAncestorChange=afterAncestorChange.tasks.find(task=>task.taskId===child.taskId);
  assert.ok(childAfterAncestorChange);
  assert.notEqual(childAfterAncestorChange.path,child.path,'the child path reflects the renamed ancestor');
  assert.equal(childAfterAncestorChange.updatedAt,child.updatedAt,'renaming the ancestor leaves the child updated_at unchanged');
  assert.equal(childAfterAncestorChange.sourceHash,child.sourceHash,'renaming the ancestor leaves the child row hash unchanged');
  const afterAncestorSnapshot=createMeetingTaskCandidateSnapshot(childAfterAncestorChange);
  assert.notEqual(afterAncestorSnapshot.snapshotHash,beforeAncestorChange.snapshotHash,
    'the candidate snapshot hash changes when only its ancestor path changes');
  assert.equal(await runActorTransaction(database,config,actor,port=>
    readCurrentMeetingTaskSnapshots(port,scope,[beforeAncestorChange])),null,
  'an old candidate snapshot is rejected after its ancestor path changes');
  assert.deepEqual(await runActorTransaction(database,config,actor,port=>
    readCurrentMeetingTaskSnapshots(port,scope,[afterAncestorSnapshot])),[afterAncestorSnapshot],
  'the refreshed candidate snapshot is accepted');

  const scores=[0.99,0.95,0.90,0.85,0.80,0.75,0.70,0.65];
  const scoresByTask=new Map(eligible.map((task,index)=>[task.id,scores[index]!]));
  const ragRows=new Map<string,RagFixtureRows>();
  const tasksById=new Map(eligible.map(task=>[task.id,task]));
  await inAdminTransaction(admin,async()=>{
    for(const source of live.ragSources){
      const task=tasksById.get(source.taskId);
      assert.ok(task,'every canonical document belongs to one fixture task');
      ragRows.set(task.id,await seedCurrentDocument(admin,scope.tenantId,scope.projectId,
        {id:task.id,title:task.title},source,scoresByTask.get(task.id)!));
    }
  });
  assert.equal(ragRows.size,8);

  const decimalCoverageTask=eligible[0]!;
  const decimalCoverageRows=ragRows.get(decimalCoverageTask.id)!;
  const decimalCoverageLength=live.ragSources.find(source=>source.taskId===decimalCoverageTask.id)!.indexedContentLength;
  const decimalCoverageMetadata=await admin.query(`UPDATE projed_core.document_chunks SET metadata=jsonb_set(
    jsonb_set(metadata,'{startChar}','0.0'::jsonb,true),'{endChar}',($4::text||'.0')::jsonb,true)
    WHERE id=$1::uuid AND document_id=$2::uuid AND document_version_id=$3::uuid AND chunk_index=0 RETURNING id::text`,
  [decimalCoverageRows.chunkId,decimalCoverageRows.documentId,decimalCoverageRows.versionId,String(decimalCoverageLength)]);
  assert.equal(decimalCoverageMetadata.rowCount,1,
    'integral JSON numbers with a decimal scale remain valid chunk range metadata');

  const queryVector=Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  queryVector[0]=1;
  const readMatches=(readActor:ServerActorV1,ragSources:readonly MeetingTaskRagSource[]=live.ragSources)=>
    runActorTransaction(database,config,readActor,port=>readMeetingTaskRagMatches(port,scope,ragSources,queryVector));
  const baseline=await readMatches(actor);
  const readCoverage=()=>runActorTransaction(database,config,actor,port=>readMeetingTaskRagCoverage(port,scope,live.ragSources));
  assert.deepEqual(await readCoverage(),{totalTasks:8,indexedTasks:8,incomplete:false},
    'coverage-only SQL verifies the same complete index without a query embedding or ranking signals');
  assert.deepEqual({totalTasks:baseline.totalTasks,indexedTasks:baseline.indexedTasks,incomplete:baseline.incomplete},
    {totalTasks:8,indexedTasks:8,incomplete:false},'all eight exact current documents have complete embedding coverage');
  const expectedTopSix=eligible.map(task=>task.id).sort((left,right)=>scoresByTask.get(right)!-scoresByTask.get(left)!).slice(0,6);
  assert.deepEqual(baseline.signals.map(signal=>signal.taskId),expectedTopSix,
    'the SQL ranks all eight current task documents by cosine score before applying top six');
  assert.deepEqual(baseline.signals.map(signal=>signal.score),[...baseline.signals.map(signal=>signal.score)]
    .sort((left,right)=>right-left),'the top-six signals are returned in descending score order');

  const sixthTask=eligible[5]!;
  const sixthSource=live.ragSources.find(source=>source.taskId===sixthTask.id)!;
  const sixthRows=ragRows.get(sixthTask.id)!;
  const normalizedContent=normalizeRagChunkContent(sixthSource.content);
  assert.equal(normalizedContent.length,sixthSource.indexedContentLength,
    'the synthetic chunk ranges use the canonical normalized UTF-16 source extent');
  const contentPoints=Array.from(normalizedContent);
  const splitPoint=Math.floor(contentPoints.length/2);
  assert.ok(splitPoint>2&&splitPoint<contentPoints.length,'the selected source supports two chunks with a two-character overlap');
  const firstChunkEnd=contentPoints.slice(0,splitPoint).join('').length;
  const secondChunkStart=contentPoints.slice(0,splitPoint-2).join('').length;
  const firstChunkContent=contentPoints.slice(0,splitPoint).join('');
  const secondChunkContent=contentPoints.slice(splitPoint-2).join('');
  const firstChunkMetadata=JSON.stringify({sourceContentHash:sixthSource.contentHash,startChar:0,endChar:firstChunkEnd});
  const firstChunkUpdate=await admin.query(`UPDATE projed_core.document_chunks SET content=$4,metadata=$5::jsonb
    WHERE id=$1::uuid AND document_id=$2::uuid AND document_version_id=$3::uuid AND chunk_index=0 RETURNING id::text`,
  [sixthRows.chunkId,sixthRows.documentId,sixthRows.versionId,firstChunkContent,firstChunkMetadata]);
  assert.equal(firstChunkUpdate.rowCount,1,'the selected document first chunk is split at the exact midpoint');
  const secondChunkId=randomUUID();
  const secondEmbeddingId=randomUUID();
  const secondChunkMetadata=JSON.stringify({sourceContentHash:sixthSource.contentHash,
    startChar:secondChunkStart,endChar:sixthSource.indexedContentLength});
  const secondChunk=await admin.query(`INSERT INTO projed_core.document_chunks
    (id,tenant_id,document_id,document_version_id,chunk_index,content,metadata)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,1,$5,$6::jsonb) RETURNING id::text`,
  [secondChunkId,scope.tenantId,sixthRows.documentId,sixthRows.versionId,secondChunkContent,secondChunkMetadata]);
  assert.equal(secondChunk.rowCount,1,'the selected source receives one second overlapping chunk');
  const sixthScore=scoresByTask.get(sixthTask.id)!;
  const secondEmbedding=await admin.query(`INSERT INTO projed_core.document_embeddings
    (id,tenant_id,chunk_id,provider,model,dimensions,embedding,content_hash)
    VALUES($1::uuid,$2::uuid,$3::uuid,'google','gemini-embedding-001',$4,
      ARRAY[$5::real,sqrt(1::double precision-$5::double precision*$5::double precision)::real]
        ||array_fill(0::real,ARRAY[3070]),$6) RETURNING id::text`,
  [secondEmbeddingId,scope.tenantId,secondChunkId,EMBEDDING_DIMENSIONS,sixthScore,sixthSource.contentHash]);
  assert.equal(secondEmbedding.rowCount,1,'the second chunk has the selected task’s same-model embedding and score');
  const bothEmbeddings=await admin.query<{embedding_count:string}>(`SELECT count(*)::text AS embedding_count
    FROM projed_core.document_chunks chunk JOIN projed_core.document_embeddings embedding
      ON embedding.tenant_id=chunk.tenant_id AND embedding.chunk_id=chunk.id
    WHERE chunk.tenant_id=$1::uuid AND chunk.document_id=$2::uuid AND chunk.document_version_id=$3::uuid
      AND embedding.provider='google' AND embedding.model='gemini-embedding-001' AND embedding.dimensions=3072`,
  [scope.tenantId,sixthRows.documentId,sixthRows.versionId]);
  assert.equal(bothEmbeddings.rows[0]?.embedding_count,'2','both selected-document chunks retain valid embeddings');
  const completeOverlap=await readMatches(actor);
  assert.equal(completeOverlap.indexedTasks,8,'continuous two-chunk coverage with a two-character overlap stays fresh');
  assert.equal(completeOverlap.incomplete,false);
  assert.deepEqual(completeOverlap.signals,baseline.signals,'splitting a complete source leaves task ranking and scores unchanged');

  const gapStart=firstChunkEnd+1;
  const gap=await admin.query(`UPDATE projed_core.document_chunks SET metadata=jsonb_set(metadata,'{startChar}',
    to_jsonb($4::integer),true) WHERE id=$1::uuid AND document_id=$2::uuid AND document_version_id=$3::uuid
      AND chunk_index=1 RETURNING id::text`,[secondChunkId,sixthRows.documentId,sixthRows.versionId,gapStart]);
  assert.equal(gap.rowCount,1,'only the second chunk start is moved to leave a one-character source gap');
  const afterGap=await readMatches(actor);
  assert.equal(afterGap.indexedTasks,7,'incomplete contiguous range coverage excludes the selected document');
  assert.equal(afterGap.incomplete,true);
  assert.equal(afterGap.signals.some(signal=>signal.taskId===sixthTask.id),false,
    'the document is excluded even though both chunks still have valid embeddings');

  const restoredStart=await admin.query(`UPDATE projed_core.document_chunks SET metadata=jsonb_set(metadata,'{startChar}',
    to_jsonb($4::integer),true) WHERE id=$1::uuid AND document_id=$2::uuid AND document_version_id=$3::uuid
      AND chunk_index=1 RETURNING id::text`,[secondChunkId,sixthRows.documentId,sixthRows.versionId,secondChunkStart]);
  assert.equal(restoredStart.rowCount,1,'only the second chunk start is restored to its exact overlapping range');
  const restoredCoverage=await readMatches(actor);
  assert.equal(restoredCoverage.indexedTasks,8,'restoring the valid overlap restores complete indexing');
  assert.equal(restoredCoverage.incomplete,false);
  assert.deepEqual(restoredCoverage.signals,baseline.signals,'restored multi-chunk coverage preserves the baseline ranking');

  await assert.rejects(runActorTransaction(database,config,outsider,port=>readMeetingTaskSources(port,scope)),isForbidden,
    'an outsider cannot read the synthetic board task corpus');
  await assert.rejects(readMatches(outsider),isForbidden,'an outsider cannot read task-index matches');
  const outsiderPointer=await runActorTransaction(database,config,outsider,port=>readMeetingTaskPointerSignals(port,{
    scope:{tenantId:captureScope.tenant_id,projectId:captureScope.project_id},captureId,sourceVersion:1,
    startOffsetMs:0,endOffsetMs:100,
  }));
  assert.deepEqual(outsiderPointer,[],'an outsider receives no pointer signal from the private capture');
  const wrongVersionPointer=await runActorTransaction(database,config,actor,port=>readMeetingTaskPointerSignals(port,{
    scope:{tenantId:captureScope.tenant_id,projectId:captureScope.project_id},captureId,sourceVersion:2,
    startOffsetMs:0,endOffsetMs:100,
  }));
  assert.deepEqual(wrongVersionPointer,[],'a mismatched source version receives no pointer signal');

  const firstSource=live.ragSources.find(source=>source.taskId===eligible[0]!.id)!;
  const firstRows=ragRows.get(eligible[0]!.id)!;
  const staleVersionContent=firstSource.content+'\nSynthetic stale latest version';
  const staleVersionHash=fnv1a32(staleVersionContent);
  assert.notEqual(staleVersionHash,firstSource.contentHash);
  const staleVersion=await admin.query(`INSERT INTO projed_core.document_versions
    (id,tenant_id,document_id,version,content,content_hash) VALUES($1::uuid,$2::uuid,$3::uuid,2,$4,$5)`
  ,[randomUUID(),scope.tenantId,firstRows.documentId,staleVersionContent,staleVersionHash]);
  assert.equal(staleVersion.rowCount,1,'one newer but stale version is added to the owned document');
  const afterStaleVersion=await readMatches(actor);
  assert.equal(afterStaleVersion.indexedTasks,7,'a stale latest document version removes its task from fresh index coverage');
  assert.equal(afterStaleVersion.incomplete,true);
  assert.equal(afterStaleVersion.signals.some(signal=>signal.taskId===eligible[0]!.id),false);
  assert.equal(afterStaleVersion.signals.some(signal=>signal.taskId===eligible[6]!.id),true,
    'ranking continues across the full eligible corpus after a stale high-score task is excluded');

  const secondSource=live.ragSources.find(source=>source.taskId===eligible[1]!.id)!;
  const secondRows=ragRows.get(eligible[1]!.id)!;
  const alteredContent=secondSource.content+'\nSynthetic content differs under the same declared hash';
  assert.notEqual(alteredContent,secondSource.content);
  const contentMismatchUpdate=await admin.query(`UPDATE projed_core.document_versions SET content=$3
    WHERE id=$1::uuid AND document_id=$2::uuid AND content_hash=$4 RETURNING id::text`,
  [secondRows.versionId,secondRows.documentId,alteredContent,secondSource.contentHash]);
  assert.equal(contentMismatchUpdate.rowCount,1,'only this synthetic version body changes while its declared hash stays fixed');
  const afterDeclaredHashMismatch=await readMatches(actor);
  assert.equal(afterDeclaredHashMismatch.indexedTasks,6,
    'exact canonical content comparison rejects different content with the same declared hash');
  assert.equal(afterDeclaredHashMismatch.signals.some(signal=>signal.taskId===eligible[1]!.id),false);

  const thirdRows=ragRows.get(eligible[2]!.id)!;
  const removedEmbedding=await admin.query(`DELETE FROM projed_core.document_embeddings
    WHERE id=$1::uuid AND chunk_id=$2::uuid RETURNING id::text`,[thirdRows.embeddingId,thirdRows.chunkId]);
  assert.equal(removedEmbedding.rowCount,1,'one current chunk embedding is removed from its owned task');
  const afterMissingEmbedding=await readMatches(actor);
  assert.equal(afterMissingEmbedding.indexedTasks,5,'a document with one unembedded current chunk is incomplete');
  assert.equal(afterMissingEmbedding.incomplete,true);
  assert.deepEqual(await readCoverage(),{totalTasks:8,indexedTasks:5,incomplete:true},
    'coverage-only SQL retains exact current-document and complete-chunk checks');
  assert.equal(afterMissingEmbedding.signals.some(signal=>signal.taskId===eligible[2]!.id),false);

  const fourthSource=live.ragSources.find(source=>source.taskId===eligible[3]!.id)!;
  const renamed=await admin.query(`UPDATE projed_core.wbs_items SET title=$4,updated_at=now()
    WHERE id=$1::uuid AND tenant_id=$2::uuid AND project_id=$3::uuid RETURNING id::text`,
  [eligible[3]!.id,scope.tenantId,scope.projectId,`${eligible[3]!.title} renamed`]);
  assert.equal(renamed.rowCount,1,'one synthetic task title is changed after its source snapshot');
  const refreshed=await runActorTransaction(database,config,actor,port=>readMeetingTaskSources(port,scope));
  const refreshedSource=refreshed.ragSources.find(source=>source.taskId===eligible[3]!.id);
  assert.ok(refreshedSource);
  assert.notEqual(refreshedSource.taskStateHash,fourthSource.taskStateHash,
    'the current task-state hash changes when the live title changes');
  assert.notEqual(refreshedSource.content,fourthSource.content,'the canonical WBS document also changes');
  const afterRenameWithOldCorpus=await readMatches(actor,live.ragSources);
  assert.equal(afterRenameWithOldCorpus.indexedTasks,4,
    'a hash/content-matching old corpus is rejected when its task-state hash is stale');
  assert.equal(afterRenameWithOldCorpus.signals.some(signal=>signal.taskId===eligible[3]!.id),false);

  const lastSource=live.ragSources.find(source=>source.taskId===eligible[7]!.id)!;
  const lastRows=ragRows.get(eligible[7]!.id)!;
  const beforeMissingTail=await readMatches(actor);
  assert.equal(beforeMissingTail.indexedTasks,4,'the untouched last task still has a complete current index');
  assert.equal(beforeMissingTail.signals.some(signal=>signal.taskId===eligible[7]!.id),true);
  assert.ok(lastSource.indexedContentLength>1,'the synthetic source is long enough to shorten its indexed extent');
  const shortenedTail=await admin.query(`UPDATE projed_core.document_chunks SET metadata=jsonb_set(metadata,'{endChar}',
    to_jsonb($4::integer),true) WHERE id=$1::uuid AND document_id=$2::uuid AND document_version_id=$3::uuid
      AND metadata->>'sourceContentHash'=$5 RETURNING id::text`,
  [lastRows.chunkId,lastRows.documentId,lastRows.versionId,lastSource.indexedContentLength-1,lastSource.contentHash]);
  assert.equal(shortenedTail.rowCount,1,'only the last task chunk extent is shortened by one indexed unit');
  const afterMissingTail=await readMatches(actor);
  assert.equal(afterMissingTail.indexedTasks,3,'a current document missing only its tail range is incomplete');
  assert.equal(afterMissingTail.incomplete,true);
  assert.equal(afterMissingTail.signals.some(signal=>signal.taskId===eligible[7]!.id),false,
    'a source with a missing tail range is excluded from task RAG matches');
}
