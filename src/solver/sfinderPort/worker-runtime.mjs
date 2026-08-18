import{decoder}from'tetris-fumen';
import{boardFromFumenPage,highestOccupiedRow,popcount}from'./board.mjs';
import{combineWithIntro,solutionPage}from'./fumen.mjs';
import{canonicalSolutionOrder}from'./minimal.mjs';
import{calculatePerSaveMinimals,encodePerSaveMinimals,resolvePerSaveTargetLines}from'./per-save-minimals.mjs';
import{expandPattern}from'./pattern.mjs';
import{loadWasmAssets,WasmPcSolver}from'./wasm-backend.mjs';

const solvers=new Map();
async function getSolver(height){let solver=solvers.get(height);if(solver)return solver;const assets=await loadWasmAssets(height===4);solver=new WasmPcSolver(assets.exports,height,assets.legal);solvers.set(height,solver);return solver}

function geometry(sourceFumen,targetLines){const page=decoder.decode(sourceFumen)[0];if(!page)throw new Error('empty fumen');const highest=highestOccupiedRow(page);if(highest>=4)throw new Error(`board height ${highest+1} exceeds the 4-row solver`);if(highest>=targetLines)throw new Error(`board height ${highest+1} exceeds targetLines ${targetLines}`);const board=boardFromFumenPage(page,targetLines),occupiedCells=popcount(board),remainingCells=targetLines*10-occupiedCells;if(remainingCells<=0||remainingCells%4!==0)throw new Error(`current board cannot complete a ${targetLines}-line PC`);return{page,board,occupiedCells,remainingCells,piecesNeeded:remainingCells/4}}

async function perSave(input,targetLines){const solver=await getSolver(targetLines);geometry(input.sourceFumen,targetLines);const calculation=calculatePerSaveMinimals({...input,solver,targetLines});const encoded=encodePerSaveMinimals({sourceFumen:input.sourceFumen,title:input.title??'',calculation}),results={};for(const[piece,result]of Object.entries(calculation.results))results[piece]={piece:result.piece,success:result.success,pcSuccess:result.pcSuccess,total:result.total,saveRate:result.saveRate,guaranteed:result.guaranteed,minimalCount:result.minimalCount,coverageCounts:result.coverageCounts,label:result.label};return{targetLines:calculation.targetLines,occupiedCells:calculation.occupiedCells,remainingCells:calculation.remainingCells,piecesNeeded:calculation.piecesNeeded,expectedQueueLength:calculation.expectedQueueLength,total:calculation.total,pcSuccess:calculation.pcSuccess,pcRate:calculation.pcRate,results,pageCounts:encoded.pageCounts,fumen:encoded.fumen}}

async function solveOne(input,targetLines){const current=geometry(input.sourceFumen,targetLines),queues=expandPattern(input.pattern);if(queues.length!==1)throw new Error('solve-one requires one exact queue');const queue=queues[0];if(queue.length!==current.piecesNeeded)throw new Error(`queue length is incompatible with this board: expected see${current.piecesNeeded}, got ${queue.length}`);const solver=await getSolver(targetLines),solution=canonicalSolutionOrder(solver.enumeratePc(current.board,queue,input.useHold!==false))[0];if(!solution)return{targetLines,occupiedCells:current.occupiedCells,piecesNeeded:current.piecesNeeded,solutionCount:0,fumen:null};const page=solutionPage(current.board,solution,'Solution',targetLines);return{targetLines,occupiedCells:current.occupiedCells,piecesNeeded:current.piecesNeeded,solutionCount:1,fumen:combineWithIntro(input.sourceFumen,input.title??'', [page])}}

export async function runWorkerRequest(request){const targetLines=resolvePerSaveTargetLines(request.input);if(request.kind==='per-save-minimals')return perSave(request.input,targetLines);if(request.kind==='solve-one')return solveOne(request.input,targetLines);throw new Error(`unknown request ${request.kind}`)}
