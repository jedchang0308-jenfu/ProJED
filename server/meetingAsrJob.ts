import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {loadRuntimeConfig,sha256} from './config.js';
import {RuntimeDatabase,type ExpectedMigration} from './db.js';
import {KernelError} from './errors.js';
import {CURRENT_PRODUCTION_IDENTITY_PINS,type IdentityContractPin} from './identityConsumer.js';
import {MANAGED_MEETING_AUDIO_BUCKET} from '../shared/dev139MeetingAudio.mjs';
import {createGoogleCloudMeetingProvider} from './googleCloudMeetingProvider.js';
import {createGoogleCloudSpeechProvider} from './googleCloudSpeechProvider.js';
import {createManagedMeetingAudioStorage} from './meetingAudioStorage.js';
import {runMeetingBackgroundHost} from './meetingBackgroundHost.js';
import {runMeetingAudioCleanupHost} from './meetingAudioCleanupWorker.js';
import {createPostgresMeetingAudioCleanupRepository} from './meetingAudioCleanupRepository.js';
import {createPostgresMeetingAsrControl,createPostgresMeetingAsrRepository} from './meetingAsrRepository.js';
import {CURRENT_MEETING_ASR_BINDING,hasQualifiedMeetingAsrBinding,type MeetingAsrRuntimeBinding} from './meetingAsrRuntimeBinding.js';
import {runMeetingAsrUnit} from './meetingAsrWorker.js';
import {createPostgresMeetingDiscussionControl,createPostgresMeetingDiscussionRepository} from './meetingDiscussionRepository.js';
import {runMeetingDiscussionUnit} from './meetingDiscussionWorker.js';
import {createPostgresMeetingLlmControl,createPostgresMeetingLlmPipeline} from './meetingLlmPipeline.js';
import {createPostgresMeetingLlmRepository} from './meetingLlmRepository.js';
import {CURRENT_MEETING_LLM_BINDING,hasQualifiedMeetingLlmBinding} from './meetingLlmRuntimeBinding.js';
import {createRuntimeSessionAuth} from './runtimeSessionAuth.js';
import {createServiceAccessTokenProvider} from './serviceAccessToken.js';
import {awaitDatabaseStartup} from './startup.js';
import {runtimeMigrationPolicy} from './migrationCompatibility.js';

/** Check-only imports code, but never loads credentials/config or opens a DB. */
export function meetingAsrJobCheck(
  asrBinding:MeetingAsrRuntimeBinding|null=CURRENT_MEETING_ASR_BINDING,
  identityPins:readonly IdentityContractPin[]=CURRENT_PRODUCTION_IDENTITY_PINS,
){
  return {event:'projed_meeting_asr_job_check',status:'CHECK_ONLY',
    providerDispatch:!hasQualifiedMeetingAsrBinding(asrBinding,MANAGED_MEETING_AUDIO_BUCKET)||identityPins.length===0?'DISABLED':'QUALIFICATION_BOUND',
    llmDispatch:!hasQualifiedMeetingLlmBinding(CURRENT_MEETING_LLM_BINDING)||identityPins.length===0?'DISABLED':'QUALIFICATION_BOUND',
    sessionContract:identityPins.length===0?'UNPUBLISHED':'PINNED',
    runtime:'NOT_CONNECTED',provider:'NOT_RUN'} as const;
}

export async function meetingAsrJobMain(args:readonly string[]=process.argv.slice(2)):Promise<void>{
  if(args.length===1&&args[0]==='--check-only'){console.log(JSON.stringify(meetingAsrJobCheck()));return;}
  if(args.length!==0)throw new KernelError('CONFIG_INVALID','ASR Job arguments are invalid');
  const jobDeadlineAtMs=Date.now()+600_000;
  const config=loadRuntimeConfig(process.env,{managedJob:true});
  if(config.env!=='managed'||config.entry!=='main')throw new KernelError('CONFIG_INVALID','ASR Job requires managed main transport');
  const expected:ExpectedMigration[]=config.profile.migrations.map(({version,path})=>{
    const checksum=sha256(readFileSync(path));
    if(config.binding.migrationSha256[path]!==checksum)throw new KernelError('CONFIG_INVALID','Migration source changed');
    return {version,checksum};
  });
  const database=new RuntimeDatabase(config),controller=new AbortController();
  const stop=()=>controller.abort();
  const timer=setTimeout(stop,Math.max(0,jobDeadlineAtMs-Date.now()));timer.unref();
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  try{
    const auth=createRuntimeSessionAuth(config,database);
    await awaitDatabaseStartup(()=>database.assertRuntimeBoundary(expected,runtimeMigrationPolicy(auth.originSwitchCampaign)));
    const configuredBucket=process.env.PROJED_MEETING_AUDIO_BUCKET;
    const getAccessToken=createServiceAccessTokenProvider();
    const audioStorage=createManagedMeetingAudioStorage(configuredBucket,getAccessToken);
    const cleanupEnabled=audioStorage!==undefined;
    // Maintenance remains available without provider qualification or Session
    // publication. New paid work additionally requires both actual bindings.
    const dispatchEnabled=hasQualifiedMeetingAsrBinding(CURRENT_MEETING_ASR_BINDING,configuredBucket)
      &&typeof auth.resolveMeetingRunActor==='function';
    const resolveActor=auth.resolveMeetingRunActor??(async()=>{throw new KernelError('IDENTITY_CONTRACT_UNAVAILABLE','Session contract is unpublished',503);});
    const repository=(runId:string)=>createPostgresMeetingAsrRepository({runId,database,config,resolveActor});
    const control=createPostgresMeetingAsrControl({database,config});
    // Retention does not borrow a user's Session or call an inference provider.
    // Run once before paid work so a busy queue cannot starve due obligations.
    const cleanup=await runMeetingAudioCleanupHost({repository:createPostgresMeetingAudioCleanupRepository({database,config}),
      storageEnabled:cleanupEnabled,...(audioStorage?{storage:audioStorage}:{}),deadlineAtMs:jobDeadlineAtMs},controller.signal);
    let speechProvider:ReturnType<typeof createGoogleCloudSpeechProvider>|undefined;
    const discussionControl=createPostgresMeetingDiscussionControl({database,config});
    const llmBinding=CURRENT_MEETING_LLM_BINDING;
    const llmDispatchEnabled=hasQualifiedMeetingLlmBinding(llmBinding)&&typeof auth.resolveMeetingRunActor==='function';
    const llmProvider=llmDispatchEnabled?createGoogleCloudMeetingProvider({getAccessToken:createServiceAccessTokenProvider()}):null;
    const llmControl=createPostgresMeetingLlmControl({database,config});
    const summary=await runMeetingBackgroundHost({deadlineAtMs:jobDeadlineAtMs,asr:{...control,dispatchEnabled,
      recover:(runId,token)=>repository(runId).recoverExpired(token),
      runUnit:async(runId,signal)=>{
        if(!dispatchEnabled||!audioStorage)throw new KernelError('CONFIG_INVALID','ASR dispatch is unqualified');
        speechProvider??=createGoogleCloudSpeechProvider({getAccessToken});
        return runMeetingAsrUnit({storage:audioStorage,provider:speechProvider,repository:repository(runId)},signal);
      },
    },discussion:{...discussionControl,
      ...(auth.resolveMeetingRunActor?{originalSessionResolver:auth.resolveMeetingRunActor}:{}),
      runUnit:(runId,signal)=>runMeetingDiscussionUnit({
        repository:createPostgresMeetingDiscussionRepository({runId,database,config,resolveActor}),
      },signal),
    },llm:{...llmControl,privateWorkEnabled:typeof auth.resolveMeetingRunActor==='function',
      recover:(runId,token)=>createPostgresMeetingLlmRepository({runId,database,config,resolveActor}).recover(token),
      runNext:(runId,signal)=>createPostgresMeetingLlmPipeline({runId,database,config,resolveActor})(llmProvider,signal),
    }},controller.signal);
    console.log(JSON.stringify({event:'projed_meeting_asr_job_finished',dispatchEnabled,llmDispatchEnabled,...summary,
      cleanupEnabled,cleanup,failures:summary.failures+cleanup.failures}));
    if(summary.failures>0||cleanup.failures>0)process.exitCode=1;
  }finally{
    clearTimeout(timer);process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);
    await database.end();
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  void meetingAsrJobMain().catch(()=>{
    console.error(JSON.stringify({event:'projed_meeting_asr_job_failed',code:'ASR_JOB_UNAVAILABLE'}));
    process.exitCode=1;
  });
}
