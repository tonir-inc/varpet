import { createServer } from '../../apps/editor/node_modules/vite/dist/node/index.js';
const root='/Users/davitstepanyan/Documents/varpet';
const server=await createServer({configFile:false,root,resolve:{alias:[{find:/^three\/addons\//,replacement:root+'/apps/editor/node_modules/three/examples/jsm/'},{find:/^three$/,replacement:root+'/apps/editor/node_modules/three/build/three.module.js'}]},server:{host:'127.0.0.1',port:5198,strictPort:true,hmr:false,fs:{allow:[root]}}});
await server.listen();console.log('Verification server: http://127.0.0.1:5198/output/hand-pan-verification/');
