import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{fs:{allow:['..']},proxy:{'/api/care-ai':{target:'https://care-preview.shichen-wellness.pages.dev',changeOrigin:true,headers:{Origin:'https://care-preview.shichen-wellness.pages.dev'}}}}});
