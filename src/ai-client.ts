import {fetchAiDecision as requestDecision} from '../lib/web-ai-client.mjs';
export {aiRequestBody,createAiRequestGate,aiReplayInput} from '../lib/web-ai-client.mjs';
export const fetchAiDecision=(body:any,options:{signal?:AbortSignal})=>(requestDecision as any)(body,options);
