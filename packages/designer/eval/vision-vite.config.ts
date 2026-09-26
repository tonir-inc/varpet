/** Static evaluation surface: file writes/HMR must not reset a screenshot in flight. */
export default {
 root:new URL('../../../apps/editor',import.meta.url).pathname,
 server:{host:'127.0.0.1',port:5262,strictPort:true,hmr:false,watch:null,fs:{allow:[new URL('../../../',import.meta.url).pathname]}},
};
