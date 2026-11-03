import { getMap, measureMap } from '../packages/shared/src/index';
for (const id of process.argv.slice(2)) console.log(id, JSON.stringify(measureMap(getMap(id))));
