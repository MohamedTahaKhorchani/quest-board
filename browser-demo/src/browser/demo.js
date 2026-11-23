export const HOSTED_DEMO=import.meta.env.VITE_HOSTED_DEMO==='true';
export function profileForRole(input){const role=['student','organizer','moderator'].includes(input)?input:'student';return {id:`demo-${role}`,name:`Demo ${role}`,email:`${role}@example.invalid`,roles:[role]};}
export function demoSession(role){const p=profileForRole(role);return {token:`local-${p.id}`,userId:p.id,expiresAt:new Date(Date.now()+86400000).toISOString()};}
export function roleFromLocation(search,stored){const requested=new URLSearchParams(search||'').get('role');return ['student','organizer','moderator'].includes(requested)?requested:profileForRole(stored).roles[0];}
function validStore(key, value) {
  const record = x => x && typeof x === 'object' && !Array.isArray(x);
  const count = x => Number.isInteger(x) && x > 0;
  const entry = x => record(x) && typeof x.id === 'string';
  const arrayMap = (x, check) => record(x) && Object.values(x).every(a => Array.isArray(a) && a.every(check));
  if (!record(value)) return false;
  if (key.includes('.quests.')) return Array.isArray(value.items)
    && value.items.every(x => entry(x) && typeof x.title === 'string')
    && arrayMap(value.participationsByUser, x => entry(x) && typeof x.itemId === 'string' && typeof x.status === 'string')
    && arrayMap(value.savedByUser, x => typeof x === 'string')
    && count(value.nextItemId) && count(value.nextParticipationId);
  if (key.includes('.proofs.')) return Array.isArray(value.submissions)
    && value.submissions.every(entry) && count(value.nextId);
  if (key.includes('.rewards.')) return Array.isArray(value.rewards)
    && value.rewards.every(entry) && record(value.users)
    && Object.values(value.users).every(x => record(x) && Array.isArray(x.badges)
      && x.badges.every(record) && Array.isArray(x.claimedRewardIds)
      && Number.isFinite(x.earnedPoints) && Number.isFinite(x.spendablePoints))
    && Array.isArray(value.claims) && value.claims.every(record) && count(value.nextRewardId);
  if (key.includes('.discussions.')) return Array.isArray(value.threads)
    && value.threads.every(x => entry(x) && typeof x.scope === 'string' && typeof x.title === 'string'
      && typeof x.body === 'string' && record(x.author))
    && arrayMap(value.replies, x => entry(x) && typeof x.body === 'string' && record(x.author))
    && Array.isArray(value.seededScopes) && value.seededScopes.every(x => typeof x === 'string')
    && count(value.nextId);
  return true;
}
export function createDemoStorage(storage,onError=()=>{}){const memory=new Map();const full=k=>'hosted-demo:'+k;return {
 getItem(k){let raw;if(memory.has(k))raw=memory.get(k);else try{raw=storage.getItem(full(k))}catch{onError();raw=null}if(raw==null)return null;try{const value=JSON.parse(raw);if(!validStore(k,value))return null;return raw}catch{return null}},
 setItem(k,v){try{storage.setItem(full(k),v)}catch{onError()}memory.set(k,v)},
 removeItem(k){try{storage.removeItem(full(k))}catch{onError()}memory.set(k,null)},
};}
let blocked=false;let storage;try{storage=globalThis.localStorage}catch{storage=null}
export const demoStorage=createDemoStorage(storage,()=>{blocked=true;globalThis.dispatchEvent?.(new Event('demo-storage-warning'))});
export const storageIsTemporary=()=>blocked;
export function getDemoRole(){try{return roleFromLocation(globalThis.location?.search,JSON.parse(demoStorage.getItem('persona')||'{}').role)}catch{return 'student'}}
export function chooseDemoRole(role){demoStorage.setItem('persona',JSON.stringify({role:profileForRole(role).roles[0]}));}
export function sampleEvidenceFile(){return new Promise((resolve,reject)=>{const c=document.createElement('canvas');c.width=720;c.height=420;const g=c.getContext('2d');if(!g){reject(Error('Sample image creation is unavailable.'));return}g.fillStyle='#e9f3e7';g.fillRect(0,0,720,420);g.fillStyle='#28552f';g.font='bold 36px sans-serif';g.fillText('QuestBoard sample evidence',36,100);g.font='24px sans-serif';g.fillText('Browser demonstration only',36,170);g.fillText('No real quest participation is claimed.',36,220);c.toBlob(blob=>blob?resolve(new File([blob],'demo-evidence.png',{type:'image/png'})):reject(Error('Sample image creation failed.')),'image/png')})}
