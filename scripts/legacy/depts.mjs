import { db } from './db.mjs';
const d = await db.collection('departments').orderBy('order').get();
d.forEach((x) => console.log(x.id, x.data().order, x.data().name, x.data().hidden ? 'HIDDEN' : ''));
const j = (await db.collection('jobs').where('jobNumber', '==', '43894').get()).docs[0]?.data();
console.log(JSON.stringify(j, null, 1).slice(0, 2500));
