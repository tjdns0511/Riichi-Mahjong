import { counts } from './core/tiles.js';
import { rankDiscards,twoStep,shantenDetails,ukeire,decompositions,waits } from './core/shanten.js';
/** Expensive suit enumeration never blocks touch interaction. Request IDs allow
 * the view to discard obsolete results when users rapidly edit a hand. */
self.onmessage=({data})=>{
  const {id,task,hand,open=0,known=counts(hand)}=data;
  try{
    let result;
    if(task==='twoStep')result=twoStep(hand,open,known);
    else if(task==='rank')result=rankDiscards(hand,open,known);
    else result={details:shantenDetails(counts(hand),open),rows:hand.length%3===2?rankDiscards(hand,open,known):[],ukeire:hand.length%3===1?ukeire(counts(hand),open,known):null,shapes:decompositions(counts(hand),open),waits:waits(counts(hand),open)};
    self.postMessage({id,result});
  }catch(error){self.postMessage({id,error:error.message});}
};
