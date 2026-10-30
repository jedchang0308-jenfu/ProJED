import {createHash} from 'node:crypto';
import {KernelError} from './errors.js';
import {requireUuid} from './meetingCaptureInput.js';

const MAX_CANDIDATE_TEXT_CODE_POINTS=800;
const MAX_SOURCE_HASH_CODE_POINTS=128;

export interface MeetingTaskCandidateSnapshot {
  readonly taskId:string;
  readonly text:string;
  readonly updatedAt:string;
  readonly sourceHash:string;
  readonly snapshotHash:string;
}

export interface MeetingTaskCandidate extends MeetingTaskCandidateSnapshot {
  readonly lexicalScore:number;
  readonly ragScore:number;
  readonly pointerFeature:number;
}

export interface MeetingTaskCandidateSource {
  readonly taskId:string;
  readonly tenantId:string;
  readonly projectId:string;
  readonly title:string;
  readonly taskCode:string;
  readonly path:string;
  readonly description:string;
  readonly status:string;
  readonly updatedAt:string;
  readonly sourceHash:string;
  readonly nodeType:string|null;
  readonly archived:boolean;
}

export interface MeetingTaskCandidateSignal {
  readonly taskId:string;
  readonly score:number;
}

export interface MeetingTaskCandidateScope {
  readonly tenantId:string;
  readonly projectId:string;
}

export interface SelectMeetingTaskCandidatesInput {
  readonly scope:MeetingTaskCandidateScope;
  readonly liveTasks:readonly MeetingTaskCandidateSource[];
  readonly lexical:readonly MeetingTaskCandidateSignal[];
  readonly rag:readonly MeetingTaskCandidateSignal[];
  readonly pointer:readonly MeetingTaskCandidateSignal[];
}

function invalid():never{
  throw new KernelError('DOMAIN_DATA_INVALID','Meeting task candidate input is invalid',409);
}

function canonicalUuid(value:unknown):string{
  try{return requireUuid(value,'Task identifier').toLowerCase();}
  catch{return invalid();}
}

function canonicalScopeUuid(value:unknown):string{
  try{return requireUuid(value,'Candidate scope identifier').toLowerCase();}
  catch{return invalid();}
}

function textField(value:unknown):string{
  if(typeof value!=='string')return invalid();
  return value;
}

function codePoints(value:string):string[]{return Array.from(value);}

function buildSnapshotText(source:MeetingTaskCandidateSource):string{
  const labels=['Title: ','Code: ','Path: ','Description: ','Status: '];
  const values=[source.title,source.taskCode,source.path,source.description,source.status].map(textField);
  const baseCharacters=labels.reduce((sum,label)=>sum+codePoints(label).length,0)+values.length-1;
  let valueCharacters=values.reduce((sum,value)=>sum+codePoints(value).length,0);
  let overflow=Math.max(0,baseCharacters+valueCharacters-MAX_CANDIDATE_TEXT_CODE_POINTS);
  // Preserve the title and code first; trim description and path before the
  // shorter status and identity fields when the complete snapshot is too long.
  for(const index of [3,2,4,1,0]){
    if(overflow===0)break;
    const points=codePoints(values[index]!);
    const remove=Math.min(points.length,overflow);
    values[index]=points.slice(0,points.length-remove).join('');
    valueCharacters-=remove;
    overflow-=remove;
  }
  return values.map((value,index)=>`${labels[index]}${value}`).join('\n');
}

/** Create a stable, bounded snapshot from the caller's live WBS row and hash. */
export function createMeetingTaskCandidateSnapshot(source:MeetingTaskCandidateSource):MeetingTaskCandidateSnapshot{
  const taskId=canonicalUuid(source.taskId);
  const updatedAt=textField(source.updatedAt);
  if(!updatedAt||!Number.isFinite(Date.parse(updatedAt))||typeof source.archived!=='boolean'
      ||!(source.nodeType===null||typeof source.nodeType==='string'))invalid();
  const sourceHash=textField(source.sourceHash);
  if(!sourceHash||codePoints(sourceHash).length>MAX_SOURCE_HASH_CODE_POINTS)invalid();
  const text=buildSnapshotText(source);
  if(codePoints(text).length>MAX_CANDIDATE_TEXT_CODE_POINTS)invalid();
  const snapshotHash=createHash('sha256').update(JSON.stringify({taskId,text,updatedAt,sourceHash}),'utf8').digest('hex');
  return {taskId,text,updatedAt,sourceHash,snapshotHash};
}

function validateScore(score:unknown,source:'lexical'|'rag'|'pointer'):number{
  const valid=typeof score==='number'&&Number.isFinite(score)
    &&(source==='rag'?score>=-1&&score<=1:score>=0&&score<=1);
  if(!valid)return invalid();
  return score;
}

function sourceScores(signals:readonly MeetingTaskCandidateSignal[],eligible:ReadonlySet<string>,
  source:'lexical'|'rag'|'pointer'):Map<string,number>{
  const scores=new Map<string,number>();
  for(const signal of signals){
    const taskId=canonicalUuid(signal.taskId);
    if(!eligible.has(taskId))continue;
    const score=validateScore(signal.score,source);
    if(score<=0)continue;
    scores.set(taskId,Math.max(scores.get(taskId)??0,score));
  }
  return scores;
}

function ranked(scores:ReadonlyMap<string,number>,limit:number):string[]{
  return [...scores.entries()].sort(([leftId,leftScore],[rightId,rightScore])=>{
    if(leftScore!==rightScore)return rightScore-leftScore;
    return leftId<rightId?-1:leftId>rightId?1:0;
  }).slice(0,limit).map(([taskId])=>taskId);
}

/** Scope current WBS tasks before joining or deduplicating retrieval signals. */
export function selectMeetingTaskCandidates(input:SelectMeetingTaskCandidatesInput):readonly MeetingTaskCandidate[]{
  const tenantId=canonicalScopeUuid(input.scope.tenantId),projectId=canonicalScopeUuid(input.scope.projectId);
  const snapshots=new Map<string,MeetingTaskCandidateSnapshot>();
  for(const source of input.liveTasks){
    if(source.archived!==false||!(source.nodeType===null||source.nodeType==='task'||source.nodeType==='milestone')
        ||typeof source.tenantId!=='string'||typeof source.projectId!=='string'
        ||source.tenantId.toLowerCase()!==tenantId||source.projectId.toLowerCase()!==projectId)continue;
    const snapshot=createMeetingTaskCandidateSnapshot(source);
    if(snapshots.has(snapshot.taskId))invalid();
    snapshots.set(snapshot.taskId,snapshot);
  }

  const eligible=new Set(snapshots.keys());
  const lexical=sourceScores(input.lexical,eligible,'lexical');
  const rag=sourceScores(input.rag,eligible,'rag');
  const pointer=sourceScores(input.pointer,eligible,'pointer');
  const selected:string[]=[];
  const selectedSet=new Set<string>();
  const add=(ids:readonly string[]):void=>{
    for(const taskId of ids){
      if(!selectedSet.has(taskId)){
        selected.push(taskId);
        selectedSet.add(taskId);
      }
    }
  };
  add(ranked(lexical,4));
  add(ranked(rag,6));
  add(ranked(pointer,2));

  if(selected.length<12){
    const textFill=[...new Set([...lexical.keys(),...rag.keys()])]
      .filter(taskId=>!selectedSet.has(taskId))
      .sort((leftId,rightId)=>{
        const leftScore=Math.max(lexical.get(leftId)??0,rag.get(leftId)??0);
        const rightScore=Math.max(lexical.get(rightId)??0,rag.get(rightId)??0);
        if(leftScore!==rightScore)return rightScore-leftScore;
        return leftId<rightId?-1:leftId>rightId?1:0;
      });
    add(textFill.slice(0,12-selected.length));
  }

  return selected.map(taskId=>{
    const snapshot=snapshots.get(taskId);
    if(!snapshot)return invalid();
    return {...snapshot,lexicalScore:lexical.get(taskId)??0,ragScore:rag.get(taskId)??0,
      pointerFeature:pointer.get(taskId)??0};
  });
}
