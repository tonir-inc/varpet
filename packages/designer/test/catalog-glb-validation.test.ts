import {test,expect} from 'vitest';
const modules=import.meta.glob('../src/catalog-acceleration.ts',{eager:true});
function triangle(bad=false){
 const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{byteLength:36}],bufferViews:[{buffer:0,byteLength:36,target:34962}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}]};
 const text=JSON.stringify(doc),json=Buffer.from(text.padEnd(Math.ceil(text.length/4)*4,' ')),binary=Buffer.alloc(36);
 [0,0,0,1,0,0,0,1,bad?NaN:0].forEach((n,i)=>binary.writeFloatLE(n,i*4));
 const out=Buffer.alloc(12+8+json.length+8+binary.length);out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);
 out.writeUInt32LE(binary.length,20+json.length);out.writeUInt32LE(0x004e4942,24+json.length);binary.copy(out,28+json.length);return out;
}
test('curation rejects invalid binary geometry, even with valid header and claimed bounds',async()=>{
 const api:any=Object.values(modules)[0];expect(typeof api.verifiedGlb).toBe('function');
 expect(await api.verifiedGlb(triangle())).toBe(true);expect(await api.verifiedGlb(triangle(true))).toBe(false);
 expect(await api.verifiedGlb(Buffer.from('not gltf'))).toBe(false);
});
