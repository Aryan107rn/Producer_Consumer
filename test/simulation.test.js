import test from 'node:test';
import assert from 'node:assert/strict';
import {Simulation} from '../src/engine.js';
import {Arena} from '../src/game.js';

const drainEvent = sim => { for(let i=0;i<6;i++) sim.stepSync(); };

test('buffer counters preserve the bounded-buffer invariant and full producer is deferred',()=>{
  const s=new Simulation(()=>{},2);
  s.produce('SHOT_FIRED','PLAYER');s.produce('SHOT_FIRED','PLAYER');const pending=s.produce('SHOT_FIRED','PLAYER');
  assert.equal(s.full,2);assert.equal(s.empty,0);assert.equal(s.pending.length,1);assert.equal(s.pending[0],pending);assert.equal(s.pBlocked,1);assert.equal(s.invariant(),true);
  s.stepSync();assert.equal(s.buffer.length,2);assert.equal(s.pending.length,0);assert.equal(s.buffer.at(-1).id,pending.id);assert.equal(s.invariant(),true);
});

test('consumer removes events FIFO and holds a single mutex through the critical section',()=>{
  const s=new Simulation(()=>{},4),a=s.produce('PLAYER_HEALED','PICKUP',{amount:10}),b=s.produce('AMMO_COLLECTED','PICKUP',{amount:5});
  s.stepSync();assert.equal(s.activeEvent.id,a.id);assert.equal(s.full,1);
  s.stepSync();assert.equal(s.mutex,'CONSUMER');assert.equal(s.invariant(),true);
  s.stepSync();assert.equal(s.cs.state,'INSIDE CRITICAL SECTION');
  s.stepSync();assert.equal(s.game.health,100);assert.equal(s.game.ammo,30);
  s.stepSync();assert.equal(s.mutex,'CONSUMER');
  s.stepSync();assert.equal(s.mutex,null);assert.equal(s.history[0].id,a.id);
  drainEvent(s);assert.equal(s.history[0].id,b.id);assert.equal(s.game.ammo,35);assert.equal(s.processed,2);assert.equal(s.invariant(),true);
});

test('empty consumer blocks until a producer supplies an event',()=>{
  const s=new Simulation(()=>{});s.setRunning(true);s.tick();assert.equal(s.running,false);assert.equal(s.cState,'BLOCKED · EMPTY');assert.equal(s.cBlocked,1);
  s.produce('PLAYER_HEALED','PICKUP',{amount:1});s.stepSync();assert.equal(s.activeEvent.type,'PLAYER_HEALED');
});

test('race lab reproduces lost update and safe comparison serializes increments without touching match',()=>{
  const s=new Simulation(()=>{});s.game.eliminations=4;s.raceDemo();assert.equal(s.race.expected,2);assert.equal(s.race.actual,1);assert.equal(s.game.eliminations,4);assert.equal(s.lost,1);
  s.safeDemo();assert.equal(s.raceSafe.actual,s.raceSafe.expected);assert.equal(s.game.eliminations,4);
});

test('reset restores empty buffer, free mutex, clean counters and configured capacity',()=>{
  const s=new Simulation(()=>{},5);s.produce('SHOT_FIRED');s.stepSync();s.reset();assert.equal(s.capacity,5);assert.equal(s.full,0);assert.equal(s.empty,5);assert.equal(s.mutex,null);assert.equal(s.produced,0);assert.equal(s.invariant(),true);
});

test('arena initializes, moves, aims, fires and submits gameplay events',()=>{
  const previous=globalThis.addEventListener;globalThis.addEventListener=()=>{};
  const context=new Proxy({}, {get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const canvas={getContext:()=>context,addEventListener:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:1000,height:580})};
  const s=new Simulation(()=>{}),game=new Arena(canvas,s);game.start();game.keys.w=true;game.moveEvent=-1e9;game.update(.1);
  assert.ok(game.player.y<290);assert.ok(s.logs.some(e=>e.op.includes('PLAYER_MOVED')));
  game.keys.w=false;game.mouse.down=true;game.update(.24);
  assert.equal(game.player.ammo,29);assert.ok(game.bullets.length>0);assert.ok(s.logs.some(e=>e.op.includes('SHOT_FIRED')));
  game.mouse.down=false;if(previous)globalThis.addEventListener=previous;else delete globalThis.addEventListener;
});
