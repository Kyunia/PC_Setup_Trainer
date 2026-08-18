import {placedCounts} from './tiling.mjs';
import {strictMinimal,canonicalSolutionOrder} from './minimal.mjs';

export const PER_SAVE_DISPLAY_ORDER='TILJSZO';

function counter(sequence){
  const counts=new Map();
  for(const piece of sequence)counts.set(piece,(counts.get(piece)||0)+1);
  return counts;
}

function normalizeCases(queues){
  return queues.map((entry,index)=>typeof entry==='string'?{caseId:`legacy:${index}`,queue:entry}:entry);
}

export function unusedPieceForSolution(queue,solution){
  const available=counter(queue),used=placedCounts(solution),left=[];
  for(const piece of PER_SAVE_DISPLAY_ORDER){
    const remaining=(available.get(piece)||0)-(used.get(piece)||0);
    if(remaining<0)throw new Error(`solution uses more ${piece} pieces than queue provides`);
    for(let i=0;i<remaining;i++)left.push(piece);
  }
  if(left.length!==1)throw new Error(`expected exactly one saved piece, got ${left.length}`);
  return left[0];
}

export function perSaveLabel(piece,{pcSuccess,success,saveRate,guaranteed}){
  if(guaranteed)return `☆ Save ${piece}`;
  if(pcSuccess===0||saveRate===null)return `Save ${piece} (N/A)`;
  return `Save ${piece} (${(saveRate*100).toFixed(2)}%)`;
}

export function calculatePerSaveMinimalsFromBoard({board,queues,solver,useHold=true,displayOrder=PER_SAVE_DISPLAY_ORDER}){
  const cases=normalizeCases(queues);
  const coverageByPiece=new Map([...displayOrder].map(piece=>[piece,new Map()]));
  const byKey=new Map(),solutionsByQueue=new Map();
  let pcSuccess=0;

  for(const entry of cases){
    let solutions=solutionsByQueue.get(entry.queue);
    if(!solutions){
      solutions=canonicalSolutionOrder(solver.enumeratePc(board,entry.queue,useHold));
      solutionsByQueue.set(entry.queue,solutions);
    }
    if(solutions.length===0)continue;
    pcSuccess++;

    for(const solution of solutions){
      byKey.set(solution.key,solution);
      const saved=unusedPieceForSolution(entry.queue,solution);
      let keys=coverageByPiece.get(saved).get(entry.caseId);
      if(!keys){keys=new Set();coverageByPiece.get(saved).set(entry.caseId,keys)}
      keys.add(solution.key);
    }
  }

  const results={};
  for(const piece of displayOrder){
    const coverage=coverageByPiece.get(piece),success=coverage.size;
    const saveRate=pcSuccess===0?null:success/pcSuccess;
    const guaranteed=pcSuccess>0&&success===pcSuccess;
    let minimalCount=0,keys=[],solutions=[],coverageCounts=[];

    if(success>0){
      const minimal=strictMinimal(coverage);
      if(Number.isFinite(minimal.count)&&minimal.sets.length){
        minimalCount=minimal.count;
        keys=[...minimal.sets[0]];
        solutions=keys.map(key=>byKey.get(key));
        coverageCounts=keys.map(key=>{
          let count=0;
          for(const set of coverage.values())if(set.has(key))count++;
          return count;
        });
      }
    }

    const data={
      piece,
      success,
      pcSuccess,
      total:cases.length,
      saveRate,
      guaranteed,
      minimalCount,
      keys,
      solutions,
      coverageCounts,
      coverage,
    };
    data.label=perSaveLabel(piece,data);
    results[piece]=data;
  }

  return{
    board,
    queues:cases.map(entry=>entry.queue),
    total:cases.length,
    pcSuccess,
    pcRate:cases.length===0?null:pcSuccess/cases.length,
    results,
  };
}
