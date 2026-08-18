const PIECE_CODE={I:0,J:1,L:2,O:3,S:4,T:5,Z:6};
function queueBits(queue){let bits=0n;for(let index=0;index<queue.length;index+=1){const value=PIECE_CODE[queue[index]];if(value===undefined)throw new Error(`bad piece ${queue[index]}`);bits|=BigInt(value)<<BigInt(index*3)}return bits}
async function bytesFor(url){const response=await fetch(url);if(!response.ok)throw new Error(`fetch ${url}: ${response.status}`);return new Uint8Array(await response.arrayBuffer())}
let wasmExportsPromise,legalBytesPromise;
async function loadWasmExports(){wasmExportsPromise??=(async()=>{const wasm=await bytesFor(new URL('./wasm/pc_wasm.wasm',import.meta.url));const{instance}=await WebAssembly.instantiate(wasm,{});return instance.exports})();return wasmExportsPromise}
async function loadLegalBytes(){legalBytesPromise??=bytesFor(new URL('./wasm/legal_boards_4.lgb',import.meta.url));return legalBytesPromise}
export async function loadWasmAssets(includeLegal=false){const exports=await loadWasmExports(),legal=includeLegal?await loadLegalBytes():null;return{exports,legal}}
export class WasmPcSolver{
 constructor(exports,height,legalBytes=null){this.e=exports;this.ptr=exports.solver_new(height);this.height=height;if(!this.ptr)throw new Error(`unsupported height ${height}`);if(height===4&&legalBytes)this.loadLegal(legalBytes)}
 loadLegal(bytes){const pointer=this.e.wasm_alloc(bytes.length);new Uint8Array(this.e.memory.buffer,pointer,bytes.length).set(bytes);try{if(!this.e.solver_load_legal_pack(this.ptr,pointer,bytes.length))throw new Error('invalid legal-board pack')}finally{this.e.wasm_dealloc(pointer,bytes.length)}}
 canPc(board,queue,useHold=true){return!!this.e.solver_can_pc(this.ptr,board,queueBits(queue),queue.length,useHold?1:0)}
 enumeratePc(board,queue,useHold=true){const count=Number(this.e.solver_enumerate_pc(this.ptr,board,queueBits(queue),queue.length,useHold?1:0)),solutions=[];for(let index=0;index<count;index+=1){const masks=[];for(let piece=0;piece<7;piece+=1)masks.push(this.e.solver_solution_mask(this.ptr,index,piece));solutions.push({masks,key:masks.map(value=>value.toString(16)).join(':')})}return solutions}
 legalCount(stage){return Number(this.e.solver_legal_count(this.ptr,stage))}
 stats(){return{nodes:Number(this.e.solver_nodes(this.ptr)),cacheHits:Number(this.e.solver_cache_hits(this.ptr)),cacheMisses:Number(this.e.solver_cache_misses(this.ptr)),legalRejects:Number(this.e.solver_legal_rejects(this.ptr)),cacheEntries:Number(this.e.solver_cache_entries?.(this.ptr)??0)}}
 close(){if(this.ptr){this.e.solver_free(this.ptr);this.ptr=0}}
}
export async function createWasmSolver(height=4,{legal=true}={}){const assets=await loadWasmAssets(height===4&&legal);return new WasmPcSolver(assets.exports,height,assets.legal)}
