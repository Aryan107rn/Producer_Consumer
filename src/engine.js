// Deterministic, single-threaded teaching model of bounded-buffer synchronization.
// It models process scheduling and mutex ownership; it is not a real OS mutex/thread.
const now = () => performance.now();
const stamp = () => new Date().toLocaleTimeString([], {hour12:false}) + '.' + String(new Date().getMilliseconds()).padStart(3,'0');
export class Simulation {
  constructor(onChange=()=>{}, capacity=8) { this.onChange=onChange; this.capacity=capacity; this.reset(); }
  reset() {
    this.buffer=[]; this.pending=[]; this.history=[]; this.logs=[]; this.seq=0; this.eventNo=0; this.running=false; this.stepMode=false;
    this.mutex=null; this.cs=null; this.activeEvent=null; this.consumerStage=0; this.pState='IDLE'; this.cState='WAITING'; this.waitP=0; this.waitC=0;
    this.produced=0; this.inserted=0; this.consumed=0; this.processed=0; this.peak=0; this.pBlocked=0; this.cBlocked=0;
    this.mutexCount=0; this.csEntries=0; this.csTotal=0; this.latencies=[]; this.maxWait=0; this.races=0; this.lost=0;
    this.game={health:100,ammo:30,score:0,eliminations:0,hits:0,shots:0,alive:8,state:'LOBBY',zone:100};
    this.flowStage='game';this.flowEvent=null;
    this.lastSample=now(); this.startedAt=this.lastSample; this.samples=[{t:Date.now(),full:0,inserted:0,processed:0}]; this.raceCounter=0; this.eventRecords={}; this.explain={title:'Ready',beginner:'Start the battle to create game events.',technical:'The consumer blocks on an empty bounded buffer until a producer inserts an event.'}; this._log('SYSTEM','—','Simulation reset','sync'); this.emit();
  }
  get empty(){return this.capacity-this.buffer.length;} get full(){return this.buffer.length;}
  emit(){this.onChange(this);}
  _log(proc,id,op,kind='buffer',outcome='OK') {
    this.logs.push({time:stamp(),at:now(),seq:++this.seq,proc,id,op,kind,outcome,occupancy:this.full,mutex:this.mutex||'free',empty:this.empty,full:this.full,event:this.eventRecords?.[id]||null});
    if(this.logs.length>800)this.logs.shift();
  }
  produce(type,source='PLAYER',payload={}) {
    const e={id:`E-${String(++this.eventNo).padStart(4,'0')}`,timestamp:Date.now(),createdAt:now(),type,source,payload,status:'GENERATED'};
    this.flowStage='producer';this.flowEvent=e.id;
    this.eventRecords[e.id]=e;
    const recordIds=Object.keys(this.eventRecords);if(recordIds.length>800)delete this.eventRecords[recordIds[0]];
    this.produced++; this._log('PRODUCER',e.id,`${type} generated`,'game'); this.pState='RUNNING';this.emit();
    if(this.full>=this.capacity){this.pending.push(e);this.waitP=this.pending.length;this.pBlocked++;this.pState='BLOCKED · FULL';this._log('PRODUCER',e.id,'Blocked: buffer full','buffer','BLOCKED');}
    else this._insert(e);
    this._sample();
    this.emit(); return e;
  }
  _insert(e){e.status='QUEUED';e.insertedAt=now();this.buffer.push(e);this.flowStage='buffer';this.flowEvent=e.id;this.inserted++;this.peak=Math.max(this.peak,this.full);this.pState='RUNNING';if(this.cWaitStarted){this.maxWait=Math.max(this.maxWait,now()-this.cWaitStarted);this.cWaitStarted=0;this.waitC=0;this.cState='READY';}this._log('PRODUCER',e.id,'Inserted into buffer','buffer');}
  _promote(){while(this.pending.length&&this.full<this.capacity){const e=this.pending.shift();this.waitP=this.pending.length;this._insert(e);}if(this.pending.length){this.pState='BLOCKED · FULL';this.waitP=this.pending.length;}}
  _lock(e) {
    if(this.mutex){this._log('CONSUMER',e.id,`Waiting for mutex owned by ${this.mutex}`,'sync','WAITING');return false;}
    this.mutex='CONSUMER';this.mutexCount++;this._log('CONSUMER',e.id,'Mutex acquired','sync');this.cs={event:e.id,resource:this.resourceFor(e.type),state:'ACQUIRED'};this.cState='ACQUIRING LOCK';return true;
  }
  resourceFor(t){return ({PLAYER_DAMAGED:'player.health',ZONE_DAMAGE:'player.health',PLAYER_HEALED:'player.health',AMMO_COLLECTED:'player.ammo',PLAYER_RELOADED:'player.ammo',PLAYER_ELIMINATED:'score / eliminations',BULLET_HIT:'score / hits',SHOT_FIRED:'player.ammo / shots',ZONE_SHRINK:'safe zone',GAME_STATE_CHANGED:'game.state',PLAYER_MOVED:'authoritative player position'})[t]||'authoritative game state';}
  tick() {
    if(!this.running)return;
    if(!this.activeEvent){
      if(!this.buffer.length){this.cState='BLOCKED · EMPTY';this.waitC=1;this.cWaitStarted=this.cWaitStarted||now();this.cBlocked++;this._log('CONSUMER','—','Blocked: buffer empty','buffer','BLOCKED');this.running=false;this.emit();return;}
      this.activeEvent=this.buffer.shift();this.flowStage='consumer';this.flowEvent=this.activeEvent.id;this._promote();this.consumed++;this.waitC=0;this.consumerStage=1;this.cState='ACQUIRING LOCK';this._log('CONSUMER',this.activeEvent.id,'Removed from buffer (FIFO)','buffer');this._log('CONSUMER',this.activeEvent.id,'Requested mutex','sync');
    } else {
      const e=this.activeEvent;
      if(this.consumerStage===1){if(!this._lock(e)){this.emit();return;}this.flowStage='critical';this.consumerStage=2;this.cs.state='ACQUIRED';}
      else if(this.consumerStage===2){this.flowStage='critical';this.cState='INSIDE CRITICAL SECTION';this.cs.state='INSIDE CRITICAL SECTION';this.cs.enteredAt=now();this.csEntries++;this._log('CONSUMER',e.id,`Entered critical section · ${this.cs.resource}`,'sync');this.consumerStage=3;}
      else if(this.consumerStage===3){this.flowStage='updated';this.cs.state='UPDATING SHARED STATE';this._apply(e);this.processed++;e.status='PROCESSED';e.processedAt=now();const latency=e.processedAt-e.createdAt;this.latencies.push(latency);if(this.latencies.length>300)this.latencies.shift();this.maxWait=Math.max(this.maxWait,e.insertedAt?e.insertedAt-e.createdAt:latency);this._log('CONSUMER',e.id,`Updated ${this.cs.resource}`,'sync');this.consumerStage=4;}
      else if(this.consumerStage===4){this._log('CONSUMER',e.id,'Exited critical section','sync');this.cs.state='EXITING CRITICAL SECTION';this.consumerStage=5;}
      else {this.csTotal+=now()-(this.cs.enteredAt||now());this.mutex=null;this._log('CONSUMER',e.id,'Mutex released','sync');this.history.unshift({...e,latency:e.processedAt-e.createdAt});if(this.history.length>80)this.history.pop();this.explain={title:`${e.id} · ${e.type}`,beginner:`The consumer took ${e.type} from the front of the queue and updated ${this.cs.resource}.`,technical:`FIFO dequeue, mutex acquire, critical-section update, then release. Buffer counters: empty=${this.empty}, full=${this.full}; empty + full = ${this.capacity}.`};this.cs=null;this.activeEvent=null;this.consumerStage=0;this.cState=this.buffer.length?'READY':'WAITING';this._sample();}
    }
    this.emit();
  }
  _apply(e){const p=e.payload||{};switch(e.type){case 'PLAYER_DAMAGED':case 'ZONE_DAMAGE':this.game.health=Math.max(0,this.game.health-(p.amount||0));break;case 'PLAYER_HEALED':this.game.health=Math.min(100,this.game.health+(p.amount||0));break;case 'AMMO_COLLECTED':this.game.ammo=Math.min(90,this.game.ammo+(p.amount||0));break;case 'PLAYER_RELOADED':this.game.ammo=30;break;case 'SHOT_FIRED':this.game.ammo=Math.max(0,this.game.ammo-1);this.game.shots++;break;case 'BULLET_HIT':this.game.hits++;this.game.score+=100;break;case 'PLAYER_ELIMINATED':this.game.eliminations++;this.game.alive=Math.max(1,this.game.alive-1);this.game.score+=250;break;case 'ZONE_SHRINK':this.game.zone=Math.max(18,this.game.zone-(p.amount||5));break;case 'GAME_STATE_CHANGED':this.game.state=p.state||this.game.state;break;}}
  _sample(){const t=now();if(t-this.lastSample>400){this.samples.push({t:Date.now(),full:this.full,inserted:this.inserted,processed:this.processed});if(this.samples.length>90)this.samples.shift();this.lastSample=t;}}
  setRunning(v){this.running=v;this.cState=v?'RUNNING':(this.buffer.length?'PAUSED':'WAITING');this._log('SCHEDULER','—',v?'Consumer resumed':'Consumer paused','sync');this.emit();}
  step(){this.running=true;this.tick();this.running=false;this.emit();}
  stepSync(){if(!this.buffer.length&&!this.activeEvent){this.explain={title:'Consumer is blocked',beginner:'There is no event to consume yet.',technical:'A wait operation on full would block the consumer while full=0.'};this.emit();return;}this.step();}
  clearLogs(){this.logs=[];this.seq=0;this._log('SYSTEM','—','Log cleared','sync');this.emit();}
  raceDemo(){const before=this.raceCounter, expected=before+2;this.races++;this.lost++;this.raceSafe=null;this.comparison=null;this._log('RACE LAB','R-1',`P1 reads ${before}`,'sync','UNSAFE');this._log('RACE LAB','R-2',`P2 reads ${before}`,'sync','UNSAFE');this._log('RACE LAB','R-1',`P1 writes ${before+1}`,'sync','UNSAFE');this._log('RACE LAB','R-2',`P2 writes ${before+1} · lost update`,'sync','RACE');this.raceCounter=before+1;this.race={before,expected,actual:this.raceCounter};this.emit();}
  safeDemo(){const before=this.raceCounter;this.race=null;this.comparison=null;this._log('RACE LAB','S-1','P1 acquires mutex','sync');this.raceCounter++;this._log('RACE LAB','S-1',`P1 writes ${this.raceCounter} and releases mutex`,'sync');this._log('RACE LAB','S-2','P2 acquires mutex','sync');this.raceCounter++;this._log('RACE LAB','S-2',`P2 writes ${this.raceCounter} and releases mutex`,'sync');this.raceSafe={before,expected:before+2,actual:this.raceCounter};this.emit();}
  get throughput(){const mins=Math.max((now()-this.startedAt)/60000,1/60);return {producer:this.inserted/mins,consumer:this.processed/mins};}
  invariant(){return this.empty>=0&&this.full>=0&&this.full<=this.capacity&&this.empty+this.full===this.capacity&&(!this.cs||this.mutex==='CONSUMER');}
}
