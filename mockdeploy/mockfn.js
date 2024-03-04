import {Config} from "sst/node/config";

export const handler = async () => ({res: Config.VAL});