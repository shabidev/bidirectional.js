import {
  str,
} from './names';
import {
  tvar,
  tfuns,
  tforalls,
  showType,
} from './types';
import {
  vr,
  apps,
  abss,
  anno,
  showTerm,
} from './terms';
import {
  Entry,
  showContext,
  ctvar,
  cvar,
} from './context';
import { infer } from './typechecker';
import { time } from './util';

const x = str('x');
const y = str('y');

const ctx: Entry[] = [
  ctvar(str('Void')),
  cvar(str('void'), tforalls([x], tfuns([tvar(str('Void')), tvar(x)]))),

  ctvar(str('Unit')),
  cvar(str('unit'), tvar(str('Unit'))),

  ctvar(str('Bool')),
  cvar(str('true'), tvar(str('Bool'))),
  cvar(str('false'), tvar(str('Bool'))),

  ctvar(str('Nat')),
  cvar(str('z'), tvar(str('Nat'))),
  cvar(str('s'), tfuns([tvar(str('Bool')), tvar(str('Bool'))])),
];

const tm = apps([
  anno(abss([x], vr(x)), tfuns([tvar(str('Bool')), tvar(str('Bool'))])),
  vr(str('true'))
]);
console.log(showTerm(tm));
try {
  const res = time(() => infer(ctx, tm));
  console.log(showType(res.val.type));
  console.log(showContext(res.val.ctx));
  console.log(`${res.time}ms`);
} catch(e) {
  console.log('' + e);
}
