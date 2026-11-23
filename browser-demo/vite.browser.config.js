import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
const names=['HOSTED_DEMO','QUESTS_ENABLED','CATALOGUE_ENABLED','QUESTS_DEMO','PROOFS_DEMO','REWARDS_DEMO','DISCUSSIONS_DEMO'];
const define=Object.fromEntries(names.map(n=>[`import.meta.env.VITE_${n}`,JSON.stringify('true')]));
for(const n of ['PROOFS_API','MODERATION_API','REWARDS_API','DISCUSSIONS_API','ROLE_REQUESTS_ENABLED'])define[`import.meta.env.VITE_${n}`]=JSON.stringify('false');
define['import.meta.env.VITE_API_BASE_URL']=JSON.stringify('');
export default defineConfig({plugins:[react()],define,cacheDir:'node_modules/.vite-browser',server:{host:'127.0.0.1',port:4195,strictPort:true},build:{outDir:'dist',emptyOutDir:true}});
