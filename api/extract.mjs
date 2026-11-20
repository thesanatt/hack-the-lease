import { extract } from '../web/api.mjs';
import { post } from './_wrap.mjs';
export const config = { maxDuration: 60 };
export default post(extract);
