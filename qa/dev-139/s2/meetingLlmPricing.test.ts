import assert from 'node:assert/strict';
import test from 'node:test';

import {meetingLlmCharge,meetingLlmReservation} from '../../../server/meetingLlmPricing.js';

test('maximum prompt plus candidate and thought allowances fit the fixed generation reserve',()=>{
  const charge=meetingLlmCharge('match',{
    promptTokens:1_048_576,candidateTokens:65_536,thoughtTokens:65_536,totalTokens:1_179_648,
  });
  const reserve=meetingLlmReservation('match');
  assert.equal(reserve,111_000_000n);
  assert.equal(charge,110_100_480n);
  assert.ok(charge!==null&&charge<=reserve);
});

test('thought tokens are charged at the same output rate as candidate tokens',()=>{
  const candidateOnly=meetingLlmCharge('compose',{
    promptTokens:10,candidateTokens:50,thoughtTokens:0,totalTokens:60,
  });
  const splitOutput=meetingLlmCharge('compose',{
    promptTokens:10,candidateTokens:20,thoughtTokens:30,totalTokens:60,
  });
  assert.equal(candidateOnly,18_600n);
  assert.equal(splitOutput,candidateOnly);
});

test('embedding reservation covers maximum UTF-8 bytes, token count, and billable-character measure',()=>{
  const query='🧪'.repeat(800);
  const queryUtf8Bytes=new TextEncoder().encode(query).length;
  assert.equal(query.length,1_600);
  assert.equal(Array.from(query).length,800);
  assert.equal(queryUtf8Bytes,3_200);
  const charge=meetingLlmCharge('retrieve',{
    tokenCount:2_048,billableCharacterCount:4_096,
  },queryUtf8Bytes);
  assert.equal(meetingLlmReservation('retrieve'),30_000n);
  assert.equal(charge,24_576n);
  assert.ok(charge!==null&&charge<=meetingLlmReservation('retrieve'));
});

test('supplementary text bytes participate in the embedding maximum measure',()=>{
  const query='A'+('🧪'.repeat(799));
  const queryUtf8Bytes=new TextEncoder().encode(query).length;
  assert.equal(Array.from(query).length,800);
  assert.equal(queryUtf8Bytes,3_197);
  assert.equal(meetingLlmCharge('retrieve',{
    tokenCount:100,billableCharacterCount:3_000,
  },queryUtf8Bytes),19_182n);
});

test('missing, inconsistent, or out-of-bound usage stays unknown',()=>{
  const unknown=[
    meetingLlmCharge('retrieve',null,3_200),
    meetingLlmCharge('retrieve',{tokenCount:2_049},3_200),
    meetingLlmCharge('retrieve',{tokenCount:1,billableCharacterCount:4_097},3_200),
    meetingLlmCharge('retrieve',{tokenCount:1},3_201),
    meetingLlmCharge('match',{candidateTokens:1,totalTokens:1}),
    meetingLlmCharge('match',{promptTokens:10,candidateTokens:1,thoughtTokens:1,totalTokens:11}),
    meetingLlmCharge('match',{promptTokens:10,cachedTokens:11,candidateTokens:1,totalTokens:11}),
    meetingLlmCharge('match',{promptTokens:10,candidateTokens:65_537,thoughtTokens:0,totalTokens:65_547}),
  ];
  assert.deepEqual(unknown,Array.from({length:unknown.length},()=>null));
});
